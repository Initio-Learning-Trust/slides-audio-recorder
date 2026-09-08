'use strict';

/**
 * Exercises the presentation-facing code against a mock of SlidesApp.
 *
 * The add-on deliberately puts nothing on the slide, so what is left to test is
 * that it reads the right slide and that the optional speaker note lands
 * without disturbing anything else.
 *
 * The mock mirrors the API's *shape*, not just its method names:
 * TextRange.getRange(start, end) takes two offsets and throws when called with
 * none, exactly as Apps Script does. That arity mistake shipped once, so the
 * mock is written to catch it rather than to make the code pass.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APPS_SCRIPT = path.join(__dirname, '..', 'apps-script');

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
      log.paragraphs = 1;
      return this;
    },
    asString() {
      return log.text;
    },
    appendParagraph(value) {
      log.text += '\n' + value;
      log.paragraphs = (log.paragraphs || 1) + 1;
      return this;
    },
    getTextStyle() {
      return { setFontSize: () => this, setBold: () => this, setLinkUrl: () => this };
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
 * Builds the sandbox: the real add-on sources plus a mock Apps Script.
 * @param {{slides: number, notes: string}=} options Scenario setup.
 * @return {!Object} The sandbox, with `recorded` holding what happened.
 */
function loadServer(options) {
  const config = Object.assign({ slides: 3, notes: '' }, options || {});
  const recorded = { shapes: [], textBoxes: [] };

  const slides = [];
  for (let i = 0; i < config.slides; i++) {
    const notesLog = { text: config.notes };
    slides.push({
      getObjectId: () => 'slide-' + (i + 1),
      getPageType: () => 'SLIDE',
      getPageElements: () => [],
      insertShape() {
        recorded.shapes.push({});
        throw new Error('the add-on should not put shapes on the slide');
      },
      insertTextBox() {
        recorded.textBoxes.push({});
        throw new Error('the add-on should not put text boxes on the slide');
      },
      getNotesPage: () => ({
        getSpeakerNotesShape: () => ({ getText: () => mockTextRange(notesLog) })
      }),
      notesLog
    });
  }
  recorded.slides = slides;

  const SlidesApp = {
    PageType: { SLIDE: 'SLIDE' },
    getActivePresentation: () => ({
      getId: () => 'presentation-1',
      getName: () => 'French Year 8',
      getSlides: () => slides,
      getSelection: () => ({ getCurrentPage: () => slides[1] })
    })
  };

  const sandbox = { SlidesApp, console, recorded };
  vm.createContext(sandbox);
  ['Config.js', 'Naming.js', 'SlidesService.js'].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(APPS_SCRIPT, file), 'utf8'), sandbox, { filename: file });
  });

  // Stub the collaborator that would otherwise reach Drive.
  sandbox.getFileMeta_ = (fileId) => ({
    id: fileId,
    name: 'Slide 2 - Bonjour - 2026-09-08 14.32.05.wav',
    webViewLink: 'https://drive.google.com/file/d/' + fileId + '/view'
  });

  return sandbox;
}

test('the speaker note lands on the selected slide', () => {
  const server = loadServer();
  const result = server.noteRecordingInSpeakerNotes('file-1', null);
  assert.equal(result.slideNumber, 2, 'should target the selected slide');
  assert.match(server.recorded.slides[1].notesLog.text,
      /Slide 2 - Bonjour - .*\.wav - https:\/\/drive\.google\.com/);
  assert.equal(server.recorded.slides[0].notesLog.text, '', 'other slides untouched');
});

test('an existing note is appended to, not overwritten', () => {
  const server = loadServer({ notes: 'Remember to pause here.' });
  server.noteRecordingInSpeakerNotes('file-1', null);
  const notes = server.recorded.slides[1].notesLog;
  assert.match(notes.text, /^Remember to pause here\./);
  assert.equal(notes.paragraphs, 2, 'the note should be a new paragraph');
});

test('nothing is ever placed on the slide itself', () => {
  const server = loadServer();
  server.noteRecordingInSpeakerNotes('file-1', null);
  assert.deepEqual(server.recorded.shapes, [], 'no shapes');
  assert.deepEqual(server.recorded.textBoxes, [], 'no text boxes');
  assert.equal(typeof server.insertRecording, 'undefined',
      'the chip-insertion entry point should be gone');
});

test('an explicit slide id wins over the selection', () => {
  const server = loadServer();
  assert.equal(server.noteRecordingInSpeakerNotes('file-1', 'slide-3').slideNumber, 3);
});

test('an unknown slide id falls back rather than throwing', () => {
  const server = loadServer();
  assert.equal(server.noteRecordingInSpeakerNotes('file-1', 'no-such-slide').slideNumber, 2,
      'falls back to the current selection');
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
