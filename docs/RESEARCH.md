# Research notes

Everything here was checked before the code was written, because two of the findings rule out the
obvious design. Sources are linked; where a claim comes from community reports rather than Google
documentation, that is said explicitly.

## 1. An Apps Script sidebar cannot use the microphone

**Finding.** `navigator.mediaDevices.getUserMedia()` fails inside an add-on sidebar or an Apps
Script web app with a `DOMException: Permissions policy violation`. Apps Script serves user HTML
inside a nested iframe (`sandboxFrame` → `userHtmlFrame`), and Google omits `microphone` (and
`camera`) from the outer frame's `allow` attribute. Permissions Policy is inherited downwards, so a
nested iframe cannot regain a permission its parent was not granted — hosting our own iframe inside
the sidebar does not help.

**Consequence.** Capture must happen in a browsing context Google does not control: a top-level
window on an origin we own, opened with `window.open()` from the sidebar. This is the same shape as
the community "microphone bridge" pattern.

**Verifying it yourself.** The add-on ships a diagnostic for exactly this claim:
*Extensions > Audio Recorder > Diagnose microphone access*. It reports the frame chain,
whether the permissions policy allows `microphone`, whether a nested iframe of ours that asks for it
is granted it, and what `getUserMedia()` actually throws. The same restriction applies to an Apps
Script **web app** served by `doGet`, not just to sidebars and dialogs: Google wraps all HtmlService
output in the same sandbox, and the `allow` attribute on that outer frame cannot be changed from
within Apps Script.

**Why an external page cannot simply be iframed into the sidebar.** Permissions Policy is inherited,
so a child frame can never regain a permission its ancestors were denied. Setting
`allow="microphone"` on our own iframe has no effect while Google's frame above it lacks the grant.
An embedded recorder would look better integrated and still be unable to record.

**Why not a Chrome extension?** Mote — the best-known voice tool for Slides — solves it that way,
which is why Mote requires a Chrome extension install and does not work in Firefox or Safari. A
popup window costs one extra window but keeps the add-on browser-agnostic and installable from the
Marketplace alone.

- [Apps Script troubleshooting](https://developers.google.com/apps-script/guides/support/troubleshooting)
- [joshm21/microphone-bridge](https://github.com/joshm21/microphone-bridge) — reference implementation of the popup bridge
- [Mote: how do I record audio in Google Slides?](https://support.mote.com/article/61-how-do-i-record-audio-in-google-slides) — extension-based approach
- [MDN: getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/navigator/mediaDevices.getUserMedia)

## 2. The Slides API cannot insert audio

**Finding.** The Slides API v1 can create text boxes, shapes, images, tables, lines, word art,
sheets charts and video. There is no audio page element and no `createAudio` request. Apps Script's
`SlidesApp` mirrors the same surface, so it has no audio insert either. Google Slides *does* support
audio in its own UI (`Insert ▸ Audio`, MP3 and WAV only, from Drive), but that path is not
programmable.

**Consequence.** Three options were considered:

| Option | Playback | Clicks | Verdict |
| --- | --- | --- | --- |
| Linked play control (shape with `setLinkUrl`) | Opens Drive player in a new tab | 1 | **Shipped as default.** Always works, instant. |
| Guided `Insert ▸ Audio` | Native, inline in the slide | ~3, manual | **Shipped as a guided flow.** Best fidelity; the add-on hands over the exact file name to search for. |
| Wrap the audio in a video and use `createVideo` (source `DRIVE`) | Native, inline, supports `autoPlay`/`mute`/`start`/`end` | 1 | **Deferred.** See below. |

**Why the video wrapper is deferred.** It is technically possible — record `canvas.captureStream()`
plus the microphone into one MediaRecorder — and it is the only route to true one-click inline
playback. But Drive must transcode the upload before Slides will accept it, insertion fails while a
video is still processing, and the reliably supported Slides video formats are MP4/MOV/AVI rather
than the WebM most browsers record. That is a lot of failure surface for a teacher mid-lesson. It is
on the [roadmap](ROADMAP.md) behind a feature flag, with a fallback to the linked control.

- [Slides API element operations](https://developers.google.com/slides/samples/elements)
- [Slides API `VideoProperties`](https://developers.google.com/slides/reference/rest/v1/presentations.pages/videos) — `autoPlay`, `mute`, `start`, `end` exist for video
- [Google Workspace Updates: insert videos from Drive](https://workspaceupdates.googleblog.com/2017/02/insert-videos-from-google-drive-in.html)
- Community reports that insertion fails while a Drive video is still processing: [Google Docs Editors Community](https://support.google.com/docs/thread/295316375/error-message-when-trying-to-insert-video-into-google-slides-presentation)

## 3. Editor add-ons are still the right add-on type

**Finding.** Google has announced no deprecation date for Editor add-ons, and Slides remains a
supported host application. The newer Google Workspace add-on type reaches more hosts but is
restricted to `CardService` — it cannot run arbitrary HTML or JavaScript, so it cannot host a
recording UI or drive a `postMessage` handshake.

**Consequence.** This is an Editor add-on written in Apps Script, published through the Google
Workspace Marketplace SDK.

- [Add-on types](https://developers.google.com/workspace/add-ons/concepts/types)
- [Google Workspace add-ons release notes](https://developers.google.com/workspace/add-ons/release-notes)

## 4. The scopes can stay non-sensitive

**Finding.** `drive.file` is a non-sensitive scope: it grants per-file access only to files the app
creates or the user explicitly opens with it. `presentations.currentonly` is the equivalent
current-document scope for Slides. Neither is a restricted scope, so neither triggers the annual
third-party security assessment that the full `drive` scope does.

**Consequence.** The add-on never uses `DriveApp` or the advanced Drive service — both pull in the
full `drive` scope — and talks to the Drive REST API directly over `UrlFetchApp` instead. See
[OAUTH_SCOPES.md](OAUTH_SCOPES.md).

- [Choose Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)
- [Requesting minimum scopes](https://support.google.com/cloud/answer/13807380)

## 5. Audio format: WAV, not MP3 or WebM

**Finding.** Google Slides' native `Insert ▸ Audio` accepts MP3 and WAV only. Browsers'
`MediaRecorder` produces WebM/Opus (or MP4/AAC in Safari and recent Chrome) — neither is accepted by
that dialog, and WebM audio does not preview reliably in Drive. MP3 would need an encoder in the
page; the common JavaScript encoder (`lamejs`) is LGPL, which is awkward to ship in a Marketplace
app.

**Consequence.** The recorder captures raw PCM via an `AudioWorklet` and writes a 16-bit mono WAV
itself — about 90 lines, no dependencies, no licence questions. It plays in Drive's preview
immediately, and is directly usable in `Insert ▸ Audio`. Default sample rate is 22.05 kHz mono
(≈2.6 MB per minute), which is ample for speech; 16 kHz and 44.1 kHz are offered in settings.

## 6. Marketplace listing requirements

Confirmed against Google's current listing documentation, and reflected in
[MARKETPLACE_LISTING.md](MARKETPLACE_LISTING.md):

- Application icons at 32×32 and 128×128 (generated by `tools/make-icons.py`)
- Application card banner at 220×140
- One to ten screenshots, 1280×800 recommended, full bleed with square corners
- Application name ≤ 50 characters; short description ≤ 200; detailed description < 16,000
- Terms of service, privacy policy and support URLs are all required

- [Create a store listing](https://developers.google.com/workspace/marketplace/create-listing)
- [Configure the Marketplace SDK](https://developers.google.com/workspace/marketplace/enable-configure-sdk)
