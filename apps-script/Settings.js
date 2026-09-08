/**
 * Per-user preferences, stored in User Properties so they follow a teacher
 * across every presentation they open.
 */

/** Sample rates we accept from the client, in Hz. */
var ALLOWED_SAMPLE_RATES = [16000, 22050, 44100];
var ALLOWED_SHARING = ['domain', 'anyone', 'private'];

/**
 * @return {Object} The current user's settings, with defaults filled in.
 */
function getSettings() {
  var raw = PropertiesService.getUserProperties().getProperty(PROP_SETTINGS);
  var stored = {};
  if (raw) {
    try {
      stored = JSON.parse(raw) || {};
    } catch (err) {
      stored = {};
    }
  }
  return sanitiseSettings_(stored);
}

/**
 * Persists settings after validation.
 * @param {Object} incoming Partial or complete settings from the sidebar.
 * @return {Object} The stored settings.
 */
function saveSettings(incoming) {
  var merged = sanitiseSettings_(Object.assign({}, getSettings(), incoming || {}));
  PropertiesService.getUserProperties().setProperty(PROP_SETTINGS, JSON.stringify(merged));
  return merged;
}

/**
 * Coerces arbitrary input into a valid settings object. Never throws: bad
 * values silently fall back to the default so a corrupt property cannot lock a
 * user out of the sidebar.
 * @param {Object} s Candidate settings.
 * @return {Object} Valid settings.
 * @private
 */
function sanitiseSettings_(s) {
  var d = defaultSettings();
  s = s || {};
  return {
    sampleRate: ALLOWED_SAMPLE_RATES.indexOf(Number(s.sampleRate)) >= 0 ? Number(s.sampleRate) : d.sampleRate,
    sharing: ALLOWED_SHARING.indexOf(s.sharing) >= 0 ? s.sharing : d.sharing,
    addToSpeakerNotes: s.addToSpeakerNotes === true
  };
}
