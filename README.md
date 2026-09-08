# Slides Audio Recorder

A Google Workspace Marketplace add-on that lets teachers record audio from a sidebar in Google
Slides and put it on the slide in one click. Built for language teaching: record a phrase, a model
pronunciation or a listening prompt directly into the deck, with no downloads, no file juggling and
no separate recording app.

```
Google Slides sidebar  ──►  recording window  ──►  Drive (WAV)  ──►  play button on the slide
   (Apps Script)            (our own origin)      (drive.file)        (linked shape)
```

## What it does

- **Record from the sidebar.** One button opens a recording window with a level meter, live
  waveform, timer and playback preview. Re-record until you are happy with it.
- **Save to Drive automatically.** Recordings go into `Slides Audio Recorder / <presentation name>`
  as 16-bit WAV, named by slide number so they are easy to find later.
- **Insert with one click.** A play control (blue button, small round button, or plain hyperlinked
  text) is added to the current slide, linked to the recording.
- **Get the sharing right.** The commonest reason classroom audio "doesn't work" is that students
  cannot open the file. Each recording is shared as you choose — organisation-wide, link, or
  private — as it is saved.
- **Keep a per-deck library.** Every recording made in a presentation is listed in the sidebar to
  replay, re-insert on another slide, rename or delete.
- **Guided native insert.** For playback *inside* the slide, the sidebar hands you the exact file
  name to search for in `Insert ▸ Audio`, plus a link to the Drive folder.

## Two constraints that shaped the design

Both are Google platform limits, not choices. [docs/RESEARCH.md](docs/RESEARCH.md) has the evidence.

1. **A sidebar cannot use the microphone.** Apps Script serves add-on HTML inside a sandboxed
   iframe whose `Permissions-Policy` omits `microphone`, so `getUserMedia()` throws no matter what
   the user allows. Capture therefore happens in a small top-level window served from our own
   origin, which hands the finished audio back over `postMessage`. That window holds no
   credentials, sets no cookies and talks to no server.
2. **The Slides API cannot insert native audio.** There is no `createAudio` request and no audio
   page element — only shapes, images, tables, lines and video. So the add-on inserts a linked play
   control (works everywhere, one click) and *also* walks you through `Insert ▸ Audio` when you want
   Google's own inline player.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps-script/` | The add-on itself. `clasp` root — this is what gets pushed to Apps Script. |
| `recorder/` | The static recording window, deployed to GitHub Pages. |
| `site/` | Landing page, privacy policy and terms, published alongside the recorder. |
| `tools/` | Build helpers: protocol sync, Marketplace icon generation. |
| `test/` | Node unit tests, plus a Playwright end-to-end test of the recording bridge. |
| `docs/` | Architecture, deployment runbook, listing copy, security and research notes. |
| `assets/` | Generated Marketplace icons and card banner. |

## Quick start

```bash
npm install
npm test                 # 44 unit tests
npm run test:e2e         # 8 browser assertions: real mic capture across two origins
npm run build            # regenerate apps-script/Protocol.html from the shared source

npx clasp login
npx clasp create --title "Slides Audio Recorder" --type slides --rootDir apps-script
npx clasp push
```

Then follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) to publish the recording window, link a Cloud
project and configure the Marketplace SDK.

## Documentation

- [User guide](docs/USER_GUIDE.md) — for teachers
- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit together
- [Deployment runbook](docs/DEPLOYMENT.md) — clasp, Cloud project, Marketplace SDK, publishing
- [Marketplace listing copy](docs/MARKETPLACE_LISTING.md) — ready-to-paste store text and assets
- [OAuth scopes](docs/OAUTH_SCOPES.md) — what each scope is for, for the review form
- [Security model](docs/SECURITY.md) — trust boundaries and threat model
- [Test plan](docs/TESTING.md) — automated coverage and the manual pass before a release
- [Research notes](docs/RESEARCH.md) — the platform limits, with sources
- [Roadmap](docs/ROADMAP.md) — inline playback, MP3, transcripts

## Licence

Apache 2.0. See [LICENSE](LICENSE).
