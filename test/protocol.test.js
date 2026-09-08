'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../recorder/lib/protocol.js');

const ORIGIN = 'https://initio-learning-trust.github.io';
const NONCE = 'e0b1a3c4-1111-2222-3333-444455556666';

/**
 * @param {Object} data Message body.
 * @param {string=} origin Sender origin.
 * @return {{origin: string, data: Object}} A fake message event.
 */
function event(data, origin) {
  return { origin: origin === undefined ? ORIGIN : origin, data };
}

test('a well-formed message is accepted', () => {
  const message = protocol.envelope(protocol.TYPES.READY, NONCE, { extra: 1 });
  const accepted = protocol.accept(event(message), ORIGIN, NONCE);
  assert.equal(accepted.type, protocol.TYPES.READY);
  assert.equal(accepted.extra, 1);
});

test('messages from another origin are ignored', () => {
  const message = protocol.envelope(protocol.TYPES.AUDIO, NONCE);
  assert.equal(protocol.accept(event(message, 'https://evil.example'), ORIGIN, NONCE), null);
});

test('messages with the wrong nonce are ignored', () => {
  const message = protocol.envelope(protocol.TYPES.AUDIO, 'guessed-nonce');
  assert.equal(protocol.accept(event(message), ORIGIN, NONCE), null);
});

test('a missing expected nonce never matches', () => {
  const message = protocol.envelope(protocol.TYPES.AUDIO, undefined);
  assert.equal(protocol.accept(event(message), ORIGIN, undefined), null);
});

test('foreign envelopes and versions are ignored', () => {
  assert.equal(protocol.accept(event({ source: 'other', v: 1, type: 'ready', nonce: NONCE }), ORIGIN, NONCE), null);
  assert.equal(protocol.accept(event({ source: protocol.SOURCE, v: 99, type: 'ready', nonce: NONCE }), ORIGIN, NONCE), null);
});

test('unknown message types are ignored', () => {
  const message = protocol.envelope('exfiltrate', NONCE);
  assert.equal(protocol.accept(event(message), ORIGIN, NONCE), null);
});

test('non-object payloads are ignored', () => {
  assert.equal(protocol.accept(event('ready'), ORIGIN, NONCE), null);
  assert.equal(protocol.accept(event(null), ORIGIN, NONCE), null);
  assert.equal(protocol.accept(null, ORIGIN, NONCE), null);
});

test('launch params round-trip through the URL', () => {
  const params = {
    origin: 'https://n-abc123-0lu-script.googleusercontent.com',
    nonce: NONCE,
    sampleRate: 22050,
    maxBytes: 1048576,
    label: 'Bonjour',
    slide: '3'
  };
  const url = protocol.buildLaunchUrl('https://example.test/recorder/', params);
  const parsed = protocol.parseLaunchParams(url.slice(url.indexOf('?')));
  assert.deepEqual(parsed, params);
});

test('launch params reject a non-https or malformed origin', () => {
  assert.equal(protocol.parseLaunchParams('?o=http%3A%2F%2Fevil.test&n=x').origin, '');
  assert.equal(protocol.parseLaunchParams('?o=javascript%3Aalert(1)&n=x').origin, '');
  assert.equal(protocol.parseLaunchParams('?n=x').origin, '');
});

test('launch params fall back to safe defaults', () => {
  const parsed = protocol.parseLaunchParams('');
  assert.equal(parsed.sampleRate, 22050);
  assert.equal(parsed.maxBytes, 100 * 1024 * 1024);
  assert.equal(parsed.nonce, '');
  assert.equal(parsed.label, '');
});

test('launch params clamp oversized text', () => {
  const parsed = protocol.parseLaunchParams('?n=' + 'a'.repeat(200) + '&label=' + 'b'.repeat(200));
  assert.equal(parsed.nonce.length, 64);
  assert.equal(parsed.label.length, 60);
});

test('buildLaunchUrl keeps an existing query string', () => {
  const url = protocol.buildLaunchUrl('https://example.test/recorder/?v=2', {
    origin: 'https://x.test', nonce: 'n', sampleRate: 16000, maxBytes: 10, label: '', slide: ''
  });
  assert.ok(url.includes('?v=2&o='));
});

test('only https and loopback origins may receive audio', () => {
  assert.equal(protocol.isAllowedOrigin('https://n-abc-0lu-script.googleusercontent.com'), true);
  assert.equal(protocol.isAllowedOrigin('https://example.test:8443'), true);
  assert.equal(protocol.isAllowedOrigin('http://localhost:8080'), true, 'loopback is a secure context');
  assert.equal(protocol.isAllowedOrigin('http://127.0.0.1'), true);
  assert.equal(protocol.isAllowedOrigin('http://example.test'), false, 'plain http must be refused');
  assert.equal(protocol.isAllowedOrigin('http://localhost.evil.test'), false, 'no suffix tricks');
  assert.equal(protocol.isAllowedOrigin('https://a.test/path'), false, 'an origin has no path');
  assert.equal(protocol.isAllowedOrigin(''), false);
});
