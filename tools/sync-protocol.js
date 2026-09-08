#!/usr/bin/env node
/**
 * Copies the postMessage protocol into the Apps Script project.
 *
 * The sidebar and the recorder window must agree byte for byte on the message
 * contract, but they are deployed to different places: the recorder is a static
 * file on our own origin, the sidebar is an Apps Script HTML include. Rather
 * than maintain two copies, recorder/lib/protocol.js is the single source and
 * this script wraps it as apps-script/Protocol.html.
 *
 * Run `npm run build` after editing the protocol. CI fails if the generated
 * file is out of date.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'recorder', 'lib', 'protocol.js');
const TARGET = path.join(ROOT, 'apps-script', 'Protocol.html');

/**
 * Builds the HTML include from the protocol source.
 * @param {string} source Contents of protocol.js.
 * @return {string} Contents for Protocol.html.
 */
function render(source) {
  return [
    '<!--',
    '  GENERATED FILE - do not edit.',
    '  Source: recorder/lib/protocol.js',
    '  Regenerate with: npm run build',
    '-->',
    '<script>',
    source.trimEnd(),
    '</script>',
    ''
  ].join('\n');
}

/**
 * @return {{changed: boolean, target: string}} What the run did.
 */
function main() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const next = render(source);
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
  if (current === next) {
    return { changed: false, target: TARGET };
  }
  fs.writeFileSync(TARGET, next);
  return { changed: true, target: TARGET };
}

if (require.main === module) {
  const result = main();
  console.log(result.changed ?
      'Wrote ' + path.relative(ROOT, result.target) :
      path.relative(ROOT, result.target) + ' is already up to date');
}

module.exports = { render, SOURCE, TARGET };
