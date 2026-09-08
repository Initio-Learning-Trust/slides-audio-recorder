# OAuth scopes

Four scopes, all non-sensitive. None is a restricted scope, so the add-on does not require a
third-party security assessment. The text under each heading is written to be pasted straight into
the justification boxes on the OAuth consent screen and the Marketplace SDK.

## `https://www.googleapis.com/auth/presentations.currentonly`

**What it does:** read and write only the presentation the user has open with the add-on.

**Justification.** The add-on adds a play control to the slide the teacher is on, and reads the
slide list so it can label recordings with the correct slide number. It only ever touches the
presentation the user opened it in. The broader `presentations` scope is not requested because the
add-on has no reason to reach any other file.

## `https://www.googleapis.com/auth/drive.file`

**What it does:** per-file access to files the add-on itself creates.

**Justification.** Recordings are saved as WAV files in a folder the add-on creates
(`Slides Audio Recorder / <presentation name>`). The add-on needs to create that folder, upload the
audio, read back the file's link and name, apply the sharing the teacher chose, rename a recording,
and move one to the bin when asked. All of that is limited to files the add-on created. The full
`drive` scope is deliberately avoided: the add-on never uses `DriveApp` or the advanced Drive
service, because both request full Drive access; it calls the Drive REST API directly instead.

## `https://www.googleapis.com/auth/script.container.ui`

**What it does:** show the sidebar and dialogs inside Google Slides.

**Justification.** The entire user interface is a sidebar opened from
*Extensions ▸ Slides Audio Recorder*, plus a short help dialog.

## `https://www.googleapis.com/auth/script.external_request`

**What it does:** allow the server-side script to make outbound HTTPS requests.

**Justification.** Used solely to call the Google Drive REST API
(`https://www.googleapis.com/`) for the resumable upload and file operations described above. The
manifest pins `urlFetchWhitelist` to `https://www.googleapis.com/`, so the add-on cannot make a
request anywhere else. No data is sent to any third party.

## What the add-on does not ask for

- No `drive` / `drive.readonly` — it never sees files it did not create.
- No `presentations` — it never sees a deck other than the open one.
- No `userinfo.email` or `userinfo.profile` — the user's domain, used for organisation-wide
  sharing, comes from Drive's own `about.get` under `drive.file`.
- No `gmail.*`, `calendar.*`, `contacts.*`, or anything else.

## Data handling summary for the review form

Audio is captured in the user's browser, encoded there, passed to the add-on and written straight to
the user's own Google Drive. The developer operates no backend: the only server the project
publishes is a static page containing the recording UI, which holds no credentials, sets no cookies,
stores nothing and makes no network requests. No user data is transmitted to, stored by, or
accessible to the developer.
