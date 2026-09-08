#!/usr/bin/env node
/**
 * Renders the sidebar outside Apps Script, for looking at it.
 *
 * The sidebar is assembled by HtmlService from several files and talks to the
 * server through `google.script.run`, so the only way to see a change used to be
 * to push and reload a presentation. This resolves the includes and stubs the
 * server, so the panels can be opened in a browser at the real 300px width.
 *
 *   node tools/preview-sidebar.js            # serve it
 *   node tools/preview-sidebar.js --out x.html
 *
 * Add ?panel=done to jump straight to a panel, and ?delay=2000 to hold the
 * loading state long enough to look at it. This is a development aid: it fakes
 * the server, so it proves layout and states, never behaviour.
 */
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APPS_SCRIPT = path.join(ROOT, 'apps-script');

/** Stand-in data, shaped like the real getBootstrap payload. */
const FIXTURE = {
  addonName: 'Audio Recorder',
  version: '1.0',
  recorderUrl: 'https://example.invalid/recorder/',
  recorderOrigin: 'https://example.invalid',
  supportUrl: 'https://example.invalid/help',
  chunkBytes: 524288,
  maxBytes: 104857600,
  settings: { sampleRate: 22050, sharing: 'domain', addToSpeakerNotes: false },
  recordings: [
    {
      fileId: 'file-1',
      name: 'Slide 1 - Bonjour - 2026-09-08 12.05.20.wav',
      label: 'Bonjour',
      url: 'https://example.invalid/file',
      sizeBytes: 109000,
      durationMs: 3400,
      sharing: 'domain',
      sharingNote: 'Anyone at initiolearning.org with the link can listen.',
      folderId: 'folder-1'
    }
  ],
  presentation: { id: 'p1', name: 'French Year 8' },
  slide: { objectId: 'slide-1', number: 1, total: 8, resolved: true },
  folderUrl: 'https://drive.google.com/drive/folders/folder-1'
};

/**
 * Resolves the `<?!= include('X') ?>` scriptlets HtmlService would.
 * @param {string} html Template source.
 * @return {string} Flat HTML.
 */
function resolveIncludes(html) {
  return html.replace(/<\?!=\s*include\('([^']+)'\);?\s*\?>/g, (match, name) =>
      resolveIncludes(fs.readFileSync(path.join(APPS_SCRIPT, name + '.html'), 'utf8')));
}

/**
 * Builds the standalone page.
 * @return {string} HTML with the server stubbed.
 */
function build() {
  const template = fs.readFileSync(path.join(APPS_SCRIPT, 'Sidebar.html'), 'utf8');
  const stub = `
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var delay = parseInt(params.get('delay'), 10) || 400;
  var data = ${JSON.stringify(FIXTURE)};

  // Enough of google.script.run for the controller to boot and be clicked
  // through. Nothing here reaches Drive or Slides.
  var handlers = {
    getBootstrap: function () { return data; },
    describeCurrentSlide: function () { return data.slide; },
    saveSettings: function (next) { return Object.assign({}, data.settings, next); },
    deleteRecording: function () { return []; },
    showHowTo: function () { window.alert('The walkthrough opens as a dialog in Slides.'); },
    noteRecordingInSpeakerNotes: function () { return { slideNumber: 1 }; }
  };
  function runner() {
    var ok = function () {};
    var api = {
      withSuccessHandler: function (fn) { ok = fn; return api; },
      withFailureHandler: function () { return api; }
    };
    Object.keys(handlers).forEach(function (name) {
      api[name] = function () {
        var args = arguments;
        setTimeout(function () { ok(handlers[name].apply(null, args)); }, delay);
      };
    });
    return api;
  }
  window.google = { script: { run: runner() } };

  // Jump to a panel once the controller has finished booting.
  var wanted = params.get('panel');
  if (wanted) {
    setTimeout(function () {
      document.querySelectorAll('.panel').forEach(function (panel) {
        panel.toggleAttribute('data-active', panel.dataset.panel === wanted);
      });
    }, delay + 250);
  }
}());
</script>`;
  // Injected before the controller's include and resolved afterwards, so the
  // stub is defined by the time the controller runs.
  const marker = "<?!= include('SidebarJs'); ?>";
  if (!template.includes(marker)) {
    throw new Error('Sidebar.html no longer includes SidebarJs where the preview expects it');
  }
  return resolveIncludes(template.replace(marker, stub + '\n' + marker));
}

if (require.main === module) {
  const outIndex = process.argv.indexOf('--out');
  if (outIndex > -1 && process.argv[outIndex + 1]) {
    fs.writeFileSync(process.argv[outIndex + 1], build());
    console.log('Wrote ' + process.argv[outIndex + 1]);
  } else {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(build());
    });
    server.listen(0, '127.0.0.1', () => {
      console.log('Sidebar preview: http://127.0.0.1:' + server.address().port +
          '  (?panel=done, ?delay=2000)');
    });
  }
}

module.exports = { build, resolveIncludes, FIXTURE };
