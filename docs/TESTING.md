# Test plan

Two automated layers, then a manual pass for the parts that need Google Slides itself.

## Automated

```bash
npm test           # 54 unit assertions, no browser needed
npm run test:e2e   # 9 assertions in a real Chromium, with a fake microphone
npm run verify     # rebuild the protocol include, fail if stale, then both suites
```

**Unit tests** cover the pure logic: WAV encoding and header framing, the postMessage protocol and
its origin/nonce guards, slide geometry, file naming, and upload chunk validation.

**The end-to-end test** covers the part of the design that cannot be assumed — a page on one origin
opening the recorder on another, capturing a real microphone through a real audio graph, and handing
WAV bytes back over `postMessage`. Chromium runs with `--use-fake-device-for-media-stream`, which
emits a tone, so the test asserts the audio is genuinely audible (peak amplitude above the noise
floor) rather than merely that nothing threw. It also asserts the recorder refuses to run when
opened directly, and refuses a launch URL naming an untrusted origin.

If your machine already has a Chromium that Playwright did not install, point at it:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

CI runs both suites on every push, and additionally syntax-checks every `.js` file in the project.

## Manual: the happy path

1. Open a presentation, go to slide 3, open the sidebar.
2. The header reads **Slide 3 of N**.
3. Tap the record button — the recording window opens.
4. Allow the microphone, then tap record there. Record about five seconds of speech.
5. **Both** windows show the waveform moving, and the sidebar clock counts up.
6. Tap the button again to stop. The window closes itself and the sidebar shows the review panel.
7. Play it back. Duration looks right and the bars colour in as it plays.
8. Name the button, press **Insert into current slide**; progress runs, then *Added to slide 3*.
9. A blue **▶ Listen** button is on slide 3, in the bottom-left corner.
10. Clicking it opens the recording in Drive and it plays.
11. The recording appears in the sidebar list with duration, size and sharing.
12. The file is in `My Drive ▸ Slides Audio Recorder ▸ <deck name>`, named `Slide 3 - ... .wav`.

## Manual: the things that break

| Case | Expected |
| --- | --- |
| Block pop-ups, press Record | Sidebar explains how to allow pop-ups; no silent failure |
| Deny the microphone | Recording window explains how to re-allow it via the address bar |
| Press Stop with no audio (muted mic) | "No audio was captured" rather than a zero-length file |
| Close the recording window mid-recording | Browser warns about leaving; sidebar recovers on next Record |
| Close the sidebar, then stop the recording | Window says the sidebar has closed; it stays open rather than discarding the take |
| Stop from the sidebar's stop button | The recording window stops too, and hands the audio over |
| Reload the sidebar mid-upload | Upload session expires cleanly; no orphan file in Drive |
| Press Cancel during upload | Upload stops, Drive session is abandoned, no file appears |
| Record a 5-minute clip | Multiple chunks, progress advances smoothly, file plays in full |
| Two recordings on one slide | Second control is offset, not stacked exactly on the first |
| Insert on a deck with one slide | Works; no selection still resolves to slide 1 |
| Delete a recording | Confirmation warns about existing buttons; file goes to the bin |
| Rename a recording | Name changes in the sidebar and in Drive |

## Manual: sharing

Run as a teacher account, then check as a student account in another browser profile.

| Setting | Student opening the play button |
| --- | --- |
| Anyone in my organisation | Plays |
| Anyone with the link | Plays |
| Only me | Access request page — and the sidebar warned this would happen |

If the organisation blocks link sharing entirely, check that the add-on falls back and says so
rather than reporting success.

## Manual: the native insert path

1. Record something.
2. Open **Play inside the slide instead** — the newest file name is shown, and **Copy name** works
   (or, if the sandbox blocks the copy command, the name is selected ready for Ctrl+C).
3. **Insert ▸ Audio**, paste the name into the search box — the file is found.
4. Check the **Recent** tab as well, and note whether the recording appears near the top. This is
   Drive's own recency heuristic rather than a guarantee, so search is the documented route.
5. Insert it; the speaker icon plays inline.
6. Follow **Open the folder in Drive** — it lands in the presentation's recordings folder.

## Browsers

The recording window is the part that varies. Check at least Chrome and one of Firefox or Safari.

| Browser | Notes |
| --- | --- |
| Chrome / Edge | Primary target; AudioWorklet path |
| Firefox | AudioWorklet path; check the pop-up is not blocked by default |
| Safari | Check `AudioContext` accepts the requested sample rate, and the ScriptProcessor fallback |

## Accessibility

- Tab through the sidebar and the recording window: every control is reachable and has a visible
  focus ring.
- The status line and error box are announced (they are `role="status"` and `role="alert"`).
- Inserted controls carry alt text (`Audio recording: <file name>`), visible in Slides under
  *Format options ▸ Alt text*.
