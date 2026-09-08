/**
 * The recording window.
 *
 * Why this page exists: Google serves add-on sidebars inside a sandboxed
 * iframe whose Permissions-Policy omits `microphone`, so getUserMedia() throws
 * a policy violation there no matter what the user allows. A top-level window
 * on our own origin has no such restriction.
 *
 * This window is a microphone and nothing else. It streams live meter values
 * back so the sidebar can draw the waveform, and hands over the finished WAV
 * when stopped; reviewing, naming and inserting all happen in the sidebar. It
 * holds no credentials, sets no cookies, writes no storage and talks to no
 * server. Everything it knows arrives in the launch URL.
 */
(function () {
  'use strict';

  /** Bars in the live meter; must match the sidebar's scope. */
  var LIVE_BARS = 12;

  /** How often meter values are posted to the sidebar, in milliseconds. */
  var LEVEL_INTERVAL_MS = 80;

  /**
   * Content hash stamped into the page by the build, used to bust caches on the
   * worklet the same way it is busted on the page's other assets.
   * @return {string} The version query string, including the leading '?'.
   */
  function assetVersion() {
    var meta = document.querySelector('meta[name="asset-version"]');
    var value = meta && meta.getAttribute('content');
    return value ? '?v=' + value : '';
  }

  var params = SarProtocol.parseLaunchParams(location.search);
  var peer = window.opener;
  var acknowledged = false;

  var el = {
    panels: {},
    context: document.getElementById('context'),
    statusRow: document.getElementById('status-row'),
    clock: document.getElementById('clock'),
    scope: document.getElementById('scope'),
    stack: document.getElementById('stack'),
    btnRecord: document.getElementById('btn-record'),
    hint: document.getElementById('hint'),
    error: document.getElementById('error'),
    note: document.getElementById('note')
  };

  var state = {
    stream: null,
    context: null,
    node: null,
    source: null,
    analyser: null,
    blocks: [],
    sampleCount: 0,
    startedAt: 0,
    recording: false,
    finishing: false,
    sending: false,
    wav: null,
    clockTimer: null,
    levelTimer: null
  };

  // ---------------------------------------------------------------- plumbing

  /**
   * Sends a protocol message to the sidebar.
   * @param {string} type Message type.
   * @param {Object=} payload Extra fields.
   */
  function post(type, payload) {
    if (!peer || peer.closed || !params.origin) {
      return;
    }
    try {
      peer.postMessage(SarProtocol.envelope(type, params.nonce, payload), params.origin);
    } catch (err) {
      showError('The Slides sidebar is no longer listening. Close this window and start again.');
    }
  }

  /**
   * @param {string} name Panel to show.
   */
  function show(name) {
    Object.keys(el.panels).forEach(function (key) {
      if (key === name) {
        el.panels[key].setAttribute('data-active', '');
      } else {
        el.panels[key].removeAttribute('data-active');
      }
    });
  }

  /**
   * @param {string} message Text to show, or empty to clear.
   */
  function showError(message) {
    el.error.hidden = !message;
    el.error.textContent = message || '';
  }

  /**
   * @param {string} message Line under the record button.
   * @param {boolean=} done Style it as a success.
   */
  function setHint(message, done) {
    el.hint.textContent = message;
    el.hint.classList.toggle('is-done', !!done);
  }

  /**
   * @param {number} ms Elapsed milliseconds.
   * @return {string} m:ss.
   */
  function fmt(ms) {
    var seconds = Math.max(0, Math.round(ms / 1000));
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  // --------------------------------------------------------------- recording

  /**
   * Opens the microphone and starts capturing.
   * @return {!Promise<void>}
   */
  function startRecording() {
    showError('');
    setHint('Waiting for microphone permission…');
    el.btnRecord.disabled = true;

    return navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then(function (stream) {
      state.stream = stream;
      state.context = makeContext(params.sampleRate);
      state.source = state.context.createMediaStreamSource(stream);
      attachAnalyser();
      return attachCapture();
    }).then(function () {
      state.blocks = [];
      state.sampleCount = 0;
      state.startedAt = Date.now();
      state.recording = true;

      el.btnRecord.disabled = false;
      el.btnRecord.classList.add('is-recording');
      el.btnRecord.setAttribute('aria-label', 'Stop recording');
      el.stack.classList.add('is-live');
      el.statusRow.hidden = false;
      el.scope.classList.remove('is-idle');
      el.note.textContent = 'Keep this window open until you stop.';
      setHint('Tap to stop');

      post(SarProtocol.TYPES.STATE, { state: 'recording' });
      tick();
      state.clockTimer = setInterval(tick, 250);
      state.levelTimer = setInterval(sendLevels, LEVEL_INTERVAL_MS);
    }).catch(function (err) {
      el.btnRecord.disabled = false;
      setHint('Tap to record');
      showError(describeMicError(err));
    });
  }

  /**
   * Builds an AudioContext at the requested rate, falling back to the default
   * when the browser refuses the rate.
   * @param {number} sampleRate Desired rate in Hz.
   * @return {!AudioContext} The context.
   */
  function makeContext(sampleRate) {
    var Ctor = window.AudioContext || window.webkitAudioContext;
    try {
      return new Ctor({ sampleRate: sampleRate });
    } catch (err) {
      return new Ctor();
    }
  }

  /** Adds the analyser that drives the meter in both windows. */
  function attachAnalyser() {
    try {
      state.analyser = state.context.createAnalyser();
      state.analyser.fftSize = 64;
      state.source.connect(state.analyser);
    } catch (err) {
      state.analyser = null;
    }
  }

  /**
   * Wires the capture node, preferring an AudioWorklet.
   * @return {!Promise<void>}
   */
  function attachCapture() {
    var context = state.context;
    if (context.audioWorklet) {
      return context.audioWorklet.addModule('capture-worklet.js' + assetVersion()).then(function () {
        var node = new AudioWorkletNode(context, 'sar-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 1,
          processorOptions: { blockSize: 2048 }
        });
        node.port.onmessage = function (event) {
          consumeBlock(event.data);
        };
        state.source.connect(node);
        state.node = node;
      }).catch(function () {
        attachScriptProcessor();
      });
    }
    attachScriptProcessor();
    return Promise.resolve();
  }

  /** Legacy capture path for browsers without AudioWorklet. */
  function attachScriptProcessor() {
    var context = state.context;
    var node = context.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = function (event) {
      consumeBlock(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    state.source.connect(node);
    // A ScriptProcessorNode only runs while connected to a destination; the
    // zero gain keeps the microphone from being played back to the room.
    var silence = context.createGain();
    silence.gain.value = 0;
    node.connect(silence);
    silence.connect(context.destination);
    state.node = node;
  }

  /**
   * Accepts one block of samples from the capture node.
   * @param {!Float32Array} block Mono samples.
   */
  function consumeBlock(block) {
    if ((!state.recording && !state.finishing) || !block || !block.length) {
      return;
    }
    state.blocks.push(block);
    state.sampleCount += block.length;
  }

  /** Updates the elapsed time and enforces the size ceiling. */
  function tick() {
    el.clock.textContent = fmt(Date.now() - state.startedAt);
    if (WavWriter.wavByteLength(state.sampleCount) >= params.maxBytes) {
      stopRecording('That is as long as one recording can be.');
    }
  }

  /** Reads the analyser and paints locally, then posts the same values on. */
  function sendLevels() {
    var values = readLevels();
    paintScope(values);
    post(SarProtocol.TYPES.LEVELS, { values: values });
  }

  /**
   * @return {!Array<number>} One value per bar, each 0..1.
   */
  function readLevels() {
    var values = [];
    if (!state.analyser) {
      for (var n = 0; n < LIVE_BARS; n++) {
        values.push(0.2);
      }
      return values;
    }
    var data = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(data);
    var step = Math.floor(data.length / LIVE_BARS) || 1;
    for (var bar = 0; bar < LIVE_BARS; bar++) {
      var peak = 0;
      for (var j = 0; j < step; j++) {
        peak = Math.max(peak, data[bar * step + j] || 0);
      }
      values.push(Math.max(0.14, Math.min(1, peak / 190)));
    }
    return values;
  }

  /**
   * @param {!Array<number>} values One value per bar.
   */
  function paintScope(values) {
    for (var i = 0; i < el.bars.length; i++) {
      el.bars[i].style.transform = 'scaleY(' + (values[i] || 0.14).toFixed(3) + ')';
    }
  }

  /**
   * Stops capture and hands the audio over.
   *
   * The capture node batches samples, so up to a block is still in flight when
   * the user presses stop. We ask it to flush and give it a beat to arrive,
   * otherwise the last word gets clipped.
   *
   * @param {string=} note Optional message explaining why it stopped.
   */
  function stopRecording(note) {
    if (!state.recording) {
      return;
    }
    state.recording = false;
    state.finishing = true;
    clearInterval(state.clockTimer);
    clearInterval(state.levelTimer);
    state.clockTimer = null;
    state.levelTimer = null;
    el.btnRecord.disabled = true;
    setHint('Finishing…');

    if (state.node && state.node.port) {
      state.node.port.postMessage('stop');
    }
    setTimeout(function () {
      finaliseStop(note);
    }, 180);
  }

  /**
   * Tears down the audio graph, encodes the WAV and posts it.
   * @param {string=} note Optional message explaining why it stopped.
   */
  function finaliseStop(note) {
    state.finishing = false;

    [state.node, state.source, state.analyser].forEach(function (node) {
      if (node) {
        try {
          node.disconnect();
        } catch (err) { /* already gone */ }
      }
    });
    if (state.stream) {
      state.stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }

    var sampleRate = state.context ? state.context.sampleRate : params.sampleRate;
    if (state.context && state.context.close) {
      state.context.close();
    }
    state.stream = null;
    state.context = null;
    state.node = null;
    state.source = null;
    state.analyser = null;

    el.btnRecord.classList.remove('is-recording');
    el.btnRecord.setAttribute('aria-label', 'Start recording');
    el.stack.classList.remove('is-live');
    el.statusRow.hidden = true;
    el.scope.classList.add('is-idle');
    paintScope([]);

    if (!state.sampleCount) {
      el.btnRecord.disabled = false;
      setHint('Tap to record');
      showError('No audio was captured. Check that the right microphone is selected and try again.');
      post(SarProtocol.TYPES.STATE, { state: 'idle' });
      return;
    }

    state.wav = {
      buffer: WavWriter.encodeWav(state.blocks, sampleRate),
      sampleRate: sampleRate,
      durationMs: Math.round((state.sampleCount / sampleRate) * 1000)
    };
    state.blocks = [];
    if (note) {
      showError(note);
    }
    sendRecording();
  }

  /** Hands the finished WAV to the sidebar. */
  function sendRecording() {
    if (!state.wav) {
      return;
    }
    if (!peer || peer.closed) {
      el.btnRecord.disabled = false;
      setHint('Tap to record');
      showError('The Slides sidebar has closed, so the recording could not be handed over. ' +
          'Reopen the sidebar and record again.');
      return;
    }
    state.sending = true;
    setHint('Sending to your slide…');
    post(SarProtocol.TYPES.AUDIO, {
      buffer: state.wav.buffer,
      sampleRate: state.wav.sampleRate,
      durationMs: state.wav.durationMs,
      byteLength: state.wav.buffer.byteLength,
      mimeType: 'audio/wav'
    });
  }

  // ------------------------------------------------------------------ errors

  /**
   * Turns a getUserMedia rejection into advice.
   * @param {!Error} err The rejection.
   * @return {string} Message for the teacher.
   */
  function describeMicError(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access was blocked. Click the microphone icon in this window’s address bar, ' +
             'allow access, then tap record again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone was found. Plug one in or check your system sound settings.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Your microphone is in use by another application. Close it and tap record again.';
    }
    return 'The microphone could not be opened: ' + (err && err.message ? err.message : 'unknown error') + '.';
  }

  // --------------------------------------------------------------- lifecycle

  /**
   * Handles messages coming back from the sidebar.
   * @param {!MessageEvent} event The message event.
   */
  function onMessage(event) {
    var data = SarProtocol.accept(event, params.origin, params.nonce);
    if (!data) {
      return;
    }
    if (data.type === SarProtocol.TYPES.ACK) {
      acknowledged = true;
      return;
    }
    if (data.type === SarProtocol.TYPES.STOP) {
      stopRecording();
      return;
    }
    if (data.type === SarProtocol.TYPES.ACCEPTED) {
      state.wav = null;
      state.sending = false;
      setHint('Saved', true);
      el.note.textContent = 'You can close this window.';
      // The sidebar has the audio and is showing it, so this window is done.
      setTimeout(function () {
        window.close();
      }, 900);
      return;
    }
    if (data.type === SarProtocol.TYPES.REJECTED) {
      state.sending = false;
      el.btnRecord.disabled = false;
      setHint('Tap to record');
      showError(data.message || 'Google Slides could not save that recording. Please try again.');
    }
  }

  /** Wires the UI and starts the handshake. */
  function init() {
    document.querySelectorAll('.panel').forEach(function (panel) {
      el.panels[panel.dataset.panel] = panel;
    });
    for (var i = 0; i < LIVE_BARS; i++) {
      el.scope.appendChild(document.createElement('i'));
    }
    el.bars = el.scope.querySelectorAll('i');

    if (!peer || !params.origin || !params.nonce) {
      show('standalone');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot record audio. Try the latest Chrome, Edge, Firefox or Safari.');
      el.btnRecord.disabled = true;
    }
    var context = [];
    if (params.slide) {
      context.push('Slide ' + params.slide);
    }
    if (params.label) {
      context.push(params.label);
    }
    el.context.textContent = context.join(' · ');

    window.addEventListener('message', onMessage);
    post(SarProtocol.TYPES.READY, {});
    setTimeout(function () {
      if (!acknowledged) {
        showError('The Slides sidebar did not answer. Close this window, reopen the sidebar and ' +
            'try again.');
      }
    }, 8000);

    el.btnRecord.addEventListener('click', function () {
      if (state.recording) {
        stopRecording();
      } else if (!state.sending) {
        startRecording();
      }
    });
    window.addEventListener('beforeunload', function (event) {
      post(SarProtocol.TYPES.CLOSING, {});
      if (state.recording || state.wav) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  init();
}());
