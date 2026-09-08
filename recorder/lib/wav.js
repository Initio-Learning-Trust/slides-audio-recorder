/**
 * Minimal 16-bit PCM WAV writer.
 *
 * WAV is not the smallest format, but it is one of only two Google Slides
 * accepts in Insert > Audio (the other being MP3, which needs an LGPL encoder
 * we would rather not ship). It also plays in Drive's preview without
 * transcoding, so a linked recording works the moment it finishes uploading.
 *
 * Loads as a browser global (`window.WavWriter`) and as a CommonJS module for
 * tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WavWriter = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BYTES_PER_SAMPLE = 2;
  var HEADER_BYTES = 44;

  /**
   * Total samples across a list of Float32Array blocks.
   * @param {!Array<!Float32Array>} blocks Captured audio blocks.
   * @return {number} Sample count.
   */
  function countSamples(blocks) {
    var total = 0;
    for (var i = 0; i < blocks.length; i++) {
      total += blocks[i].length;
    }
    return total;
  }

  /**
   * Predicts the size of the WAV file for a given number of samples.
   * @param {number} sampleCount Number of mono samples.
   * @return {number} File size in bytes.
   */
  function wavByteLength(sampleCount) {
    return HEADER_BYTES + sampleCount * BYTES_PER_SAMPLE;
  }

  /**
   * Converts a float sample in [-1, 1] to a signed 16-bit integer.
   * @param {number} sample Float sample.
   * @return {number} Signed 16-bit value.
   */
  function toPcm16(sample) {
    var clamped = sample < -1 ? -1 : (sample > 1 ? 1 : sample);
    return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7FFF);
  }

  /**
   * Writes an ASCII string into a DataView.
   * @param {!DataView} view Target view.
   * @param {number} offset Byte offset.
   * @param {string} text ASCII text.
   */
  function writeAscii(view, offset, text) {
    for (var i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i) & 0x7F);
    }
  }

  /**
   * Encodes captured audio as a mono 16-bit WAV file.
   * @param {!Array<!Float32Array>} blocks Captured audio blocks, in order.
   * @param {number} sampleRate Sample rate in Hz.
   * @return {!ArrayBuffer} The complete WAV file.
   */
  function encodeWav(blocks, sampleRate) {
    var sampleCount = countSamples(blocks);
    var dataBytes = sampleCount * BYTES_PER_SAMPLE;
    var buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
    var view = new DataView(buffer);

    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);              // PCM chunk size
    view.setUint16(20, 1, true);               // format: PCM
    view.setUint16(22, 1, true);               // channels: mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
    view.setUint16(32, BYTES_PER_SAMPLE, true);              // block align
    view.setUint16(34, 16, true);              // bits per sample
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataBytes, true);

    var offset = HEADER_BYTES;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      for (var j = 0; j < block.length; j++) {
        view.setInt16(offset, toPcm16(block[j]), true);
        offset += BYTES_PER_SAMPLE;
      }
    }
    return buffer;
  }

  /**
   * Peak absolute amplitude of a block, for the level meter.
   * @param {!Float32Array} block Audio block.
   * @return {number} Peak in [0, 1].
   */
  function peakLevel(block) {
    var peak = 0;
    for (var i = 0; i < block.length; i++) {
      var value = block[i] < 0 ? -block[i] : block[i];
      if (value > peak) {
        peak = value;
      }
    }
    return peak > 1 ? 1 : peak;
  }

  return {
    encodeWav: encodeWav,
    wavByteLength: wavByteLength,
    countSamples: countSamples,
    peakLevel: peakLevel,
    toPcm16: toPcm16,
    HEADER_BYTES: HEADER_BYTES,
    BYTES_PER_SAMPLE: BYTES_PER_SAMPLE
  };
}));
