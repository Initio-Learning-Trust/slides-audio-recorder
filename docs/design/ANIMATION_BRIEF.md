# Brief: "Insert ▸ Audio" animation

What to make, and how to drop it in. The sidebar already ships a placeholder
drawn in CSS; this replaces it with no code change.

## Why it exists

Google's Slides API has no audio page element, so an add-on cannot place the
native speaker icon — only the user can, through `Insert ▸ Audio`. After a
teacher inserts a recording, the sidebar's **done** panel therefore has to teach
that three-click detour. Written steps sit next to the animation; the animation
carries the shape of the journey so nobody has to parse the words.

Assume the viewer is a teacher between lessons, glancing at a narrow panel. It
has to be readable in one pass with no sound.

## Where it appears

The **done** panel of the sidebar, inside a bordered card, above the numbered
steps. The sidebar is roughly 300 px wide, so the artwork renders at about
**255 × 128 CSS pixels**. That is small — smaller than it looks in a design
tool. Everything below follows from it.

## Deliverables

| # | File | Format | Purpose |
| --- | --- | --- | --- |
| 1 | `how-to-insert.mp4` *or* `.gif` | 2:1, ≥ 720 × 360 | The animation |
| 2 | `how-to-insert-still.png` | 2:1, same pixel size | Reduced-motion and video poster |

The still is not optional garnish. A looping GIF cannot be paused, so a viewer
who has asked their operating system for reduced motion gets the still instead.
Without one, they keep the built-in CSS diagram and never see your work.

**Aspect ratio must be 2:1.** The box uses `aspect-ratio: 2 / 1`, so a 2:1 asset
fills it exactly and anything else is cropped or letterboxed.

**Size budget**, because this loads inside an add-on panel a teacher opens many
times a day: MP4 ≤ 400 KB, GIF ≤ 600 KB, PNG ≤ 120 KB. MP4 with H.264 and
`-movflags +faststart` is preferred; it is smaller and sharper than a GIF at
this length. WebM is fine too.

Silent. No audio track is needed and none will be played.

## The storyboard

Five beats, about 10 seconds, looping with a short hold before it restarts.

| Beat | Seconds | What happens |
| --- | --- | --- |
| 1 | 0.0–1.5 | A slide editor. Cursor moves up to the menu bar and **Insert** highlights. |
| 2 | 1.5–3.5 | The menu drops open. Cursor travels down; **Audio** highlights. |
| 3 | 3.5–6.0 | A file picker appears. A file name is typed or pasted into the search box and one row matches. |
| 4 | 6.0–7.5 | The row is selected; the **Insert** button is pressed. |
| 5 | 7.5–10.0 | The picker closes and **a speaker icon appears on the slide**. Hold, then loop. |

Beat 5 is the one that earns the animation. The steps beside it already say what
to click; what a teacher cannot picture is the result. Show the speaker icon
landing on the slide, ideally with a small ripple or scale-in so the eye goes
there.

Use a generic file name — `Slide 3 - Bonjour.wav` reads well and matches what
the add-on actually produces. Do not use a real person's name.

## Drawing it

**Do not screen-record Google Slides.** At 255 px wide, real UI is illegible
mush, and reproducing Google's chrome and marks in a Marketplace listing asset
invites trouble. Draw a simplified, enlarged representation instead: fewer menu
items, larger type, generous spacing. Roughly 1.6× the real proportions.

Nothing may render below **11 CSS pixels** at final size — that is 33 px in a 3×
asset. If a label cannot be read at 255 px wide, cut it rather than shrink it.

## Brand

From `docs/design/HANDOFF.md`. Use the tokens, not approximations.

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#283E49` | Chrome, primary buttons, cursor |
| `--aqua` | `#89CCCA` | Highlights, the selected row |
| `--aqua-deep` | `#2F8F86` | Links, success |
| `--aqua-tint` | `#E9F4F3` | Hover and selection fills |
| `--yellow` | `#FFCE32` | Sparingly; the speaker icon landing is a good use |
| `--rule` | `#F1F3F4` | Hairlines |
| `--muted` | `#8B8A83` | Secondary text |

Type is **Manrope** — 600 for labels, 700 for anything emphasised.

Easing is `cubic-bezier(.22, .61, .36, 1)` throughout, matching the sidebar's
panel transitions. Movement should settle rather than bounce.

**No red anywhere.** House rule, and it holds here too.

## Delivery

1. Put both files in `site/` in this repository. The Pages workflow publishes
   that folder, so they land at:
   - `https://initio-learning-trust.github.io/slides-audio-recorder/how-to-insert.mp4`
   - `https://initio-learning-trust.github.io/slides-audio-recorder/how-to-insert-still.png`
2. In the Apps Script editor: **Project Settings ▸ Script Properties**, add
   `HOWTO_ANIMATION_URL` and `HOWTO_ANIMATION_POSTER` with those URLs.
3. Reload the sidebar. No deployment, no code change.

Both URLs must be **https**; anything else is ignored, deliberately, so a
misconfigured property cannot pull content over an insecure connection into the
panel. Hosting them elsewhere is fine as long as that holds.

## Acceptance checklist

- [ ] 2:1, at least 720 × 360, plus a still frame at the same size
- [ ] Legible at 255 × 128 — check it at that size, not zoomed in
- [ ] Loops without a visible seam, with a hold before restarting
- [ ] Ends by showing the speaker icon on the slide
- [ ] Within the size budget
- [ ] Brand tokens and Manrope; no red; no Google marks or screen capture
- [ ] Silent
