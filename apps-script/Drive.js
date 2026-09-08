/**
 * Thin Drive v3 client built on UrlFetchApp.
 *
 * We deliberately avoid DriveApp and the advanced Drive service: both pull in
 * the full `drive` scope, which is "restricted" and would drag the add-on into
 * an annual third-party security assessment. Talking to the REST API directly
 * lets the whole add-on live on `drive.file`, which only ever grants access to
 * files this add-on created.
 */

var DRIVE_API = 'https://www.googleapis.com/drive/v3';
var DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Performs a Drive API request and parses the JSON response.
 * @param {string} method HTTP method.
 * @param {string} url Absolute URL.
 * @param {Object=} options Optional payload/headers/contentType.
 * @return {Object} Parsed response body ({} for 204).
 * @private
 */
function driveFetch_(method, url, options) {
  options = options || {};
  var params = {
    method: method,
    muteHttpExceptions: true,
    headers: Object.assign({ Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, options.headers || {})
  };
  if (options.payload !== undefined) {
    params.payload = options.payload;
    params.contentType = options.contentType || 'application/json; charset=UTF-8';
  }
  var response = UrlFetchApp.fetch(url, params);
  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code >= 200 && code < 300) {
    return text ? JSON.parse(text) : {};
  }
  throw new Error(describeDriveError_(code, text));
}

/**
 * Turns a Drive error body into something a teacher can act on.
 * @param {number} code HTTP status.
 * @param {string} text Response body.
 * @return {string} Human-readable message.
 * @private
 */
function describeDriveError_(code, text) {
  var detail = '';
  try {
    var parsed = JSON.parse(text);
    detail = (parsed.error && parsed.error.message) || '';
  } catch (err) {
    detail = String(text || '').slice(0, 200);
  }
  if (code === 401 || code === 403) {
    if (/storage quota|quotaExceeded/i.test(detail)) {
      return 'Your Google Drive is full, so the recording could not be saved. Free up space and try again.';
    }
    return 'Google Drive refused the request (' + code + '). ' + detail;
  }
  if (code === 404) {
    return 'The file could not be found in Drive. It may have been deleted or moved out of this add-on’s reach.';
  }
  return 'Drive error ' + code + (detail ? ': ' + detail : '');
}

/**
 * @return {{emailAddress: string, domain: string}} The signed-in Drive user.
 * @private
 */
function getDriveUser_() {
  var about = driveFetch_('get', DRIVE_API + '/about?fields=user(emailAddress,displayName)');
  var email = (about.user && about.user.emailAddress) || '';
  var at = email.lastIndexOf('@');
  return { emailAddress: email, domain: at >= 0 ? email.slice(at + 1) : '' };
}

/**
 * Creates a Drive folder.
 * @param {string} name Folder name.
 * @param {string=} parentId Optional parent folder id.
 * @return {string} The new folder id.
 * @private
 */
function createFolder_(name, parentId) {
  var metadata = { name: name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) {
    metadata.parents = [parentId];
  }
  var file = driveFetch_('post', DRIVE_API + '/files?fields=id&supportsAllDrives=true', {
    payload: JSON.stringify(metadata)
  });
  return file.id;
}

/**
 * Confirms a file id still exists and is not in the trash.
 * @param {string} fileId Drive file id.
 * @return {boolean} True when the file is usable.
 * @private
 */
function fileIsLive_(fileId) {
  if (!fileId) {
    return false;
  }
  try {
    var file = driveFetch_('get', DRIVE_API + '/files/' + encodeURIComponent(fileId) +
        '?fields=id,trashed&supportsAllDrives=true');
    return !file.trashed;
  } catch (err) {
    return false;
  }
}

/**
 * Returns the add-on's top-level Drive folder, creating it when needed.
 * @return {string} Folder id.
 * @private
 */
function getRootFolderId_() {
  var props = PropertiesService.getUserProperties();
  var cached = props.getProperty('rootFolderId.v1');
  if (fileIsLive_(cached)) {
    return cached;
  }
  var id = createFolder_(ROOT_FOLDER_NAME);
  props.setProperty('rootFolderId.v1', id);
  return id;
}

/**
 * Returns the per-presentation folder id.
 * @param {boolean} create Create the folder when it does not exist yet.
 * @return {?string} Folder id, or null when absent and create is false.
 */
