/**
 * Everything that touches the open presentation.
 *
 * The add-on deliberately puts nothing on the slide. Google's Slides API has no
 * audio page element -- `createAudio` does not exist, and Apps Script's
 * SlidesApp mirrors the same surface -- so the only way to get audio onto a
 * slide is Insert > Audio, which the teacher does themselves. An add-on could
 * place a linked shape instead, but that is a second, worse-behaved control
 * sitting next to the real one, so the sidebar teaches the native route rather
 * than competing with it.
 *
 * What is left here is reading where the teacher is, so recordings can be named
 * by slide, and optionally leaving the file's link in the speaker notes.
 */

/**
 * Describes the slide the user is looking at.
 * @return {{objectId: ?string, number: ?number, total: number, resolved: boolean}}
 */
function describeCurrentSlide() {
  var slides = SlidesApp.getActivePresentation().getSlides();
  var found = resolveSlide_(null);
  return {
    objectId: found ? found.objectId : null,
    number: found ? found.number : null,
    total: slides.length,
    resolved: !!found
  };
}

/**
 * Finds the slide to act on.
 * @param {?string} objectId Explicit slide id, or null to use the selection.
 * @return {?{slide: !Slide, objectId: string, number: number}}
 * @private
 */
function resolveSlide_(objectId) {
  var slides = SlidesApp.getActivePresentation().getSlides();
  if (!slides.length) {
    return null;
  }
  if (objectId) {
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === objectId) {
        return { slide: slides[i], objectId: objectId, number: i + 1 };
      }
    }
  }
  var selectedId = null;
  try {
    var page = SlidesApp.getActivePresentation().getSelection().getCurrentPage();
    if (page && page.getPageType() === SlidesApp.PageType.SLIDE) {
      selectedId = page.getObjectId();
    }
  } catch (err) {
    // No selection is available in some contexts; fall back to the first slide.
  }
  if (selectedId) {
    for (var j = 0; j < slides.length; j++) {
      if (slides[j].getObjectId() === selectedId) {
        return { slide: slides[j], objectId: selectedId, number: j + 1 };
      }
    }
  }
  return { slide: slides[0], objectId: slides[0].getObjectId(), number: 1 };
}

/**
 * @param {?string} objectId Slide id.
 * @return {?number} 1-based slide number, or null when not found.
 * @private
 */
function slideNumberFor_(objectId) {
  if (!objectId) {
    return null;
  }
  var slides = SlidesApp.getActivePresentation().getSlides();
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].getObjectId() === objectId) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Notes a recording in a slide's speaker notes.
 *
 * Off by default. Teachers who present from notes asked for somewhere to keep
 * the link, and notes are the one place on a slide that is not also on screen.
 *
 * @param {string} fileId Drive file id of the recording.
 * @param {?string} slideObjectId Slide to note it on, or null for the current one.
 * @return {{slideNumber: number}} Where the note landed.
 */
function noteRecordingInSpeakerNotes(fileId, slideObjectId) {
  var meta = getFileMeta_(fileId);
  var found = resolveSlide_(slideObjectId);
  if (!found) {
    throw new Error('This presentation has no slides.');
  }
  appendSpeakerNote_(found.slide, meta.name + ' - ' + meta.webViewLink);
  return { slideNumber: found.number };
}

/**
 * Appends a line to a slide's speaker notes.
 * @param {!Slide} slide Target slide.
 * @param {string} line Text to append.
 * @private
 */
function appendSpeakerNote_(slide, line) {
  var notes = slide.getNotesPage();
  if (!notes) {
    return;
  }
  var shape = notes.getSpeakerNotesShape();
  if (!shape) {
    return;
  }
  var text = shape.getText();
  if (text.asString().trim()) {
    text.appendParagraph(line);
  } else {
    text.setText(line);
  }
}
