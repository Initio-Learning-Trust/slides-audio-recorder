/**
 * Pure geometry for the play control placed on a slide.
 *
 * Separated from SlidesService so the maths can be unit tested under Node
 * (see test/layout.test.js).
 */

/** Distance from the slide edge, in points. */
var SLIDE_MARGIN_PT = 18;

/**
 * The glyph used on the play control. A plain triangle renders consistently in
 * Slides on every platform, unlike the emoji play symbol.
 */
var PLAY_GLYPH = '▶';

/**
 * Text shown inside the play control.
 * @param {string} style One of 'chip', 'dot', 'text'.
 * @param {string} label The user's label.
 * @return {string} Display text.
 */
function chipText(style, label) {
  var clean = String(label == null ? '' : label).trim() || 'Listen';
  if (style === 'dot') {
    return PLAY_GLYPH;
  }
  return PLAY_GLYPH + '  ' + clean;
}

/**
 * Works out where the play control goes.
 * @param {string} style One of 'chip', 'dot', 'text'.
 * @param {string} label The user's label.
 * @param {string} position One of 'bottom-left', 'bottom-right', 'top-left',
 *     'top-right', 'centre'.
 * @param {number} pageWidth Slide width in points.
 * @param {number} pageHeight Slide height in points.
 * @return {{left: number, top: number, width: number, height: number}}
 */
function computeChipGeometry(style, label, position, pageWidth, pageHeight) {
  var text = chipText(style, label);
  var width;
  var height;
  if (style === 'dot') {
    width = 30;
    height = 30;
  } else if (style === 'text') {
    width = Math.max(110, Math.round(6.6 * text.length) + 12);
    height = 22;
  } else {
    width = Math.max(96, Math.round(7.2 * text.length) + 28);
    height = 30;
  }
  var maxWidth = Math.max(40, pageWidth - 2 * SLIDE_MARGIN_PT);
  width = Math.min(width, maxWidth);

  var left;
  var top;
  switch (position) {
    case 'top-left':
      left = SLIDE_MARGIN_PT;
      top = SLIDE_MARGIN_PT;
      break;
    case 'top-right':
      left = pageWidth - SLIDE_MARGIN_PT - width;
      top = SLIDE_MARGIN_PT;
      break;
    case 'bottom-right':
      left = pageWidth - SLIDE_MARGIN_PT - width;
      top = pageHeight - SLIDE_MARGIN_PT - height;
      break;
    case 'centre':
      left = (pageWidth - width) / 2;
      top = (pageHeight - height) / 2;
      break;
    case 'bottom-left':
    default:
      left = SLIDE_MARGIN_PT;
      top = pageHeight - SLIDE_MARGIN_PT - height;
      break;
  }
  return {
    left: Math.round(Math.max(0, left) * 100) / 100,
    top: Math.round(Math.max(0, top) * 100) / 100,
    width: width,
    height: height
  };
}

/**
 * Nudges a new control down and right when something already sits there, so
 * two recordings on one slide do not land exactly on top of each other.
 * @param {{left: number, top: number, width: number, height: number}} geometry
 *     The preferred geometry.
 * @param {number} existingCount How many controls are already on the slide.
 * @param {number} pageWidth Slide width in points.
 * @param {number} pageHeight Slide height in points.
 * @return {{left: number, top: number, width: number, height: number}} Adjusted.
 */
function offsetForExisting(geometry, existingCount, pageWidth, pageHeight) {
  if (!existingCount) {
    return geometry;
  }
  var step = 12 * existingCount;
  var left = Math.min(geometry.left + step, Math.max(0, pageWidth - geometry.width));
  var top = geometry.top;
  if (top + geometry.height + step <= pageHeight) {
    top = top + step;
  } else {
    top = Math.max(0, top - step);
  }
  return { left: left, top: top, width: geometry.width, height: geometry.height };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chipText: chipText,
    computeChipGeometry: computeChipGeometry,
    offsetForExisting: offsetForExisting,
    SLIDE_MARGIN_PT: SLIDE_MARGIN_PT,
    PLAY_GLYPH: PLAY_GLYPH
  };
}
