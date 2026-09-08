'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../apps-script/Layout.js');

const PAGE_W = 720;
const PAGE_H = 405;

test('chipText falls back to a sensible label', () => {
  assert.equal(layout.chipText('chip', ''), layout.PLAY_GLYPH + '  Listen');
  assert.equal(layout.chipText('chip', '  Écoutez  '), layout.PLAY_GLYPH + '  Écoutez');
  assert.equal(layout.chipText('dot', 'ignored'), layout.PLAY_GLYPH);
});

test('every corner sits inside the slide with an equal margin', () => {
  ['bottom-left', 'bottom-right', 'top-left', 'top-right'].forEach((position) => {
    const g = layout.computeChipGeometry('chip', 'Listen', position, PAGE_W, PAGE_H);
    assert.ok(g.left >= layout.SLIDE_MARGIN_PT - 0.01, position + ' left edge');
    assert.ok(g.top >= layout.SLIDE_MARGIN_PT - 0.01, position + ' top edge');
    assert.ok(g.left + g.width <= PAGE_W - layout.SLIDE_MARGIN_PT + 0.01, position + ' right edge');
    assert.ok(g.top + g.height <= PAGE_H - layout.SLIDE_MARGIN_PT + 0.01, position + ' bottom edge');
  });
});

test('centre is centred', () => {
  const g = layout.computeChipGeometry('chip', 'Listen', 'centre', PAGE_W, PAGE_H);
  assert.ok(Math.abs((g.left + g.width / 2) - PAGE_W / 2) < 0.5);
  assert.ok(Math.abs((g.top + g.height / 2) - PAGE_H / 2) < 0.5);
});

test('the dot style is a fixed square so the ellipse stays circular', () => {
  const g = layout.computeChipGeometry('dot', 'Listen', 'bottom-left', PAGE_W, PAGE_H);
  assert.equal(g.width, g.height);
});

test('a long label never overflows the slide', () => {
  const g = layout.computeChipGeometry('chip', 'x'.repeat(200), 'bottom-left', PAGE_W, PAGE_H);
  assert.ok(g.width <= PAGE_W - 2 * layout.SLIDE_MARGIN_PT);
});

test('unknown positions fall back to bottom-left', () => {
  const fallback = layout.computeChipGeometry('chip', 'Listen', 'nowhere', PAGE_W, PAGE_H);
  const expected = layout.computeChipGeometry('chip', 'Listen', 'bottom-left', PAGE_W, PAGE_H);
  assert.deepEqual(fallback, expected);
});

test('the first control is not offset, later ones are', () => {
  const base = layout.computeChipGeometry('chip', 'Listen', 'top-left', PAGE_W, PAGE_H);
  assert.deepEqual(layout.offsetForExisting(base, 0, PAGE_W, PAGE_H), base);
  const second = layout.offsetForExisting(base, 1, PAGE_W, PAGE_H);
  assert.notDeepEqual(second, base);
  assert.ok(second.left > base.left);
});

test('offsetting never pushes a control off the slide', () => {
  const base = layout.computeChipGeometry('chip', 'Listen', 'bottom-right', PAGE_W, PAGE_H);
  for (let existing = 1; existing <= 12; existing++) {
    const g = layout.offsetForExisting(base, existing, PAGE_W, PAGE_H);
    assert.ok(g.left >= 0 && g.left + g.width <= PAGE_W, 'x within slide for ' + existing);
    assert.ok(g.top >= 0 && g.top + g.height <= PAGE_H, 'y within slide for ' + existing);
  }
});
