# Initio Audio Recorder for Google Slides — build handoff

Hand this whole folder to Claude Code. `Sidebar.html` is the finished UI, animations included, and it also opens directly in a browser (the `google.script.run` bridge is stubbed at the bottom of the script, so the flow is clickable without Apps Script).

## Files

| File | What it is |
| --- | --- |
| `Sidebar.html` | Apps Script HTML Service sidebar: full record → review → insert flow, tokens in `:root`, all animations |
| `Code.gs` | Server side: `onOpen`, `showSidebar`, `insertRecording`, `listClips` |
| `icons/` | App icon at 16/32/64/128/256/1024 and marketplace card banner |

## The one real constraint — read first

**The Slides API cannot insert a native audio element.** Audio in Slides can only be added through the Google Slides UI (Insert → Audio). So `insertRecording` in `Code.gs` does the honest workaround: it saves the recording to Drive and places a branded, link-bearing chip on the current slide, tagged in the shape description as `initio-audio:<fileId>:<mode>` so clips can be listed and managed later.

Three options for the product, pick one before building further:
1. Ship the linked chip (what `Code.gs` does now). Works today, plays in a new tab, not inside presentation mode.
2. Save to Drive and prompt the user to run Insert → Audio, pre-filtered to the recordings folder. Native playback, one manual step.
3. Ship as a Drive-side companion only and drop the in-slide insert.

Do not let the UI promise native in-slide playback until this is settled — the copy in the review panel says "Insert into current slide", which option 1 satisfies.

## State machine

Four panels, one visible at a time, cross-faded (`.panel[data-active]` + `panelIn`):

`idle` → `rec` → `review` → `done`, with `Re-record` and `Record another clip` both returning to `idle`.

Every state has exactly one primary action. Never two filled buttons on screen.

## Animation spec

| Element | Behaviour |
| --- | --- |
| Panel change | 340ms, opacity 0→1 + 6px rise, `cubic-bezier(.22,.61,.36,1)` |
| Record button | Hover lifts 1px and deepens the shadow; press scales to .94 |
| Record → stop glyph | The white capsule morphs to a rounded square in 260ms (width/height/radius), no icon swap |
| Recording ring | Two yellow rings, `pulse` 1.6s, second offset 550ms, scale 1→1.55 fading to 0 |
| Status dot | Yellow, `blink` 1.6s, opacity 1→.25 |
| Live waveform | 12 bars, 5px wide, 3px radius. Heights come from an `AnalyserNode` (`fftSize: 64`) each frame via `transform: scaleY()` with a 90ms linear transition. Before the stream is live, `.is-idle` runs the CSS `wv` shimmer instead |
| Review waveform | 24 bars built from the peaks captured while recording; each grows in on a 14ms-per-bar stagger |
| Playback | Played bars turn aqua, the bar at the playhead turns Initio Blue, driven by `timeupdate` |
| Insert | Button shows "Inserting…" and disables; success toast slides down 6px while the tick scales in from 0 with a −25° rotation |
| Reduced motion | `prefers-reduced-motion` collapses every duration to ~0 |

## Tokens

Set in `:root`, use them rather than literals.

```
--ink        #283E49   ink, primary buttons
--ink-hover  #1C2E37
--aqua       #89CCCA   waveform, focus ring
--aqua-deep  #2F8F86   links, success text
--aqua-tint  #E9F4F3   success/neutral fills
--yellow     #FFCE32   record state only
--cream      #F4F3EF
--border     #E6E4DD   --rule #F1F3F4   --muted #8B8A83   --body #5C6A72
--r-btn 8px  --r-card 10px  --pad 16px  --gap 18px
--ease cubic-bezier(.22,.61,.36,1)
```

Type is Manrope: 800/700 headings, 600 controls and labels, 500 body. Sidebar body 13px, uppercase labels 11px at .14em tracking, timer 13px `tabular-nums`. Sidebar width 312px.

**No red anywhere.** Recording is signalled by the yellow dot and pulsing yellow ring; the button stays Initio Blue. The only shadow in the sidebar is on the record button: `0 6px 18px rgba(40,62,73,.28)`.

## Behaviour notes

- Mic permission is the first thing a user hits, so the idle panel explains what happens in one line before the button. Denied permission surfaces in `#err` and stays on `idle`.
- The upload path shares the review panel — a picked file goes straight to `toReview()`, no recording peaks, so the waveform falls back to a generated shape.
- `MediaRecorder` output is `audio/webm` in Chrome; the blob type is passed through to Drive. If you need broad playback, transcode server-side or accept webm (fine for Chrome-only Workspace use).
- `Trim` is present in the UI and not yet wired. Simplest real implementation: two draggable handles over the review waveform, then re-encode client-side with an `OfflineAudioContext` before upload.
- `listClips()` exists server-side but the `done` panel currently builds its list client-side from the session. Wire it to `listClips()` so clips survive a sidebar reload.

## Marketplace listing

Name: Audio Recorder for Slides · Publisher: Initio Learning · Category: Productivity

Short description: Record narration in the sidebar and insert it onto the slide you have open.

Still outstanding: terms of service URL, privacy policy URL, support contact, and 1–5 screenshots at 1280×800.
