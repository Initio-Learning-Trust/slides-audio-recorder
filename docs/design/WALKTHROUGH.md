# The "Insert ▸ Audio" walkthrough

Google's Slides API has no audio page element, so an add-on cannot place audio
on a slide — only the teacher can, through `Insert ▸ Audio`. The add-on's last
job is therefore to teach that, and this is what does it: an animated
reproduction of the Slides UI walking through both routes to the file.

## Where it lives

| | |
| --- | --- |
| Source | `docs/design/how-to-insert.dc.html` — a Claude Design artboard |
| Compiled | `apps-script/HowTo.html` — generated, do not edit |
| Shown by | `showHowTo()`, as a 900 × 660 modal dialog |
| Reached from | the done panel's **Show me how**, and *Extensions ▸ Audio Recorder ▸ How to add audio to a slide* |

It is a dialog rather than part of the sidebar because it reproduces the Slides
UI at 960 px wide. In a 300 px sidebar none of it would be readable — the
sidebar carries the written steps and the file name instead, which is what that
width is good for.

## Changing it

Edit the artboard in Claude Design, export over `docs/design/how-to-insert.dc.html`,
then:

```bash
npm run build     # recompiles apps-script/HowTo.html
npm test          # fails if the compiled copy is stale
npx clasp push
```

`tools/convert-howto.js` does the compiling. The export depends on the Claude
Design runtime — `<x-dc>`, `<sc-if>`, `{{ bindings }}` and a `DCLogic` class —
none of which can run in an add-on dialog, so the tool rewrites it:

| Export | Compiled |
| --- | --- |
| `<sc-if value="{{ showMenu }}">` | `<div data-when="showMenu">` |
| `{{ caption }}` | `<span data-text="caption"></span>` |
| `onClick="{{ toggle }}"` | `data-action="toggle"` |

The `steps` array is lifted verbatim, so the captions, ordering and timings stay
the designer's. Everything else — the pointer positions, the tab and row
highlights, the click ripple — is reimplemented against the same element ids the
artboard uses. Rename an id in the design and the compiled dialog will still
build but stop pointing at anything, so check it after any structural edit.

## What it must keep

- **Both routes.** Recent for the take just made, My Drive ▸ Slide Audio
  Recordings for an older one.
- **The file naming convention**, because that is how a teacher tells two takes
  apart: `Slide 1 - Listen - 2026-09-08 12.05.20.wav`.
- **The last beat.** The written steps already say what to click; the animation
  earns its place by showing the result — the speaker icon landing on the slide.
- **Pause and Replay.** A teacher reading along needs to stop it.

## Brand

Tokens from [HANDOFF.md](HANDOFF.md): `--ink #283E49`, `--aqua #89CCCA`,
`--yellow #FFCE32`, Manrope throughout, no red. Google's own blues and greys
appear inside the reproduced UI, which is the one place they belong.
