#!/usr/bin/env node
/**
 * Stamps the recorder's assets with a content hash.
 *
 * GitHub Pages serves everything with `cache-control: max-age=600`, so for ten
 * minutes after a release a browser can pair a freshly revalidated index.html
 * with a cached recorder.js from the previous version. That mismatch is not
 * cosmetic: the old script looks for elements the new markup does not have,
 * throws during init, and leaves the window unstyled with a dead record button.
 * A teacher mid-lesson would just see a broken page.
 *
 * Appending `?v=<hash>` gives every release its own URLs, so a stale cache
 * entry can never be paired with new markup. The hash covers every asset the
 * page loads, so any change to any of them busts them all -- a heavier hammer
 * than per-file hashes, but this page has five files.
 *
 * Run `npm run build` after changing anything under recorder/. CI fails if the
 * stamps are out of date.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'recorder', 'index.html');

/** Assets whose URLs carry the hash, relative to recorder/. */
const ASSETS = [
  'recorder.css',
  'lib/protocol.js',
  'lib/wav.js',
  'recorder.js',
  // Loaded by recorder.js via addModule(), using the version in the meta tag.
  'capture-worklet.js'
];

/**
 * @return {string} Eight hex characters covering the content of every asset.
 */
function computeVersion() {
  const hash = crypto.createHash('sha256');
  ASSETS.forEach((asset) => {
    hash.update(asset);
    hash.update(fs.readFileSync(path.join(ROOT, 'recorder', asset)));
  });
  return hash.digest('hex').slice(0, 8);
}

/**
 * Rewrites the page's asset URLs and version meta tag.
 * @param {string} html Current page source.
 * @param {string} version Version stamp.
 * @return {string} Updated page source.
 */
function stamp(html, version) {
  let out = html.replace(
      /(<meta name="asset-version" content=")[^"]*(">)/,
      '$1' + version + '$2');
  ASSETS.forEach((asset) => {
    if (asset === 'capture-worklet.js') {
      return;
    }
    const escaped = asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
        new RegExp('((?:href|src)=")' + escaped + '(?:\\?v=[0-9a-f]+)?(")', 'g'),
        '$1' + asset + '?v=' + version + '$2');
  });
  return out;
}

/**
 * @return {{changed: boolean, version: string}} What the run did.
 */
function main() {
  const version = computeVersion();
  const current = fs.readFileSync(PAGE, 'utf8');
  const next = stamp(current, version);
  if (current !== next) {
    fs.writeFileSync(PAGE, next);
  }
  return { changed: current !== next, version: version };
}

if (require.main === module) {
  const result = main();
  console.log(result.changed ?
      'Stamped recorder assets as v' + result.version :
      'Recorder assets already stamped as v' + result.version);
}

module.exports = { computeVersion, stamp, ASSETS, PAGE };
