'use strict';

/**
 * Exercises the slide insertion code against a mock of SlidesApp.
 *
 * The mock deliberately mirrors the real API's *shape*, not just its method
 * names: TextRange.getRange(start, end) takes two offsets and throws when
 * called with none, exactly as Apps Script does. That arity mistake shipped
 * once -- `Shape.getText()` already returns a TextRange, and calling
 * `.getRange()` on it failed at runtime with "The parameters () don't match
 * the method signature" -- so the mock is written to catch it rather than to
 * make the code pass.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APPS_SCRIPT = path.join(__dirname, '..', 'apps-script');

/** Tracks what the code did to the mock, for assertions. */
function makeRecorder() {
  return { shapes: [], textBoxes: [], notes: [] };
}

/**
 * @param {!Object} log Recorder from makeRecorder.
 * @return {!Object} A mock TextStyle that records chained calls.
 */
function mockTextStyle(log) {
  const style = {};
  ['setForegroundColor', 'setFontSize', 'setBold', 'setLinkUrl'].forEach((name) => {
    style[name] = (value) => {
      log[name] = value;
      return style;
    };
  });
  return style;
}

/**
 * A TextRange whose surface matches Apps Script's.
 * @param {!Object} log Where to record calls.
 * @return {!Object} The mock TextRange.
 */
function mockTextRange(log) {
  log.text = log.text || '';
  return {
    setText(value) {
      log.text = value;
      return this;
    },
    asString() {
      return log.text;
    },
    appendParagraph(value) {
      log.text += '\n' + value;
      return this;
    },
    getTextStyle() {
      return mockTextStyle(log);
    },
    getParagraphStyle() {
      return {
        setParagraphAlignment(value) {
          log.alignment = value;
          return this;
        }
      };
    },
    getRange(start, end) {
      // Mirrors the real signature: two offsets, no no-argument overload.
      if (arguments.length !== 2) {
        throw new Error("The parameters () don't match the method signature for " +
            'SlidesApp.TextRange.getRange.');
      }
      return mockTextRange({ text: log.text.slice(start, end) });
    }
  };
}

/**
 * @param {string} kind 'shape' or 'textBox'.
 * @param {!Object} log Where to record calls.
 * @return {!Object} A mock PageElement.
 */
function mockElement(kind, log) {
  return {
    kind,
    getObjectId: () => log.objectId,
    getText: () => mockTextRange(log),
    getFill: () => ({ setSolidFill: (c) => { log.fill = c; } }),
    getBorder: () => ({ setTransparent: () => { log.border = 'transparent'; } }),
    setContentAlignment: (v) => { log.contentAlignment = v; },
    setLinkUrl: (url) => { log.linkUrl = url; },
    setTitle: (t) => { log.title = t; },
    setDescription: (d) => { log.description = d; },
    getTitle: () => log.title
  };
}

/**
 * Builds the sandbox: the real add-on sources plus a mock Apps Script.
 * @param {{slides: number, existingControls: number}=} options Scenario setup.
 * @return {!Object} The sandbox, with `recorded` holding what happened.
 */
function loadServer(options) {
  const config = Object.assign({ slides: 3, existingControls: 0 }, options || {});
  const recorded = makeRecorder();

  const slides = [];
  for (let i = 0; i < config.slides; i++) {
    const existing = [];
    for (let n = 0; n < config.existingControls; n++) {
      existing.push(mockElement('shape', { title: 'Slides Audio Recorder' }));
    }
    const notesLog = { text: '' };
    slides.push({
      getObjectId: () => 'slide-' + (i + 1),
      getPageElements: () => existing,
      getPageType: () => 'SLIDE',
      insertShape(type, left, top, width, height) {
        const log = { objectId: 'shape-' + (recorded.shapes.length + 1), type, left, top, width, height };
        recorded.shapes.push(log);
        return mockElement('shape', log);
      },
      insertTextBox(text, left, top, width, height) {
        const log = { objectId: 'box-' + (recorded.textBoxes.length + 1), text, left, top, width, height };
        recorded.textBoxes.push(log);
        return mockElement('textBox', log);
      },
      getNotesPage: () => ({
        getSpeakerNotesShape: () => ({ getText: () => mockTextRange(notesLog) })
      }),
      notesLog
    });
  }
  recorded.slides = slides;

  const SlidesApp = {
    ShapeType: { ROUND_RECTANGLE: 'ROUND_RECTANGLE', ELLIPSE: 'ELLIPSE' },
    ContentAlignment: { MIDDLE: 'MIDDLE' },
    ParagraphAlignment: { CENTER: 'CENTER' },
    PageType: { SLIDE: 'SLIDE' },
    getActivePresentation: () => ({
      getId: () => 'presentation-1',
      getName: () => 'French Year 8',
      getSlides: () => slides,
      getPageWidth: () => 720,
      getPageHeight: () => 405,
      getSelection: () => ({ getCurrentPage: () => slides[1] })
    })
  };

  const sandbox = { SlidesApp, console, recorded };
  vm.createContext(sandbox);
  ['Config.js', 'Naming.js', 'Layout.js', 'SlidesService.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(APPS_SCRIPT, file), 'utf8'), sandbox, { filename: file });
  });

  // Stub the two collaborators that would otherwise reach Drive and Properties.
  sandbox.getSettings = () => ({
    sampleRate: 22050, sharing: 'domain', chipStyle: 'chip', chipLabel: 'Listen',
    chipPosition: 'bottom-left', addToSpeakerNotes: false, autoInsert: true
  });
  sandbox.getFileMeta_ = (fileId) => ({
    id: fileId, name: 'Slide 2 - Bonjour - 2026-09-08 14.32.05.wav',
    webViewLink: 'https://drive.google.com/file/d/' + fileId + '/view'
  });

  return sandbox;
}

