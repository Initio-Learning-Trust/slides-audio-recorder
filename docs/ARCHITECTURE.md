# Architecture

## The pieces

```
┌─ Google Slides ─────────────────────────────────────────────┐
│                                                             │
│  ┌─ sidebar (Apps Script HtmlService) ────────────────────┐  │
│  │  Sidebar.html + SidebarJs.html + Protocol.html        │  │
│  │  no microphone: sandboxed iframe, no Permissions      │  │
│  │  Policy grant                                          │  │
│  └──────┬──────────────────────────────▲──────────────────┘  │
│         │ window.open()                │ postMessage         │
└─────────┼──────────────────────────────┼─────────────────────┘
          │                              │
   ┌──────▼──────────────────────────────┴──────┐
   │  recording window (our own https origin)   │
   │  getUserMedia → AudioWorklet → WAV         │
   │  no cookies, no storage, no network calls  │
   └────────────────────────────────────────────┘
          │ audio bytes (ArrayBuffer)
          ▼
   ┌─ sidebar ────────────────┐   google.script.run   ┌─ Apps Script server ──┐
   │  slice into 512 KiB      │──────────────────────►│  Upload.js            │
   │  base64 chunks           │                       │  relays each chunk    │
   └──────────────────────────┘                       │  into a Drive         │
                                                      │  resumable session    │
                                                      └──────────┬────────────┘
                                                                 │ drive.file
                                                                 ▼
                                            Drive: Slides Audio Recorder / <deck> / *.wav
                                                                 │
                                                                 ▼
                                            Slides: linked play control on the current slide
```

## Why a separate recording window

Add-on HTML is served inside a nested, sandboxed iframe. Google omits `microphone` from that
frame's `allow` attribute, and Permissions Policy is inherited, so nothing rendered inside the
sidebar can open a microphone — including an iframe of our own. A top-level window on an origin we
control has no such restriction. See [RESEARCH.md](RESEARCH.md) §1.

The window is deliberately dumb. It receives its parameters in the launch URL, captures audio,
encodes a WAV in memory and posts the bytes back. It has no OAuth token, no cookies, no storage and
makes no network requests of its own. If it were compromised tomorrow, the attacker would gain the
ability to serve a different recording UI to users who click Record — not access to anybody's Drive.

## The handshake

`recorder/lib/protocol.js` is the single source of truth for the message contract and is copied into
the Apps Script project as `Protocol.html` by `npm run build`, so the two ends cannot drift. CI
fails if the generated copy is stale.

| Step | From → to | Message | Notes |
| --- | --- | --- | --- |
| 1 | sidebar → window | launch URL | carries the sidebar's origin, a fresh nonce, sample rate, size cap |
| 2 | window → sidebar | `ready` | posted to `window.opener` at the origin from the URL |
| 3 | sidebar → window | `ack` | sidebar confirms it is listening |
| 4 | window → sidebar | `state` | recording started (drives the sidebar status line) |
| 5 | window → sidebar | `audio` | the WAV as an `ArrayBuffer`, plus duration, sample rate, label |
| 6 | sidebar → window | `accepted` / `rejected` | on failure the window keeps the audio so it can be resent |

Both ends run every inbound message through `SarProtocol.accept()`, which checks the origin, the
envelope marker, the protocol version, the nonce and the message type. The nonce is generated per
recording session with `crypto.randomUUID()` and never leaves the two pages.

## Why the audio is relayed rather than uploaded directly

The recording window could upload to Drive itself if the sidebar handed it an OAuth token — that is
how several add-ons do it, and it would be faster. It would also mean a token with Drive write
access living in a page served from static hosting.

Instead the bytes come back to the sidebar and go to the Apps Script server through
`google.script.run`, which relays them into a Drive resumable upload session using
`ScriptApp.getOAuthToken()` server-side. No credential ever leaves Google's origins. The cost is one
extra hop and base64 overhead; the benefit is a security story that survives review and a static
host that is worthless to an attacker.

## Chunking

`google.script.run` arguments are not a good place for multi-megabyte payloads, and Drive's
resumable protocol requires every chunk except the last to be a multiple of 256 KiB. The upload is
therefore split into 512 KiB chunks (≈683 KB once base64-encoded).

- `beginUpload()` opens the Drive session and stores `{sessionUri, offset, total, ...}` in User
  Properties, keyed by a UUID.
- `pushChunk()` validates that the chunk lands exactly at the current offset (`validateChunk()` in
  `Naming.js`), PUTs it with the right `Content-Range`, and advances the offset. Drive answers `308`
  until the last chunk, then returns the file resource.
- A `LockService` user lock serialises chunks so two windows cannot interleave.
- `abortUpload()` cancels the Drive session; `cleanUpStaleUploads()` clears sessions abandoned by a
  closed tab.

User Properties are used rather than `CacheService` because the cache may evict an entry mid-upload,
and a session record is well under the 9 KB per-property limit.

## Server modules

| File | Responsibility |
| --- | --- |
| `Code.js` | Menu, sidebar, help dialog, bootstrap payload |
| `Config.js` | Constants and Script Property overrides (recorder origin, chunk size, limits) |
| `Settings.js` | Per-user preferences, validated on every read and write |
| `Drive.js` | Drive v3 over `UrlFetchApp`: folders, resumable upload, metadata, sharing |
| `Upload.js` | Upload sessions and chunk relay |
| `Library.js` | Per-presentation recording index in Document Properties |
| `SlidesService.js` | Slide resolution and play-control insertion |
| `Layout.js` | Pure geometry for the play control (unit tested) |
| `Naming.js` | Pure naming, formatting and chunk validation (unit tested) |

`Layout.js` and `Naming.js` end with a CommonJS export guard so Node can require them directly; the
guard is inert inside Apps Script.

## Where state lives

| State | Store | Lifetime |
| --- | --- | --- |
| Recording index for a deck | Document Properties | With the presentation |
| Drive folder id for a deck | Document Properties | With the presentation |
| Teacher preferences | User Properties | Across all decks, per user |
| Root Drive folder id | User Properties | Per user |
| In-flight upload sessions | User Properties | 6 hours, then swept |
| Recorder origin override | Script Properties | Per deployment |

Nothing about a recording is stored outside the user's own Google account.
