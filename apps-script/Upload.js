/**
 * Chunked transfer of a recording from the sidebar into Drive.
 *
 * The audio never touches a third-party server. The recorder popup hands raw
 * bytes to the sidebar over postMessage; the sidebar slices them into base64
 * chunks and calls in here; we relay each chunk straight into a Drive
 * resumable upload session. No OAuth token ever leaves Google's origins.
 */

/** Prefix for the User Property that holds an in-flight upload session. */
var UPLOAD_PROP_PREFIX = 'up.';

/**
 * Opens an upload session.
 * @param {{totalBytes: number, durationMs: number, sampleRate: number,
 *          label: string, slideObjectId: ?string}} meta Recording metadata.
 * @return {{uploadId: string, chunkBytes: number, chunks: number, name: string}}
 */
function beginUpload(meta) {
  meta = meta || {};
  var total = Number(meta.totalBytes);
  if (!(total > 0)) {
    throw new Error('The recording was empty, so there was nothing to save.');
  }
  if (total > MAX_RECORDING_BYTES) {
    throw new Error('That recording is larger than the ' +
        Math.round(MAX_RECORDING_BYTES / (1024 * 1024)) + ' MB limit. Please record a shorter clip.');
  }

  var slide = resolveSlide_(meta.slideObjectId);
  var name = buildRecordingFileName(meta.label, slide ? slide.number : null, new Date());
  var folderId = getPresentationFolderId_(true);
  var sessionUri = startResumableUpload_(name, 'audio/wav', folderId, total);
  var uploadId = Utilities.getUuid();

  var session = {
    sessionUri: sessionUri,
    total: total,
    offset: 0,
    chunkBytes: UPLOAD_CHUNK_BYTES,
    name: name,
    folderId: folderId,
    durationMs: Number(meta.durationMs) || 0,
    sampleRate: Number(meta.sampleRate) || 0,
    label: sanitiseNameFragment(meta.label, 60),
    slideObjectId: slide ? slide.objectId : null,
    createdAt: Date.now()
  };
  saveUploadSession_(uploadId, session);

  return {
    uploadId: uploadId,
    chunkBytes: UPLOAD_CHUNK_BYTES,
    chunks: chunkCount(total, UPLOAD_CHUNK_BYTES),
    name: name
  };
}

/**
 * Accepts one chunk of the recording.
 * @param {string} uploadId Session id from beginUpload.
 * @param {number} index 0-based chunk index.
 * @param {string} base64 Base64-encoded chunk bytes.
 * @return {{offset: number, total: number, done: boolean, recording: ?Object}}
 */
function pushChunk(uploadId, index, base64) {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Another upload is still running. Please wait a moment and try again.');
  }
  try {
    var session = loadUploadSession_(uploadId);
    var bytes = Utilities.base64Decode(base64);
    var problem = validateChunk(Number(index), session.chunkBytes, session.offset, bytes.length, session.total);
    if (problem) {
      throw new Error(problem);
    }

    var result = uploadChunk_(session.sessionUri, bytes, session.offset, session.total);
    session.offset += bytes.length;

    if (!result.done) {
      saveUploadSession_(uploadId, session);
      return { offset: session.offset, total: session.total, done: false, recording: null };
    }

    clearUploadSession_(uploadId);
    var recording = finaliseRecording_(result.file, session);
    return { offset: session.offset, total: session.total, done: true, recording: recording };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cancels an in-flight upload and asks Drive to discard the partial file.
 * @param {string} uploadId Session id from beginUpload.
 * @return {{cancelled: boolean}}
 */
function abortUpload(uploadId) {
  var session = null;
  try {
    session = loadUploadSession_(uploadId);
  } catch (err) {
    return { cancelled: false };
  }
  clearUploadSession_(uploadId);
  try {
    UrlFetchApp.fetch(session.sessionUri, {
      method: 'delete',
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    });
  } catch (err) {
    // Abandoned sessions expire on Drive's side within a week; nothing to do.
  }
  return { cancelled: true };
}

/**
 * Applies sharing, records the file in this deck's library and returns the
 * sidebar's view of the finished recording.
 * @param {Object} file Drive file resource from the final chunk.
 * @param {Object} session The upload session.
 * @return {Object} Recording record.
 * @private
 */
function finaliseRecording_(file, session) {
  var settings = getSettings();
  var sharing = applySharing_(file.id, settings.sharing);
  var meta = getFileMeta_(file.id);
  var recording = {
    fileId: meta.id,
    name: meta.name,
    url: meta.webViewLink,
    sizeBytes: Number(meta.size) || session.total,
    durationMs: session.durationMs,
    sampleRate: session.sampleRate,
    label: session.label,
    slideObjectId: session.slideObjectId,
    createdAt: meta.createdTime || new Date().toISOString(),
    sharing: sharing.mode,
    sharingNote: sharing.note
  };
  addRecordingToLibrary_(recording);
  return recording;
}

/**
 * @param {string} uploadId Session id.
 * @param {Object} session Session state.
 * @private
 */
function saveUploadSession_(uploadId, session) {
  PropertiesService.getUserProperties()
      .setProperty(UPLOAD_PROP_PREFIX + uploadId, JSON.stringify(session));
}

/**
 * @param {string} uploadId Session id.
 * @return {Object} Session state.
 * @private
 */
function loadUploadSession_(uploadId) {
  var raw = PropertiesService.getUserProperties().getProperty(UPLOAD_PROP_PREFIX + uploadId);
  if (!raw) {
    throw new Error('This upload has expired. Please record again.');
  }
  var session = JSON.parse(raw);
  if (Date.now() - session.createdAt > UPLOAD_SESSION_TTL_SECONDS * 1000) {
    clearUploadSession_(uploadId);
    throw new Error('This upload has expired. Please record again.');
  }
  return session;
}

/**
 * @param {string} uploadId Session id.
 * @private
 */
function clearUploadSession_(uploadId) {
  PropertiesService.getUserProperties().deleteProperty(UPLOAD_PROP_PREFIX + uploadId);
}

/**
 * Removes upload sessions left behind by closed tabs. Safe to call often.
 * @return {number} How many stale sessions were cleared.
 */
function cleanUpStaleUploads() {
  var props = PropertiesService.getUserProperties();
  var all = props.getProperties();
  var cutoff = Date.now() - UPLOAD_SESSION_TTL_SECONDS * 1000;
  var removed = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(UPLOAD_PROP_PREFIX) !== 0) {
      return;
    }
    var stale = true;
    try {
      stale = JSON.parse(all[key]).createdAt < cutoff;
    } catch (err) {
      stale = true;
    }
    if (stale) {
      props.deleteProperty(key);
      removed++;
    }
  });
  return removed;
}