test('inserting a play chip does not misuse the TextRange API', () => {
  const server = loadServer();
  const result = server.insertRecording('file-1', {});
  assert.equal(result.slideNumber, 2, 'should target the selected slide');
  assert.equal(result.url, 'https://drive.google.com/file/d/file-1/view');
  assert.equal(server.recorded.shapes.length, 1);
});

test('the chip is styled, labelled and linked', () => {
  const server = loadServer();
  server.insertRecording('file-1', { label: 'Bonjour' });
  const shape = server.recorded.shapes[0];
  assert.equal(shape.type, 'ROUND_RECTANGLE');
  assert.match(shape.text, /Bonjour$/);
  assert.equal(shape.fill, '#1A73E8');
  assert.equal(shape.border, 'transparent');
  assert.equal(shape.setForegroundColor, '#FFFFFF');
  assert.equal(shape.setFontSize, 11);
  assert.equal(shape.setBold, true);
  assert.equal(shape.alignment, 'CENTER');
  assert.equal(shape.contentAlignment, 'MIDDLE');
  assert.equal(shape.linkUrl, 'https://drive.google.com/file/d/file-1/view');
  assert.equal(shape.title, 'Slides Audio Recorder');
  assert.match(shape.description, /^Audio recording: /);
});

test('the dot style inserts a circle with just the glyph', () => {
  const server = loadServer();
  server.insertRecording('file-1', { style: 'dot', label: 'ignored' });
  const shape = server.recorded.shapes[0];
  assert.equal(shape.type, 'ELLIPSE');
  assert.equal(shape.width, shape.height);
  assert.equal(shape.text, '▶');
  assert.equal(shape.setFontSize, 12);
});

test('the text style inserts a hyperlinked text box, not a shape', () => {
  const server = loadServer();
  server.insertRecording('file-1', { style: 'text', label: 'Listen again' });
  assert.equal(server.recorded.shapes.length, 0);
  assert.equal(server.recorded.textBoxes.length, 1);
  const box = server.recorded.textBoxes[0];
  assert.match(box.text, /Listen again$/);
  assert.equal(box.setLinkUrl, 'https://drive.google.com/file/d/file-1/view');
});

test('a control is placed inside the slide, away from the edges', () => {
  const server = loadServer();
  server.insertRecording('file-1', { position: 'bottom-right' });
  const shape = server.recorded.shapes[0];
  assert.ok(shape.left >= 0 && shape.left + shape.width <= 720);
  assert.ok(shape.top >= 0 && shape.top + shape.height <= 405);
});

test('a second control on the same slide is offset from the first', () => {
  const plain = loadServer({ existingControls: 0 });
  plain.insertRecording('file-1', {});
  const crowded = loadServer({ existingControls: 1 });
  crowded.insertRecording('file-1', {});
  assert.notDeepEqual(
      [crowded.recorded.shapes[0].left, crowded.recorded.shapes[0].top],
      [plain.recorded.shapes[0].left, plain.recorded.shapes[0].top]);
});

test('speaker notes are only touched when asked for', () => {
  const off = loadServer();
  off.insertRecording('file-1', { addToSpeakerNotes: false });
  assert.equal(off.recorded.slides[1].notesLog.text, '');

  const on = loadServer();
  on.insertRecording('file-1', { addToSpeakerNotes: true });
  assert.match(on.recorded.slides[1].notesLog.text, /\.wav - https:\/\/drive\.google\.com/);
});

test('an explicit slide id wins over the selection', () => {
  const server = loadServer();
  const result = server.insertRecording('file-1', { slideObjectId: 'slide-3' });
  assert.equal(result.slideNumber, 3);
});

test('an unknown slide id falls back rather than throwing', () => {
  const server = loadServer();
  const result = server.insertRecording('file-1', { slideObjectId: 'no-such-slide' });
  assert.equal(result.slideNumber, 2, 'falls back to the current selection');
});

test('describeCurrentSlide reports the selection and the deck size', () => {
  const server = loadServer({ slides: 5 });
  const slide = server.describeCurrentSlide();
  // Compared field by field: the object is created inside the VM context, so
  // its prototype is not the host realm's and deepEqual would reject it.
  assert.equal(slide.objectId, 'slide-2');
  assert.equal(slide.number, 2);
  assert.equal(slide.total, 5);
  assert.equal(slide.resolved, true);
});
