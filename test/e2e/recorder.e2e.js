'use strict';

/**
 * End-to-end test of the cross-origin recording bridge.
 *
 * This is the part of the design that cannot be unit tested and cannot be
 * assumed: a page on one origin opening a recorder on another origin, capturing
 * a real microphone through a real audio graph, and handing WAV bytes back over
 * postMessage. Chromium runs with a fake capture device that emits a tone, so
 * the assertions can prove audio actually flowed rather than that no error was
 * thrown.
 *
 * Run with: npm run test:e2e
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Chromium launch options.
 *
 * CHROMIUM_PATH lets a sandbox with a pre-installed browser point at it instead
 * of downloading one; --no-sandbox is needed when the test runs as root in a
 * container, which is the normal case in CI images.
 * @param {!Array<string>=} extraArgs Additional Chromium flags.
 * @return {!Object} Options for chromium.launch().
 */
function launchOptions(extraArgs) {
  const options = { args: ['--no-sandbox', '--disable-dev-shm-usage'].concat(extraArgs || []) };
  if (process.env.CHROMIUM_PATH) {
    options.executablePath = process.env.CHROMIUM_PATH;
  }
  return options;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
};

/**
 * Serves a directory over http, with optional extra path mappings.
 * @param {string} root Directory to serve.
 * @param {!Object<string, string>=} extras Map of URL path to absolute file.
 * @return {!Promise<{url: string, close: function(): !Promise<void>}>}
 */
