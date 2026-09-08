# Slides Audio Recorder

A Google Workspace Marketplace add-on that lets teachers record narration for the slide they have
open, without leaving Google Slides. Built for language teaching: record a phrase, a model
pronunciation or a listening prompt straight into the deck, with no downloads, no file juggling and
no separate recording app.

```
Google Slides sidebar  ──►  recording window  ──►  Drive (WAV)  ──►  Insert ▸ Audio
   (Apps Script)          record, hear it back,     (drive.file)     (the teacher, guided
                              name it                                 by the walkthrough)
```

## What it does

- **Record from the sidebar.** One button opens a small recording window; you hear the take back
  and name it there, while the sidebar mirrors the live waveform and timer.
- **Save to Drive automatically.** Recordings go into `Slide Audio Recordings / <presentation name>`
  as 16-bit WAV, named by slide number so they are easy to find later.
- **Shows you the last step.** Google only lets you place audio yourself, so the add-on saves the
  file, hands you its name, and plays an animated walkthrough of `Insert ▸ Audio`.
- **Get the sharing right.** The commonest reason classroom audio "doesn't work" is that students
  cannot open the file. Each recording is shared as you choose — organisation-wide, link, or
  private — as it is saved.
- **Keep a per-deck library.** Every recording made in a presentation is listed in the sidebar to
  replay, look up again or delete.
- **Nothing you did not ask for.** The add-on puts no shape, chip or link on your slide.

## Two constraints that shaped the design

Both are Google platform limits, not choices. [docs/RESEARCH.md](docs/RESEARCH.md) has the evidence.

1. **A sidebar cannot use the microphone.** Apps Script serves add-on HTML inside a sandboxed
   iframe whose `Permissions-Policy` omits `microphone`, so `getUserMedia()` throws no matter what
   the user allows. Capture therefore happens in a small top-level window served from our own
   origin, which hands the finished audio back over `postMessage`. That window holds no
   credentials, sets no cookies and talks to no server.
2. **The Slides API cannot insert audio.** There is no `createAudio` request and no audio page
   element — only shapes, images, tables, lines and video. An add-on could drop a linked shape
   instead, but that is a second, worse-behaved control sitting beside the real one, so this one
   teaches the native route rather than competing with it.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps-script/` | The add-on itself. `clasp` root — this is what gets pushed to Apps Script. |
| `recorder/` | The static recording window, deployed to GitHub Pages. |
| `site/` | Landing page, privacy policy and terms, published alongside the recorder. |
| `tools/` | Build helpers: protocol sync, brand-icon inlining, walkthrough compiler, asset stamping. |
| `test/` | Node unit tests, plus a Playwright end-to-end test of the recording bridge. |
| `docs/` | Architecture, deployment runbook, listing copy, security and research notes. |
| `assets/` | Marketplace icons and card banner from Initio's design handoff. |
| `docs/design/` | The design handoff this UI is built to, and the walkthrough's design source. |

## Quick start

```bash
npm install
npm test                 # 46 unit tests
npm run test:e2e         # 9 browser assertions: real mic capture across two origins
npm run build            # regenerate the generated Apps Script files and asset stamps

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
- [Design handoff](docs/design/HANDOFF.md) — the tokens, state machine and animation spec the UI is built to
- [Walkthrough](docs/design/WALKTHROUGH.md) — how the animated Insert ▸ Audio dialog is built and changed
- [Roadmap](docs/ROADMAP.md) — inline playback, MP3, transcripts

## Licence

Apache 2.0. See [LICENSE](LICENSE).
