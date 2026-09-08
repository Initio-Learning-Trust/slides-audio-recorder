/**
 * The per-presentation recording library.
 *
 * Records live in Document Properties so they travel with the deck: a
 * co-teacher who opens the same presentation sees the same recordings, and the
 * index disappears if the deck is deleted. Each recording gets its own
 * property key because a single property value is capped at 9 KB.
 */

/** Prefix for a single recording's property key. */
var RECORDING_PROP_PREFIX = 'rec.';

/**
 * @return {!Array<Object>} Recordings for this deck, newest first.
 */
function listRecordings() {
  var props = PropertiesService.getDocumentProperties();
  var order = readOrder_(props);
  var out = [];
  order.forEach(function (fileId) {
    var raw = props.getProperty(RECORDING_PROP_PREFIX + fileId);
    if (!raw) {
      return;
    }
    try {
      out.push(JSON.parse(raw));
    } catch (err) {
      // A corrupt entry should not blank the whole list.
    }
  });
  return out;
}

/**
 * Adds a recording to the front of the index.
 * @param {Object} recording Recording record.
 * @private
 */
function addRecordingToLibrary_(recording) {
  var props = PropertiesService.getDocumentProperties();
  var order = readOrder_(props).filter(function (id) {
    return id !== recording.fileId;
  });
  order.unshift(recording.fileId);
  props.setProperty(RECORDING_PROP_PREFIX + recording.fileId, JSON.stringify(recording));
  writeOrder_(props, order);
}

/**
 * Renames a recording in both Drive and the library.
 * @param {string} fileId Drive file id.
 * @param {string} label New label.
 * @return {!Array<Object>} The refreshed library.
 */
function renameRecording(fileId, label) {
  var props = PropertiesService.getDocumentProperties();
  var raw = props.getProperty(RECORDING_PROP_PREFIX + fileId);
  if (!raw) {
    throw new Error('That recording is no longer in this presentation.');
  }
  var recording = JSON.parse(raw);
  var cleanLabel = sanitiseNameFragment(label, 60);
  var newName = buildRecordingFileName(cleanLabel, slideNumberFor_(recording.slideObjectId),
      new Date(recording.createdAt || Date.now()));
  driveFetch_('patch', DRIVE_API + '/files/' + encodeURIComponent(fileId) +
      '?fields=id,name&supportsAllDrives=true', {
    payload: JSON.stringify({ name: newName })
  });
  recording.label = cleanLabel;
  recording.name = newName;
  props.setProperty(RECORDING_PROP_PREFIX + fileId, JSON.stringify(recording));
  return listRecordings();
}

/**
 * Moves a recording to the Drive bin and drops it from the library.
 *
 * Anything already placed on a slide keeps pointing at the file, so we warn in
 * the UI before calling this.
 *
 * @param {string} fileId Drive file id.
 * @return {!Array<Object>} The refreshed library.
 */
function deleteRecording(fileId) {
  var props = PropertiesService.getDocumentProperties();
  try {
    driveFetch_('patch', DRIVE_API + '/files/' + encodeURIComponent(fileId) +
        '?fields=id&supportsAllDrives=true', {
      payload: JSON.stringify({ trashed: true })
    });
  } catch (err) {
    // Already gone from Drive: still clear it from the library below.
  }
  props.deleteProperty(RECORDING_PROP_PREFIX + fileId);
  writeOrder_(props, readOrder_(props).filter(function (id) {
    return id !== fileId;
  }));
  return listRecordings();
}

/**
 * Updates the sharing mode of an existing recording.
 * @param {string} fileId Drive file id.
 * @param {string} mode One of 'domain', 'anyone', 'private'.
 * @return {!Array<Object>} The refreshed library.
 */
function updateRecordingSharing(fileId, mode) {
  var props = PropertiesService.getDocumentProperties();
  var raw = props.getProperty(RECORDING_PROP_PREFIX + fileId);
  if (!raw) {
    throw new Error('That recording is no longer in this presentation.');
  }
  var recording = JSON.parse(raw);
  var applied = applySharing_(fileId, mode);
  recording.sharing = applied.mode;
  recording.sharingNote = applied.note;
  props.setProperty(RECORDING_PROP_PREFIX + fileId, JSON.stringify(recording));
  return listRecordings();
}

/**
 * @param {!Properties} props Document properties.
 * @return {!Array<string>} Ordered file ids.
 * @private
 */
function readOrder_(props) {
  var raw = props.getProperty(PROP_RECORDINGS);
  if (!raw) {
    return [];
  }
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

/**
 * @param {!Properties} props Document properties.
 * @param {!Array<string>} order Ordered file ids.
 * @private
 */
function writeOrder_(props, order) {
  props.setProperty(PROP_RECORDINGS, JSON.stringify(order));
}
