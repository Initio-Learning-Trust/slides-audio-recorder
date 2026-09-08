# Security model

## Trust boundaries

```
  Google Slides / Apps Script          our static origin              Google Drive
 ┌──────────────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
 │ sidebar (sandboxed)      │◄────►│ recording window     │      │ user's own files │
 │ server code + OAuth token│      │ no token, no storage │      │                  │
 └──────────┬───────────────┘      └──────────────────────┘      └────────▲─────────┘
            │                                                             │
            └───────────────── ScriptApp.getOAuthToken() ──────────────────┘
```

The OAuth token exists only in the Apps Script server context. It is never sent to the browser,
never put in a URL, and never given to the recording window.

## What the recording window can and cannot do

**Can:** open the microphone, encode a WAV, post it to the window that opened it.

**Cannot:** read or write Drive, read the presentation, see the user's identity, read cookies (it
sets none), persist anything (it uses no storage), or contact any server (it makes no requests after
loading its own three files).

If the static host were compromised, the attacker could change what the recording window shows and
what audio it returns to a user who presses Record. They could not reach any user's Drive or Slides
data, and the compromise would be visible in the page source. This is the reason the audio is
relayed through the sidebar rather than uploaded directly by the window with a borrowed token.

## Message channel

Every message crossing the boundary is validated identically at both ends by
`SarProtocol.accept()`:

1. `event.origin` must equal the expected peer origin exactly.
2. The envelope must carry `source: 'slides-audio-recorder'` and the current protocol version.
3. The nonce must match the one generated for this recording session
   (`crypto.randomUUID()`, fresh per window, never reused, never persisted).
4. The type must be one of the known message types.

Outbound messages always specify an explicit `targetOrigin` — never `'*'`. The launch URL's origin
parameter is validated against an https origin pattern before use, so a crafted URL cannot make the
window post audio to an arbitrary host.

## Input validation

- Settings are re-validated on every read and write; an unknown value falls back to the default
  rather than being stored (`sanitiseSettings_`).
- Upload chunks must land exactly at the session's current offset, must not overrun the declared
  size, and only the final chunk may be short (`validateChunk`). A user lock serialises them.
- File names are stripped of control characters and path separators and length-capped.
- The declared recording size is checked against a 100 MB ceiling before a Drive session is opened.
- `urlFetchWhitelist` in the manifest restricts all outbound server requests to
  `https://www.googleapis.com/`.

## Sharing

Recordings are private to their owner until the add-on applies the sharing mode the teacher chose.
Organisation-wide sharing is attempted first when selected; if a Workspace policy blocks it, the
add-on falls back to link sharing, and if that is blocked too the file stays private and the
sidebar says so rather than silently leaving students unable to listen.

Deleting a recording moves it to the Drive bin rather than deleting it permanently, and the
confirmation warns that play controls already on slides will stop working.

## Reporting a vulnerability

Email the maintainers at the address on the Marketplace listing. Please do not open a public issue
for a security problem.
