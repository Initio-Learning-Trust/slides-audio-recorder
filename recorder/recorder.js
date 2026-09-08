/**
 * The recorder window.
 *
 * Why this page exists: Google serves add-on sidebars inside a sandboxed
 * iframe whose Permissions-Policy omits `microphone`, so getUserMedia() throws
 * a policy violation there no matter what the user allows. A top-level window
 * on our own origin has no such restriction. This page captures audio, encodes
 * a WAV in memory, and hands the bytes back to the sidebar over postMessage.
 *
 * It holds no credentials, sets no cookies, writes no storage and talks to no
 * server. Everything it knows arrives in the launch URL.
 */
(function () {
  'use strict';

  var params = SarProtocol.parseLaunchParams(location.search);
  var peer = window.opener;
  var acknowledged = false;

  var el = {
    standalone: document.getElementById('panel-standalone'),
    record: document.getElementById('panel-record'),
    context: document.getElementById('context'),
    wave: document.getElementById('wave'),
    meterFill: document.getElementById('meter-fill'),
    timer: document.getElementById('timer'),
    status: document.getElementById('status'),
    btnRecord: document.getElementById('btn-record'),
    btnStop: document.getElementById('btn-stop'),
    review: document.getElementById('review'),
    preview: document.getElementById('preview'),
    label: document.getElementById('label'),
    btnUse: document.getElementById('btn-use'),
    btnAgain: document.getElementById('btn-again'),
    sizeHint: document.getElementById('size-hint'),
    sent: document.getElementById('sent'),
    btnAnother: document.getElementById('btn-another'),
    btnClose: document.getElementById('btn-close'),
    error: document.getElementById('error')
  };

  var state = {
    stream: null,
    context: null,
    node: null,
    source: null,
    blocks: [],
    sampleCount: 0,
    peaks: [],
    startedAt: 0,
    recording: false,
    finishing: false,
    wav: null,
    previewUrl: null,
    tick: null
  };

  // ---------------------------------------------------------------- plumbing

  /**
   * Sends a protocol message to the sidebar.
   * @param {string} type Message type.
   * @param {Object=} payload Extra fields.
   */
  function post(type, payload) {
    if (!peer || !params.origin) {
      return;
    }
    try {
      peer.postMessage(SarProtocol.envelope(type, params.nonce, payload), params.origin);
    } catch (err) {
      showError('The Slides sidebar is no longer listening. Close this window and press Record again.');
    }
  }

  /**
   * @param {string} message Text to show, or empty to clear.
   */
  function showError(message) {
    if (!message) {
      el.error.hidden = true;
      el.error.textContent = '';
      return;
    }
    el.error.hidden = false;
    el.error.textContent = message;
  }

  /**
   * @param {string} message Status line under the timer.
   */
  function setStatus(message) {
    el.status.textContent = message;
  }

  // ------------------------------------------------------------------ visual

  /** Repaints the scrolling waveform from the captured peaks. */
  function drawWave() {
    var canvas = el.wave;
    var ratio = window.devicePixelRatio || 1;
    var cssWidth = canvas.clientWidth || 640;
    var cssHeight = 96;
    if (canvas.width !== Math.round(cssWidth * ratio)) {
      canvas.width = Math.round(cssWidth * ratio);
      canvas.height = Math.round(cssHeight * ratio);
    }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    var barWidth = 3;
    var gap = 2;
    var slots = Math.floor(cssWidth / (barWidth + gap));
    var visible = state.peaks.slice(-slots);
    var mid = cssHeight / 2;
    var styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles.getPropertyValue('--accent').trim() || '#1a73e8';

    for (var i = 0; i < visible.length; i++) {
      var height = Math.max(2, visible[i] * (cssHeight - 8));
      var x = i * (barWidth + gap);
      ctx.fillRect(x, mid - height / 2, barWidth, height);
    }
  }

  /** Updates the timer and size hint while recording. */
  function updateClock() {
    var elapsed = Date.now() - state.startedAt;
    var seconds = Math.floor(elapsed / 1000);
    el.timer.textContent = Math.floor(seconds / 60) + ':' + (seconds % 60 < 10 ? '0' : '') + (seconds % 60);
    var bytes = WavWriter.wavByteLength(state.sampleCount);
    if (bytes >= params.maxBytes) {
      stopRecording('Reached the maximum recording length.');
    }
  }

  // --------------------------------------------------------------- recording

  /**
   * Opens the microphone and starts capturing.
   * @return {!Promise<void>}
   */
  function startRecording() {
    showError('');
    setStatus('Waiting for microphone permission...');
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
      return attachCapture();
    }).then(function () {
      state.blocks = [];
      state.sampleCount = 0;
      state.peaks = [];
      state.startedAt = Date.now();
      state.recording = true;
      el.btnRecord.hidden = true;
      el.btnRecord.disabled = false;
      el.btnStop.hidden = false;
      el.review.hidden = true;
      el.sent.hidden = true;
      el.btnStop.focus();
      setStatus('Recording. Speak clearly, about 20 cm from the microphone.');
      post(SarProtocol.TYPES.STATE, { state: 'recording' });
      state.tick = setInterval(updateClock, 200);
    }).catch(function (err) {
      el.btnRecord.disabled = false;
      setStatus('Ready when you are.');
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

  /**
   * Wires the capture node, preferring an AudioWorklet.
   * @return {!Promise<void>}
   */
  function attachCapture() {
    var context = state.context;
    if (context.audioWorklet) {
      return context.audioWorklet.addModule('capture-worklet.js').then(function () {
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
    var peak = WavWriter.peakLevel(block);
    state.peaks.push(peak);
    el.meterFill.style.width = Math.round(Math.min(1, peak * 1.6) * 100) + '%';
    drawWave();
  }

  /**
   * Stops capture and moves to the review state.
   *
   * The capture node batches samples, so up to a block of audio is still in
   * flight when the user presses Stop. We ask it to flush and give it a beat to
   * arrive before encoding, otherwise the last word gets clipped.
   *
   * @param {string=} note Optional status note explaining why it stopped.
   */
  function stopRecording(note) {
    if (!state.recording) {
      return;
    }
    state.recording = false;
    state.finishing = true;
    clearInterval(state.tick);
    state.tick = null;
    el.btnStop.disabled = true;
    setStatus('Finishing...');

    if (state.node && state.node.port) {
      state.node.port.postMessage('stop');
    }
    setTimeout(function () {
      finaliseStop(note);
    }, 180);
  }

  /**
   * Tears down the audio graph and encodes what was captured.
   * @param {string=} note Optional status note explaining why it stopped.
   */
  function finaliseStop(note) {
    state.finishing = false;
    el.btnStop.disabled = false;

    if (state.node) {
      try {
        state.node.disconnect();
      } catch (err) { /* already gone */ }
    }
    if (state.source) {
      try {
        state.source.disconnect();
      } catch (err) { /* already gone */ }
    }
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

    el.btnStop.hidden = true;
    el.btnRecord.hidden = false;
    el.meterFill.style.width = '0%';

    if (!state.sampleCount) {
      setStatus('Ready when you are.');
      showError('No audio was captured. Check that the right microphone is selected and try again.');
      return;
    }

    state.wav = {
      buffer: WavWriter.encodeWav(state.blocks, sampleRate),
      sampleRate: sampleRate,
      durationMs: Math.round((state.sampleCount / sampleRate) * 1000)
    };
    state.blocks = [];

    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
    }
    state.previewUrl = URL.createObjectURL(new Blob([state.wav.buffer], { type: 'audio/wav' }));
    el.preview.src = state.previewUrl;

    el.review.hidden = false;
    el.btnUse.disabled = false;
    el.sizeHint.textContent = formatDuration(state.wav.durationMs) + ' - ' +
        formatSize(state.wav.buffer.byteLength);
    setStatus(note || 'Have a listen, then send it to your slide.');
    el.label.focus();
  }

  /** Sends the finished WAV to the sidebar. */
  function sendRecording() {
    if (!state.wav) {
      return;
    }
    if (!peer || peer.closed) {
      showError('The Slides sidebar has closed. Reopen it and press Record again.');
      return;
    }
    el.btnUse.disabled = true;
    setStatus('Sending to Google Slides...');
    post(SarProtocol.TYPES.AUDIO, {
      buffer: state.wav.buffer,
      sampleRate: state.wav.sampleRate,
      durationMs: state.wav.durationMs,
      byteLength: state.wav.buffer.byteLength,
      mimeType: 'audio/wav',
      label: el.label.value.trim()
    });
  }

  /** Resets to the idle state, ready for another take. */
  function resetForAnother() {
    state.wav = null;
    state.sampleCount = 0;
    state.peaks = [];
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = null;
    }
    el.preview.removeAttribute('src');
    el.review.hidden = true;
    el.sent.hidden = true;
    el.timer.textContent = '0:00';
    showError('');
    setStatus('Ready when you are.');
    drawWave();
    el.btnRecord.focus();
  }

  // ------------------------------------------------------------------ format

  /**
   * @param {number} ms Duration in milliseconds.
   * @return {string} m:ss.
   */
  function formatDuration(ms) {
    var seconds = Math.round(ms / 1000);
    return Math.floor(seconds / 60) + ':' + (seconds % 60 < 10 ? '0' : '') + (seconds % 60);
  }

  /**
   * @param {number} bytes Size in bytes.
   * @return {string} Human-readable size.
   */
  function formatSize(bytes) {
    if (bytes < 1024 * 1024) {
      return Math.round(bytes / 1024) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Turns a getUserMedia rejection into advice.
   * @param {!Error} err The rejection.
   * @return {string} Message for the teacher.
   */
  function describeMicError(err) {
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access was blocked. Click the microphone icon in your browser address bar, ' +
             'allow access for this site, then press Record again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No microphone was found. Plug one in or check your system sound settings.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'Your microphone is in use by another application. Close it and press Record again.';
    }
    return 'The microphone could not be opened: ' + (err && err.message ? err.message : 'unknown error') + '.';
  }

  // -------------------------------------------------------------- lifecycle

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
    if (data.type === SarProtocol.TYPES.ACCEPTED) {
      state.wav = null;
      el.review.hidden = true;
      el.sent.hidden = false;
      setStatus('Saved.');
      el.btnAnother.focus();
      return;
    }
    if (data.type === SarProtocol.TYPES.REJECTED) {
      el.btnUse.disabled = false;
      setStatus('Have a listen, then send it to your slide.');
      showError(data.message || 'Google Slides could not save that recording. Please try again.');
    }
  }

  /** Starts the handshake and wires up the UI. */
  function init() {
    if (!peer || !params.origin || !params.nonce) {
      el.record.hidden = true;
      el.standalone.hidden = false;
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showError('This browser cannot record audio. Try the latest Chrome, Edge, Firefox or Safari.');
      el.btnRecord.disabled = true;
    }
    if (params.slide) {
      el.context.textContent = 'for slide ' + params.slide;
    }
    if (params.label) {
      el.label.value = params.label;
    }

    window.addEventListener('message', onMessage);
    post(SarProtocol.TYPES.READY, {});
    setTimeout(function () {
      if (!acknowledged) {
        showError('The Slides sidebar did not answer. Close this window, reopen the sidebar and try again.');
      }
    }, 8000);

    el.btnRecord.addEventListener('click', startRecording);
    el.btnStop.addEventListener('click', function () {
      stopRecording();
    });
    el.btnUse.addEventListener('click', sendRecording);
    el.btnAgain.addEventListener('click', resetForAnother);
    el.btnAnother.addEventListener('click', resetForAnother);
    el.btnClose.addEventListener('click', function () {
      window.close();
    });
    el.label.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        sendRecording();
      }
    });
    window.addEventListener('resize', drawWave);
    window.addEventListener('beforeunload', function (event) {
      post(SarProtocol.TYPES.CLOSING, {});
      if (state.recording || state.wav) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    drawWave();
  }

  init();
}());
