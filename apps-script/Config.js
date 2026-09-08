/**
 * Central configuration for Slides Audio Recorder.
 *
 * Anything an installer might want to change lives here or in Script
 * Properties. Script Properties win, so a deployment can be re-pointed at a
 * different recorder host without editing code.
 */

/** Add-on name shown in menus and the sidebar header. */
var ADDON_NAME = 'Audio Recorder';

/** Shown in the sidebar footer. */
var ADDON_VERSION = '1.0';

/**
 * Default origin serving the recorder bridge page. Must be an https origin you
 * control: it is the only page allowed to hand audio back to the sidebar, and
 * the sidebar refuses postMessage events from anywhere else.
 */
var DEFAULT_RECORDER_ORIGIN = 'https://initio-learning-trust.github.io';

/** Path of the recorder bridge page on that origin. */
var DEFAULT_RECORDER_PATH = '/slides-audio-recorder/recorder/';

/**
 * Bytes per upload chunk. Drive's resumable protocol requires every chunk
 * except the last to be a multiple of 256 KiB, and google.script.run has to
 * carry the base64 form of this (4/3 the size), so keep it modest.
 */
var UPLOAD_CHUNK_BYTES = 512 * 1024;

/** Hard ceiling on a single recording. Guards Drive quota and browser memory. */
var MAX_RECORDING_BYTES = 100 * 1024 * 1024;

/** How long a half-finished upload session stays resumable, in seconds. */
var UPLOAD_SESSION_TTL_SECONDS = 6 * 60 * 60;

/**
 * Top-level Drive folder for recordings, with one subfolder per presentation.
 *
 * Changing this only affects users who have not recorded yet: the folder id is
 * remembered per user, so an existing folder keeps the name it was created
 * with rather than being renamed underneath someone.
 */
var ROOT_FOLDER_NAME = 'Slide Audio Recordings';

/** Document Property key holding this presentation's recording index. */
var PROP_RECORDINGS = 'recordings.v1';

/** Document Property key holding the Drive folder id for this presentation. */
var PROP_FOLDER_ID = 'folderId.v1';

/** User Property key holding per-user preferences. */
var PROP_SETTINGS = 'settings.v1';

/** Support and documentation links surfaced in the sidebar. */
var SUPPORT_URL = 'https://github.com/Initio-Learning-Trust/slides-audio-recorder/blob/main/docs/USER_GUIDE.md';

/**
 * Resolves the full recorder bridge URL, honouring Script Property overrides.
 * @return {{origin: string, url: string}}
 */
function getRecorderTarget() {
  var props = PropertiesService.getScriptProperties();
  var origin = props.getProperty('RECORDER_ORIGIN') || DEFAULT_RECORDER_ORIGIN;
  var path = props.getProperty('RECORDER_PATH') || DEFAULT_RECORDER_PATH;
  origin = String(origin).replace(/\/+$/, '');
  if (origin.indexOf('https://') !== 0) {
    throw new Error('RECORDER_ORIGIN must be an https origin.');
  }
  if (path.charAt(0) !== '/') {
    path = '/' + path;
  }
  return { origin: origin, url: origin + path };
}

/** Default preferences for a user who has never opened Settings. */
function defaultSettings() {
  return {
    sampleRate: 22050,   // 16000 | 22050 | 44100
    sharing: 'domain',   // 'domain' | 'anyone' | 'private'
    addToSpeakerNotes: false
  };
}
