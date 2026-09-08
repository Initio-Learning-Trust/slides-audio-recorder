'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const wav = require('../recorder/lib/wav.js');

/**
 * Reads an ASCII tag out of a WAV buffer.
 * @param {!DataView} view The file.
 * @param {number} offset Byte offset.
 * @return {string} Four characters.
 */
function tag(view, offset) {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

test('the header describes a mono 16-bit PCM file', () => {
  const blocks = [new Float32Array(100)];
  const view = new DataView(wav.encodeWav(blocks, 22050));

  assert.equal(tag(view, 0), 'RIFF');
  assert.equal(tag(view, 8), 'WAVE');
  assert.equal(tag(view, 12), 'fmt ');
  assert.equal(view.getUint32(16, true), 16, 'PCM chunk size');
  assert.equal(view.getUint16(20, true), 1, 'format tag');
  assert.equal(view.getUint16(22, true), 1, 'channels');
  assert.equal(view.getUint32(24, true), 22050, 'sample rate');
  assert.equal(view.getUint32(28, true), 22050 * 2, 'byte rate');
  assert.equal(view.getUint16(32, true), 2, 'block align');
  assert.equal(view.getUint16(34, true), 16, 'bits per sample');
  assert.equal(tag(view, 36), 'data');
  assert.equal(view.getUint32(40, true), 200, 'data size');
  assert.equal(view.getUint32(4, true), 36 + 200, 'RIFF size');
});

test('predicted and actual file sizes agree', () => {
  const blocks = [new Float32Array(1000), new Float32Array(24)];
  const buffer = wav.encodeWav(blocks, 16000);
  assert.equal(buffer.byteLength, wav.wavByteLength(1024));
  assert.equal(wav.countSamples(blocks), 1024);
});

test('samples survive the round trip', () => {
  const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const view = new DataView(wav.encodeWav([input], 44100));
  const read = [];
  for (let i = 0; i < input.length; i++) {
    read.push(view.getInt16(wav.HEADER_BYTES + i * 2, true));
  }
  assert.deepEqual(read, [0, 16384, -16384, 32767, -32768]);
});

test('out-of-range samples clamp instead of wrapping', () => {
  assert.equal(wav.toPcm16(4), 32767);
  assert.equal(wav.toPcm16(-4), -32768);
  assert.equal(wav.toPcm16(0), 0);
});

test('blocks are concatenated in order', () => {
  const view = new DataView(wav.encodeWav([
    new Float32Array([1, 1]),
    new Float32Array([-1])
  ], 8000));
  assert.equal(view.getInt16(wav.HEADER_BYTES, true), 32767);
  assert.equal(view.getInt16(wav.HEADER_BYTES + 2, true), 32767);
  assert.equal(view.getInt16(wav.HEADER_BYTES + 4, true), -32768);
});

test('an empty recording still produces a valid, empty file', () => {
  const buffer = wav.encodeWav([], 22050);
  assert.equal(buffer.byteLength, wav.HEADER_BYTES);
  assert.equal(new DataView(buffer).getUint32(40, true), 0);
});

test('peakLevel reports the loudest absolute sample', () => {
  // Float32 cannot hold 0.7 exactly, so compare within a tolerance.
  assert.ok(Math.abs(wav.peakLevel(new Float32Array([0.1, -0.7, 0.3])) - 0.7) < 1e-6);
  assert.equal(wav.peakLevel(new Float32Array([])), 0);
  assert.equal(wav.peakLevel(new Float32Array([5])), 1);
});
