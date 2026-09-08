'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sync = require('../tools/sync-protocol.js');

const ROOT = path.join(__dirname, '..');

test('the generated Protocol.html matches recorder/lib/protocol.js', () => {
  const expected = sync.render(fs.readFileSync(sync.SOURCE, 'utf8'));
  const actual = fs.readFileSync(sync.TARGET, 'utf8');
  assert.equal(actual, expected,
      'apps-script/Protocol.html is stale. Run `npm run build`.');
});

test('the manifest only asks for non-sensitive scopes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps-script', 'appsscript.json'), 'utf8'));
  const allowed = [
    'https://www.googleapis.com/auth/presentations.currentonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/script.container.ui',
    'https://www.googleapis.com/auth/script.external_request'
  ];
  manifest.oauthScopes.forEach((scope) => {
    assert.ok(allowed.includes(scope), scope + ' is not on the approved scope list');
  });
  assert.ok(manifest.oauthScopes.length === allowed.length, 'a scope is missing from the manifest');
});

test('outbound requests are restricted to the Google APIs host', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps-script', 'appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.urlFetchWhitelist, ['https://www.googleapis.com/']);
});

test('the upload chunk size is a multiple of 256 KiB, as Drive requires', () => {
  const config = fs.readFileSync(path.join(ROOT, 'apps-script', 'Config.js'), 'utf8');
  const match = config.match(/UPLOAD_CHUNK_BYTES\s*=\s*(\d+)\s*\*\s*1024/);
  assert.ok(match, 'UPLOAD_CHUNK_BYTES not found');
  assert.equal((Number(match[1]) * 1024) % (256 * 1024), 0);
});

test('the recorder page loads the protocol before the controller', () => {
  const html = fs.readFileSync(path.join(ROOT, 'recorder', 'index.html'), 'utf8');
  assert.ok(html.indexOf('lib/protocol.js') < html.indexOf('recorder.js'));
  assert.ok(html.indexOf('lib/wav.js') < html.indexOf('recorder.js'));
});

test('the sidebar includes the protocol before its controller', () => {
  const html = fs.readFileSync(path.join(ROOT, 'apps-script', 'Sidebar.html'), 'utf8');
  assert.ok(html.indexOf("include('Protocol')") < html.indexOf("include('SidebarJs')"));
});

test('every element the sidebar controller looks up exists in the sidebar markup', () => {
  const dir = path.join(ROOT, 'apps-script');
  const controller = fs.readFileSync(path.join(dir, 'SidebarJs.html'), 'utf8');
  const markup = fs.readFileSync(path.join(dir, 'Sidebar.html'), 'utf8');
  const ids = new Set();
  const pattern = /\$\('([^']+)'\)/g;
  let match;
  while ((match = pattern.exec(controller)) !== null) {
    ids.add(match[1]);
  }
  assert.ok(ids.size > 10, 'expected the controller to look up a number of elements');
  ids.forEach((id) => {
    assert.ok(markup.includes('id="' + id + '"'),
        'Sidebar.html has no element with id="' + id + '"');
  });
});