function getPresentationFolderId_(create) {
  var props = PropertiesService.getDocumentProperties();
  var cached = props.getProperty(PROP_FOLDER_ID);
  if (fileIsLive_(cached)) {
    return cached;
  }
  if (!create) {
    return null;
  }
  var presentation = SlidesApp.getActivePresentation();
  var id = createFolder_(presentation.getName(), getRootFolderId_());
  props.setProperty(PROP_FOLDER_ID, id);
  return id;
}

/**
 * @return {?string} URL of this presentation's recordings folder, if it exists.
 */
function getPresentationFolderUrl() {
  var id = getPresentationFolderId_(false);
  return id ? 'https://drive.google.com/drive/folders/' + id : null;
}

/**
 * Opens a Drive resumable upload session.
 * @param {string} name File name.
 * @param {string} mimeType File MIME type.
 * @param {string} parentId Destination folder id.
 * @param {number} totalBytes Total size of the upload.
 * @return {string} The session URI to PUT chunks to.
 * @private
 */
function startResumableUpload_(name, mimeType, parentId, totalBytes) {
  var url = DRIVE_UPLOAD_API + '/files?uploadType=resumable&supportsAllDrives=true';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json; charset=UTF-8',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(totalBytes)
    },
    payload: JSON.stringify({ name: name, mimeType: mimeType, parents: [parentId] })
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error(describeDriveError_(code, response.getContentText()));
  }
  var headers = response.getAllHeaders();
  var location = headers.Location || headers.location;
  if (Array.isArray(location)) {
    location = location[0];
  }
  if (!location) {
    throw new Error('Drive did not return an upload session. Please try again.');
  }
  return location;
}

/**
 * Uploads one chunk of a resumable session.
 * @param {string} sessionUri Session URI from startResumableUpload_.
 * @param {!Array<number>} bytes Chunk bytes as signed byte values.
 * @param {number} start Offset of this chunk within the file.
 * @param {number} total Total file size.
 * @return {{done: boolean, file: ?Object}} Result; file is set on the last chunk.
 * @private
 */
function uploadChunk_(sessionUri, bytes, start, total) {
  var end = start + bytes.length - 1;
  var response = UrlFetchApp.fetch(sessionUri, {
    method: 'put',
    muteHttpExceptions: true,
    contentType: 'application/octet-stream',
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Range': 'bytes ' + start + '-' + end + '/' + total
    },
    payload: Utilities.newBlob(bytes, 'application/octet-stream')
  });
  var code = response.getResponseCode();
  if (code === 308) {
    return { done: false, file: null };
  }
  if (code >= 200 && code < 300) {
    var body = response.getContentText();
    return { done: true, file: body ? JSON.parse(body) : {} };
  }
  throw new Error(describeDriveError_(code, response.getContentText()));
}

/**
 * Reads the fields the sidebar needs about a saved recording.
 * @param {string} fileId Drive file id.
 * @return {Object} File metadata.
 * @private
 */
function getFileMeta_(fileId) {
  return driveFetch_('get', DRIVE_API + '/files/' + encodeURIComponent(fileId) +
      '?fields=id,name,size,webViewLink,webContentLink,mimeType,createdTime&supportsAllDrives=true');
}

/**
 * Applies the requested sharing mode to a recording.
 *
 * Students cannot hear a recording they have no permission to open, which is
 * the single most common reason audio "does not work" in a shared deck, so we
 * make the choice explicit rather than leaving files private by default.
 *
 * @param {string} fileId Drive file id.
 * @param {string} mode One of 'domain', 'anyone', 'private'.
 * @return {{mode: string, note: string}} The mode actually applied.
 * @private
 */
function applySharing_(fileId, mode) {
  if (mode === 'private') {
    return { mode: 'private', note: 'Only you can open this recording.' };
  }
  var base = DRIVE_API + '/files/' + encodeURIComponent(fileId) +
      '/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id';
  if (mode === 'domain') {
    var user = getDriveUser_();
    if (user.domain) {
      try {
        driveFetch_('post', base, {
          payload: JSON.stringify({ role: 'reader', type: 'domain', domain: user.domain })
        });
        return { mode: 'domain', note: 'Anyone at ' + user.domain + ' with the link can listen.' };
      } catch (err) {
        // Domain sharing is often switched off for education tenants; fall
        // through to link sharing rather than failing the whole save.
      }
    }
  }
  try {
    driveFetch_('post', base, {
      payload: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    return { mode: 'anyone', note: 'Anyone with the link can listen.' };
  } catch (err) {
    return {
      mode: 'private',
      note: 'Your organisation blocks link sharing, so the recording stayed private. ' +
            'Share it manually if students need to hear it.'
    };
  }
}
