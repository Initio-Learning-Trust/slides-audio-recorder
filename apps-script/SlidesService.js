/**
 * Everything that touches the open presentation.
 *
 * Google's Slides API has no audio page element -- `createAudio` does not
 * exist, and Apps Script's SlidesApp mirrors the same surface -- so an add-on
 * cannot place a native audio icon. What it can place is a linked shape: a
 * "play control" that opens the recording when clicked, in edit view and in
 * present mode alike. Teachers who want the native inline player use the
 * guided Insert > Audio flow the sidebar offers alongside this.
 */

/** Alt-text title stamped on every control we create, so we can find ours. */
var CONTROL_MARKER = 'Slides Audio Recorder';

/** Fill and text colours for the play control. */
var CONTROL_FILL = '#1A73E8';
var CONTROL_TEXT = '#FFFFFF';

/**
 * Describes the slide the user is looking at.
 * @return {{objectId: ?string, number: ?number, total: number, resolved: boolean}}
 */
function describeCurrentSlide() {
  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();
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
  var presentation = SlidesApp.getActivePresentation();
  var slides = presentation.getSlides();
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
 * Places a play control for a recording on a slide.
 * @param {string} fileId Drive file id of the recording.
 * @param {{style: ?string, label: ?string, position: ?string,
 *          addToSpeakerNotes: ?boolean, slideObjectId: ?string}=} options
 * @return {{slideNumber: number, objectId: string, url: string}}
 */
function insertRecording(fileId, options) {
  options = options || {};
  var settings = getSettings();
  var style = options.style || settings.chipStyle;
  var position = options.position || settings.chipPosition;
  var label = options.label != null && String(options.label).trim() ?
      String(options.label).trim() : settings.chipLabel;
  var addNotes = options.addToSpeakerNotes != null ?
      !!options.addToSpeakerNotes : settings.addToSpeakerNotes;

  var meta = getFileMeta_(fileId);
  var url = meta.webViewLink;
  var found = resolveSlide_(options.slideObjectId);
  if (!found) {
    throw new Error('This presentation has no slides to insert into.');
  }

  var presentation = SlidesApp.getActivePresentation();
  var pageWidth = presentation.getPageWidth();
  var pageHeight = presentation.getPageHeight();
  var geometry = offsetForExisting(
      computeChipGeometry(style, label, position, pageWidth, pageHeight),
      countControlsOnSlide_(found.slide), pageWidth, pageHeight);

  var element = style === 'text' ?
      insertTextLink_(found.slide, geometry, label, url) :
      insertChip_(found.slide, geometry, style, label, url);

  element.setTitle(CONTROL_MARKER);
  element.setDescription('Audio recording: ' + meta.name);

  if (addNotes) {
    appendSpeakerNote_(found.slide, meta.name + ' - ' + url);
  }

  return { slideNumber: found.number, objectId: element.getObjectId(), url: url };
}

/**
 * Inserts the rounded play chip (or dot) and links it to the recording.
 * @param {!Slide} slide Target slide.
 * @param {{left: number, top: number, width: number, height: number}} geometry Placement.
 * @param {string} style 'chip' or 'dot'.
 * @param {string} label Label text.
 * @param {string} url Drive link.
 * @return {!Shape} The inserted shape.
 * @private
 */
function insertChip_(slide, geometry, style, label, url) {
  var shapeType = style === 'dot' ? SlidesApp.ShapeType.ELLIPSE : SlidesApp.ShapeType.ROUND_RECTANGLE;
  var shape = slide.insertShape(shapeType, geometry.left, geometry.top, geometry.width, geometry.height);
  shape.getFill().setSolidFill(CONTROL_FILL);
  shape.getBorder().setTransparent();
  shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);

  var text = shape.getText();
  text.setText(chipText(style, label));
  var range = text.getRange();
  range.getTextStyle()
      .setForegroundColor(CONTROL_TEXT)
      .setFontSize(style === 'dot' ? 12 : 11)
      .setBold(true);
  range.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);

  shape.setLinkUrl(url);
  return shape;
}

/**
 * Inserts a plain hyperlinked text label.
 * @param {!Slide} slide Target slide.
 * @param {{left: number, top: number, width: number, height: number}} geometry Placement.
 * @param {string} label Label text.
 * @param {string} url Drive link.
 * @return {!Shape} The inserted text box.
 * @private
 */
function insertTextLink_(slide, geometry, label, url) {
  var box = slide.insertTextBox(chipText('text', label),
      geometry.left, geometry.top, geometry.width, geometry.height);
  var range = box.getText().getRange();
  range.getTextStyle().setFontSize(11).setLinkUrl(url);
  return box;
}

/**
 * Counts the controls this add-on has already placed on a slide.
 * @param {!Slide} slide Target slide.
 * @return {number} Count.
 * @private
 */
function countControlsOnSlide_(slide) {
  var count = 0;
  slide.getPageElements().forEach(function (element) {
    try {
      if (element.getTitle() === CONTROL_MARKER) {
        count++;
      }
    } catch (err) {
      // Some element types do not expose a title; they are not ours.
    }
  });
  return count;
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
