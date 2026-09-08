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
  menu.addItem('Diagnose microphone access', 'showDiagnostics');
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

/**
 * Shows the microphone permissions diagnostic in a dialog.
 *
 * Support tool: when a teacher reports that recording will not work, this says
 * whether the browser blocked the microphone or something else did.
 */
function showDiagnostics() {
  var html = HtmlService.createHtmlOutputFromFile('Diagnostics').setWidth(520).setHeight(460);
  SlidesApp.getUi().showModalDialog(html, 'Microphone access diagnostic');
}

/** Shows a short help dialog pointing at the full guide. */
function showHelp() {
  var target = getRecorderTarget();
  var html = HtmlService.createHtmlOutput(
      '<div style="font:13px/1.5 Roboto,Arial,sans-serif;padding:4px 2px">' +
      '<p><b>' + escapeHtml_(ADDON_NAME) + '</b> records narration for the slide you have open.</p>' +
      '<ol style="padding-left:18px;margin:8px 0">' +
      '<li>Open <i>Extensions &rsaquo; ' + escapeHtml_(ADDON_NAME) + ' &rsaquo; Record audio</i>.</li>' +
      '<li>Tap the record button. A small window opens for the microphone; allow it once.</li>' +
      '<li>Tap it again to stop. Your take appears in the sidebar to listen back to.</li>' +
      '<li>Name the button and press <b>Insert into current slide</b>.</li>' +
      '</ol>' +
      '<p>Recording opens in a separate window because Google does not allow add-on panels to use the microphone.</p>' +
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
    version: ADDON_VERSION,
    howtoAnimation: getHowToAnimation(),
    recorderUrl: target.url,
    recorderOrigin: target.origin,
    supportUrl: SUPPORT_URL,
    chunkBytes: UPLOAD_CHUNK_BYTES,
    maxBytes: MAX_RECORDING_BYTES,
    settings: getSettings(),
    recordings: listRecordings(),
    presentation: describePresentation_(),
    slide: describeCurrentSlide(),
    folderUrl: getPresentationFolderUrl()
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
