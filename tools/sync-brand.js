#!/usr/bin/env node
/**
 * Embeds the app icon into the Apps Script project as a data URI.
 *
 * The sidebar cannot reference a file from this repository, and pointing it at
 * a remote URL would mean the header logo depends on a network fetch inside an
 * add-on panel. The icon is small, so it is inlined instead.
 *
 * Run `npm run build` after changing assets/app-icon-64.png. CI fails if the
 * generated file is out of date.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'app-icon-64.png');
const TARGET = path.join(ROOT, 'apps-script', 'Brand.html');

/**
 * Builds the HTML include from the icon.
 * @param {!Buffer} icon PNG bytes.
 * @return {string} Contents for Brand.html.
 */
function render(icon) {
  return [
    '<!--',
    '  GENERATED FILE - do not edit.',
    '  Source: assets/app-icon-64.png',
    '  Regenerate with: npm run build',
    '-->',
    '<script>',
    'var BRAND_ICON = "data:image/png;base64,' + icon.toString('base64') + '";',
    '</script>',
    ''
  ].join('\n');
}

/**
 * @return {{changed: boolean, target: string}} What the run did.
 */
function main() {
  const next = render(fs.readFileSync(SOURCE));
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
