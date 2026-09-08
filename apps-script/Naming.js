/**
 * Pure naming and formatting helpers.
 *
 * Kept free of Apps Script services so they can be unit tested under Node
 * (see test/naming.test.js).
 */

/** Characters Drive rejects or that make file names unreadable. */
var UNSAFE_NAME_CHARS = new RegExp('[\\u0000-\\u001F\\u007F\\\\/]', 'g');

/**
 * Strips characters Drive dislikes and collapses whitespace.
 * @param {string} value Raw user text.
 * @param {number=} maxLength Maximum length, default 80.
 * @return {string} A safe file name fragment, possibly empty.
 */
function sanitiseNameFragment(value, maxLength) {
  var limit = maxLength || 80;
  var cleaned = String(value == null ? '' : value)
      .replace(UNSAFE_NAME_CHARS, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return cleaned.slice(0, limit).trim();
}

/**
 * Pads a number to two digits.
 * @param {number} n Number to pad.
 * @return {string} Two-character string.
 */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * Builds the Drive file name for a recording.
 *
 * Teachers scan this list in the Insert > Audio picker, so the slide number
 * comes first and the label second; the timestamp only breaks ties.
 *
 * @param {string} label Free-text label from the sidebar.
 * @param {?number} slideNumber 1-based slide index, or null when unknown.
 * @param {!Date} date Creation time.
 * @return {string} File name including the .wav extension.
 */
function buildRecordingFileName(label, slideNumber, date) {
  var parts = [];
  if (slideNumber) {
    parts.push('Slide ' + slideNumber);
  }
  var cleanLabel = sanitiseNameFragment(label, 60);
  if (cleanLabel) {
    parts.push(cleanLabel);
  }
  parts.push(date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + '.' + pad2(date.getMinutes()) + '.' + pad2(date.getSeconds()));
  return parts.join(' - ') + '.wav';
}

/**
 * Formats a duration for display.
 * @param {number} milliseconds Duration in ms.
 * @return {string} m:ss (or h:mm:ss beyond an hour).
 */
function formatDuration(milliseconds) {
  var totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  var hours = Math.floor(totalSeconds / 3600);
  var minutes = Math.floor((totalSeconds % 3600) / 60);
  var seconds = totalSeconds % 60;
  if (hours > 0) {
    return hours + ':' + pad2(minutes) + ':' + pad2(seconds);
  }
  return minutes + ':' + pad2(seconds);
}

/**
 * Works out how many chunks an upload needs.
 * @param {number} totalBytes Size of the file.
 * @param {number} chunkBytes Bytes per chunk.
 * @return {number} Chunk count (0 for an empty file).
 */
function chunkCount(totalBytes, chunkBytes) {
  if (!(totalBytes > 0) || !(chunkBytes > 0)) {
    return 0;
  }
  return Math.ceil(totalBytes / chunkBytes);
}

/**
 * Validates that an incoming chunk lands exactly where the session expects it.
 * @param {number} index 0-based chunk index.
 * @param {number} chunkBytes Bytes per chunk.
 * @param {number} offset Bytes already committed.
 * @param {number} length Length of this chunk.
 * @param {number} total Total file size.
 * @return {?string} An error message, or null when the chunk is valid.
 */
function validateChunk(index, chunkBytes, offset, length, total) {
  if (!(index >= 0) || Math.floor(index) !== index) {
    return 'Chunk index must be a non-negative integer.';
  }
  if (index * chunkBytes !== offset) {
    return 'Chunk ' + index + ' arrived out of order.';
  }
  if (length <= 0) {
    return 'Chunk ' + index + ' was empty.';
  }
  if (offset + length > total) {
    return 'Chunk ' + index + ' would overrun the declared file size.';
  }
  var isLast = offset + length === total;
  if (!isLast && length !== chunkBytes) {
    return 'Only the final chunk may be shorter than ' + chunkBytes + ' bytes.';
  }
  return null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitiseNameFragment: sanitiseNameFragment,
    buildRecordingFileName: buildRecordingFileName,
    formatDuration: formatDuration,
    chunkCount: chunkCount,
    validateChunk: validateChunk,
    pad2: pad2
  };
}