function serve(root, extras) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      let file = extras && extras[urlPath];
      if (!file) {
        const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
        file = path.join(root, relative);
        // Refuse to serve outside the root.
        if (!file.startsWith(root)) {
          res.writeHead(403).end();
          return;
        }
      }
      fs.readFile(file, (err, body) => {
        if (err) {
          res.writeHead(404).end('not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(body);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: 'http://127.0.0.1:' + port,
        port,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

test('the recorder captures audio and hands it to a page on another origin', async (t) => {
  // The recorder is served from 127.0.0.1 and the sidebar from localhost, so
  // the browser treats them as different origins, exactly as in production.
  const recorderServer = await serve(path.join(ROOT, 'recorder'));
  const sidebarServer = await serve(path.join(ROOT, 'test', 'e2e', 'fixtures'), {
    '/lib/protocol.js': path.join(ROOT, 'recorder', 'lib', 'protocol.js')
  });
  const sidebarOrigin = 'http://localhost:' + sidebarServer.port;

  const browser = await chromium.launch(launchOptions([
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream'
  ]));
  const context = await browser.newContext({ permissions: ['microphone'] });

  t.after(async () => {
    await context.close();
    await browser.close();
    await recorderServer.close();
    await sidebarServer.close();
  });

  const sidebar = await context.newPage();
  const failures = [];
  sidebar.on('pageerror', (err) => failures.push('sidebar: ' + err.message));

  await sidebar.goto(sidebarOrigin + '/sidebar.html?recorder=' +
      encodeURIComponent(recorderServer.url + '/index.html'));

  const [recorder] = await Promise.all([
    context.waitForEvent('page'),
    sidebar.click('#open')
  ]);
  recorder.on('pageerror', (err) => failures.push('recorder: ' + err.message));
  await recorder.waitForLoadState();

  await t.test('the recorder recognises a legitimate launch', async () => {
    assert.equal(await recorder.isVisible('[data-panel="standalone"]'), false,
        'the recorder should not show the standalone notice when launched properly');
    assert.equal(await recorder.isVisible('#btn-record'), true);
    assert.equal(await recorder.isVisible('#status-row'), false,
        'an idle window must not claim to be recording');
    assert.equal(await recorder.isVisible('#scope'), false,
        'the waveform belongs to the recording state, not to rest');
    assert.equal(await recorder.textContent('#context'), 'Slide 3');
  });

  await t.test('the handshake completes', async () => {
    await sidebar.waitForFunction(() => window.__harness.ackSent === true, null, { timeout: 5000 });
    const events = await sidebar.evaluate(() => window.__harness.events);
    assert.ok(events.includes('accepted ready'), 'sidebar should accept the ready message');
  });

  await t.test('the live meter streams to the sidebar while recording', async () => {
    await recorder.click('#btn-record');
    await recorder.waitForSelector('#btn-record.is-recording', { timeout: 10000 });
    assert.equal(await recorder.isVisible('#status-row'), true, 'now it really is recording');
    assert.equal(await recorder.isVisible('#scope'), true);
    await sidebar.waitForFunction(() => window.__harness.sawRecordingState === true, null, { timeout: 5000 });
    await sidebar.waitForFunction(() => window.__harness.levelFrames > 3, null, { timeout: 5000 });

    const levels = await sidebar.evaluate(() => window.__harness.lastLevels);
    assert.equal(levels.length, 12, 'one value per bar in the sidebar scope');
    levels.forEach((value) => {
      assert.ok(value >= 0 && value <= 1, 'meter values are normalised, got ' + value);
    });

    // The fake device beeps intermittently, so wait for a tone rather than
    // sampling one frame and hoping it is not a gap between beeps.
    await sidebar.waitForFunction(() => window.__harness.maxLevel > 0.2, null, { timeout: 8000 });
  });

  await t.test('stopping hands audible WAV audio to the sidebar', async () => {
    await recorder.waitForTimeout(1000);
    await recorder.click('#btn-record');

    await sidebar.waitForFunction(() => window.__harness.audio !== null, null, { timeout: 10000 });
    const audio = await sidebar.evaluate(() => window.__harness.audio);

    assert.equal(audio.header, 'RIFFWAVE', 'the payload should be a WAV file');
    assert.equal(audio.mimeType, 'audio/wav');
    assert.equal(audio.sampleRate, 22050, 'the requested sample rate should be honoured');
    assert.ok(audio.durationMs > 800, 'expected at least ~1s of audio, got ' + audio.durationMs + 'ms');
    assert.ok(audio.byteLength > 44, 'the file should contain samples, not just a header');
    // The reported duration is rounded to whole milliseconds, so compare the
    // duration implied by the file size rather than demanding an exact match.
    const impliedMs = ((audio.byteLength - 44) / 2) / audio.sampleRate * 1000;
    assert.ok(Math.abs(impliedMs - audio.durationMs) < 5,
        'file size implies ' + impliedMs.toFixed(1) + 'ms but ' + audio.durationMs + 'ms was reported');
    assert.ok(audio.peak > 1000,
        'expected the fake microphone tone to be audible, peak was ' + audio.peak);
  });

  await t.test('the recorder closes itself once the sidebar has the audio', async () => {
    // The sidebar owns review and insertion from here, so the window is done.
    await recorder.waitForEvent('close', { timeout: 5000 });
    assert.equal(recorder.isClosed(), true);
  });

  await t.test('nothing threw along the way', () => {
    assert.deepEqual(failures, []);
  });
});

test('the recorder refuses to run without a sidebar', async (t) => {
  const recorderServer = await serve(path.join(ROOT, 'recorder'));
  const browser = await chromium.launch(launchOptions());
  t.after(async () => {
    await browser.close();
    await recorderServer.close();
  });

  const page = await browser.newPage();
  await page.goto(recorderServer.url + '/index.html');
  assert.equal(await page.isVisible('[data-panel="standalone"]'), true,
      'opened directly, the recorder should explain it must be started from Slides');
  assert.equal(await page.isVisible('[data-panel="record"]'), false);
});

test('the recorder ignores a launch URL naming an untrusted origin', async (t) => {
  const recorderServer = await serve(path.join(ROOT, 'recorder'));
  const browser = await chromium.launch(launchOptions());
  t.after(async () => {
    await browser.close();
    await recorderServer.close();
  });

  const page = await browser.newPage();
  await page.goto(recorderServer.url +
      '/index.html?o=' + encodeURIComponent('http://evil.example') + '&n=abc');
  assert.equal(await page.isVisible('[data-panel="standalone"]'), true,
      'a non-loopback http origin must be rejected before any recording is possible');
});
