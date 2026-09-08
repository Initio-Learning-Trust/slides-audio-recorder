# Roadmap

Ideas in rough priority order. Nothing here is committed.

## Inline playback without leaving the deck

The one thing the add-on cannot do in a single click is play audio *inside* the slide, because the
Slides API has no audio element (see [RESEARCH.md](RESEARCH.md) §2). The available route is to wrap
the audio in a video — record `canvas.captureStream()` alongside the microphone into a single
MediaRecorder, upload the result and insert it with `createVideo` (source `DRIVE`), which supports
`autoPlay`, `mute`, `start` and `end`.

Blockers to solve before shipping it:

- Drive must transcode the upload before Slides will accept it; insertion fails while a video is
  still processing. Needs a readiness poll on `files.get(fields=videoMediaMetadata)` with a
  fallback to the linked control.
- Slides is most reliable with MP4/MOV/AVI; browsers mostly record WebM. Recent Chrome can record
  MP4, but Firefox cannot.
- A static waveform or slide-thumbnail visual needs designing so the video box does not look like a
  mistake on the slide.

Would ship behind a "Inline player (beta)" toggle with automatic fallback.

## MP3 output

Smaller files than WAV and equally acceptable to `Insert ▸ Audio`. Needs a permissively licensed
encoder — `lamejs` is LGPL, which is awkward for a Marketplace app. A WASM encoder under Apache or
MIT would do it.

## Record for every slide in one pass

A guided mode that walks the deck slide by slide, recording narration for each and inserting as it
goes. This is the workflow for building a self-paced listening deck, and today it means clicking
Record once per slide.

## Transcripts and captions

Speech-to-text on the recording to fill in the alt text and speaker notes automatically — useful for
accessibility and for students who need to read along. Would require a new scope or an external
service, so it needs a careful privacy review first.

## Trim and re-take

Top-and-tail silence trimming in the recording window, and a take list so a teacher can compare two
recordings before choosing.

## Bulk sharing repair

A "fix sharing on every recording in this deck" button, for decks shared with a new class.
