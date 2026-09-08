/**
 * The postMessage contract between the Slides sidebar and the recorder window.
 *
 * Both ends validate every message against the same rules: right envelope,
 * right protocol version, right nonce, right origin. The nonce is generated
 * fresh by the sidebar for each recording window and never leaves the two
 * pages, so a stray page that happens to know the origin still cannot inject
 * audio or read it.
 *
 * Loads as a browser global (`window.SarProtocol`) and as a CommonJS module.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.SarProtocol = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Envelope marker; distinguishes our traffic from other frames' chatter. */
  var SOURCE = 'slides-audio-recorder';

  /** Protocol version. Bump when the message shapes change incompatibly. */
  var VERSION = 1;

  var TYPES = {
    READY: 'ready',        // recorder -> sidebar: window is up
    ACK: 'ack',            // sidebar -> recorder: I am listening
    STATE: 'state',        // recorder -> sidebar: idle/recording/stopped
    LEVELS: 'levels',      // recorder -> sidebar: live meter values, ~12/second
    STOP: 'stop',          // sidebar -> recorder: stop recording now
    AUDIO: 'audio',        // recorder -> sidebar: here is the WAV
    ACCEPTED: 'accepted',  // sidebar -> recorder: saved successfully
    REJECTED: 'rejected',  // sidebar -> recorder: save failed, keep the audio
    CLOSING: 'closing'     // recorder -> sidebar: window is going away
  };

  /**
   * Wraps a payload in the protocol envelope.
   * @param {string} type One of TYPES.
   * @param {string} nonce Session nonce.
   * @param {Object=} payload Extra fields.
   * @return {!Object} The message to post.
   */
  function envelope(type, nonce, payload) {
    var message = { source: SOURCE, v: VERSION, type: type, nonce: nonce };
    if (payload) {
      Object.keys(payload).forEach(function (key) {
        message[key] = payload[key];
      });
    }
    return message;
  }

  /**
   * Decides whether an incoming message event may be acted on.
   * @param {{origin: string, data: *}} event The message event.
   * @param {string} expectedOrigin Origin the peer must have.
   * @param {string} expectedNonce Nonce agreed for this session.
   * @return {?Object} The message data when trusted, otherwise null.
   */
  function accept(event, expectedOrigin, expectedNonce) {
    if (!event || event.origin !== expectedOrigin) {
      return null;
    }
    var data = event.data;
    if (!data || typeof data !== 'object') {
      return null;
    }
    if (data.source !== SOURCE || data.v !== VERSION) {
      return null;
    }
    if (!expectedNonce || data.nonce !== expectedNonce) {
      return null;
    }
    if (!data.type || !Object.keys(TYPES).some(function (key) {
      return TYPES[key] === data.type;
    })) {
      return null;
    }
    return data;
  }

  /**
   * Decides whether an origin may be given the recorded audio.
   *
   * In production this is always an https origin (Apps Script serves the
   * sidebar from a googleusercontent.com subdomain). Plain http is accepted
   * only for loopback, which browsers already treat as a secure context, so the
   * end-to-end tests can drive two real origins without certificates.
   *
   * @param {string} origin Candidate origin.
   * @return {boolean} True when the origin may be posted to.
   */
  function isAllowedOrigin(origin) {
    if (/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(origin)) {
      return true;
    }
    return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  }

  /**
   * Reads the sidebar's parameters out of the recorder window's URL.
   * @param {string} search The `location.search` string.
   * @return {{origin: string, nonce: string, sampleRate: number,
   *           maxBytes: number, label: string, slide: string}}
   */
  function parseLaunchParams(search) {
    var params = new URLSearchParams(search || '');
    var sampleRate = parseInt(params.get('sr'), 10);
    var maxBytes = parseInt(params.get('max'), 10);
    var origin = params.get('o') || '';
    return {
      origin: isAllowedOrigin(origin) ? origin : '',
      nonce: (params.get('n') || '').slice(0, 64),
      sampleRate: sampleRate > 0 ? sampleRate : 22050,
      maxBytes: maxBytes > 0 ? maxBytes : 100 * 1024 * 1024,
      label: (params.get('label') || '').slice(0, 60),
      slide: (params.get('slide') || '').slice(0, 20)
    };
  }

  /**
   * Builds the recorder window URL.
   * @param {string} baseUrl Recorder page URL.
   * @param {{origin: string, nonce: string, sampleRate: number,
   *          maxBytes: number, label: string, slide: string}} params Launch params.
   * @return {string} The full URL.
   */
  function buildLaunchUrl(baseUrl, params) {
    var query = [
      'o=' + encodeURIComponent(params.origin),
      'n=' + encodeURIComponent(params.nonce),
      'sr=' + encodeURIComponent(String(params.sampleRate)),
      'max=' + encodeURIComponent(String(params.maxBytes))
    ];
    if (params.label) {
      query.push('label=' + encodeURIComponent(params.label));
    }
    if (params.slide) {
      query.push('slide=' + encodeURIComponent(params.slide));
    }
    return baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + query.join('&');
  }

  return {
    SOURCE: SOURCE,
    VERSION: VERSION,
    TYPES: TYPES,
    envelope: envelope,
    accept: accept,
    isAllowedOrigin: isAllowedOrigin,
    parseLaunchParams: parseLaunchParams,
    buildLaunchUrl: buildLaunchUrl
  };
}));
