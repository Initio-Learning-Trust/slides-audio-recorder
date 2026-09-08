/**
 * Entry points for the Slides Audio Recorder editor add-on.
 *
 * The sidebar is the whole UI. Microphone capture cannot happen here: Google
 * serves add-on HTML inside a sandboxed iframe whose Permissions-Policy omits
 * `microphone`, so getUserMedia() throws. Capture therefore happens in a small
 * popup window served from our own origin (see recorder/), which hands the
 * finished audio back through postMessage. See docs/ARCHITECTURE.md.
 */

/**
 * Runs when a presentation is opened with the add-on installed.
 * @param {Object} e The Apps Script open event.
 */
function onOpen(e) {
  var ui = SlidesApp.getUi();
  var menu = ui.createAddonMenu();
  menu.addItem('Record audio', 'showSidebar');
  menu.addItem('Open recordings folder', 'openRecordingsFolder');
  menu.addSeparator();
  menu.addItem('Help', 'showHelp');
  menu.addToUi();
}

/**
 * Runs once when a user installs the add-on.
 * @param {Object} e The Apps Script install event.
 */
function onInstall(e) {
  onOpen(e);
  showSidebar();
}

/** Opens the recorder sidebar. */
function showSidebar() {
  var template = HtmlService.createTemplateFromFile('Sidebar');
  var html = template.evaluate()
      .setTitle(ADDON_NAME)
      .setWidth(320);
  SlidesApp.getUi().showSidebar(html);
}

/** Shows a short help dialog pointing at the full guide. */
function showHelp() {
  var target = getRecorderTarget();
  var html = HtmlService.createHtmlOutput(
      '<div style="font:13px/1.5 Roboto,Arial,sans-serif;padding:4px 2px">' +
      '<p><b>' + escapeHtml_(ADDON_NAME) + '</b> records straight into your slides.</p>' +
      '<ol style="padding-left:18px;margin:8px 0">' +
      '<li>Open <i>Extensions &rsaquo; ' + escapeHtml_(ADDON_NAME) + ' &rsaquo; Record audio</i>.</li>' +
      '<li>Press <b>Record</b>. A small recording window opens &mdash; allow microphone access once.</li>' +
      '<li>Press <b>Use recording</b>. The audio is saved to your Drive and a play button is added to the current slide.</li>' +
      '</ol>' +
      '<p>Recording happens in a separate window because Google blocks microphone access inside add-on sidebars.</p>' +
      '<p><a href="' + escapeHtml_(SUPPORT_URL) + '" target="_blank">Full user guide</a> &middot; ' +
      '<span style="color:#5f6368">Recorder: ' + escapeHtml_(target.origin) + '</span></p>' +
      '</div>')
      .setWidth(420).setHeight(320);
  SlidesApp.getUi().showModalDialog(html, 'About ' + ADDON_NAME);
}

/** Opens (in a dialog link) the Drive folder holding this deck's recordings. */
function openRecordingsFolder() {
  var folderId = getPresentationFolderId_(false);
  var ui = SlidesApp.getUi();
  if (!folderId) {
    ui.alert(ADDON_NAME, 'No recordings have been made for this presentation yet.', ui.ButtonSet.OK);
    return;
  }
  var url = 'https://drive.google.com/drive/folders/' + folderId;
  var html = HtmlService.createHtmlOutput(
      '<div style="font:13px/1.5 Roboto,Arial,sans-serif;padding:8px 2px">' +
      '<p><a href="' + escapeHtml_(url) + '" target="_blank">Open the recordings folder in Drive</a></p></div>')
      .setWidth(360).setHeight(90);
  ui.showModalDialog(html, 'Recordings folder');
}

/**
 * Includes another HTML file, so CSS and JS can live in their own files.
 * @param {string} filename Name of the HTML file, without extension.
 * @return {string} The evaluated content.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Everything the sidebar needs on load.
 * @return {Object} Bootstrap payload.
 */
function getBootstrap() {
  var target = getRecorderTarget();
  return {
    addonName: ADDON_NAME,
    recorderUrl: target.url,
    recorderOrigin: target.origin,
    supportUrl: SUPPORT_URL,
    chunkBytes: UPLOAD_CHUNK_BYTES,
    maxBytes: MAX_RECORDING_BYTES,
    settings: getSettings(),
    recordings: listRecordings(),
    presentation: describePresentation_(),
    slide: describeCurrentSlide()
  };
}

/**
 * @return {{id: string, name: string}} Identity of the open presentation.
 * @private
 */
function describePresentation_() {
  var p = SlidesApp.getActivePresentation();
  return { id: p.getId(), name: p.getName() };
}

/**
 * Escapes text for interpolation into HTML.
 * @param {string} s Raw text.
 * @return {string} Escaped text.
 * @private
 */
function escapeHtml_(s) {
  return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}
