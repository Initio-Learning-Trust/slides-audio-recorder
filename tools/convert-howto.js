#!/usr/bin/env node
/**
 * Compiles the Insert > Audio walkthrough into an Apps Script dialog.
 *
 * The walkthrough is designed in Claude Design and exported as a `.dc.html`
 * artboard, which depends on that runtime: `<x-dc>`, `<sc-if>`, `{{ bindings }}`
 * and a `DCLogic` class. None of that can run inside an add-on dialog, so this
 * rewrites the export into a self-contained page:
 *
 *   <sc-if value="{{ name }}">   ->  <div data-when="name">
 *   {{ caption }}                ->  <span data-text="caption"></span>
 *   onClick="{{ toggle }}"       ->  data-action="toggle"
 *
 * and pairs it with a small runtime that walks the same `steps` array lifted
 * verbatim from the export, so the timings and captions stay the designer's.
 *
 * Re-export from Claude Design over docs/design/how-to-insert.dc.html and run
 * `npm run build`. CI fails if the compiled dialog is out of date.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'docs', 'design', 'how-to-insert.dc.html');
const TARGET = path.join(ROOT, 'apps-script', 'HowTo.html');

/**
 * Pulls a region out of the export.
 * @param {string} text Whole file.
 * @param {string} open Opening tag.
 * @param {string} close Closing tag.
 * @return {string} Inner text, trimmed.
 */
function between(text, open, close) {
  const from = text.indexOf(open);
  // Search forward from the opening delimiter: `];` closes the steps array but
  // also appears later in the export, and lastIndexOf would swallow the rest.
  const to = from < 0 ? -1 : text.indexOf(close, from + open.length);
  if (from < 0 || to < 0) {
    throw new Error('Could not find ' + open + ' ... ' + close + ' in the export');
  }
  return text.slice(from + open.length, to).trim();
}

/**
 * Rewrites the runtime's own syntax into plain HTML hooks.
 * @param {string} markup Artboard markup.
 * @return {string} Plain markup.
 */
function plainify(markup) {
  return markup
      // Conditional regions become elements the runtime shows or hides.
      .replace(/<sc-if\s+value="\{\{\s*(\w+)\s*\}\}"[^>]*>/g, '<div data-when="$1">')
      .replace(/<\/sc-if>/g, '</div>')
      // Click bindings become named actions.
      .replace(/onClick="\{\{\s*(\w+)\s*\}\}"/g, 'data-action="$1"')
      // Hover styling is a design-tool affordance with no runtime meaning.
      .replace(/\s+style-hover="[^"]*"/g, '')
      // Remaining bindings are text the runtime fills in.
      .replace(/\{\{\s*(\w+)\s*\}\}/g, '<span data-text="$1"></span>');
}

/**
 * @param {string} source Contents of the export.
 * @return {string} Contents for HowTo.html.
 */
function render(source) {
  const styles = between(source, '<helmet>', '</helmet>')
      .replace(/<link[^>]*>/g, '')
      .replace(/<\/?style>/g, '')
      .trim();
  const markup = plainify(between(source, '<x-dc>', '</x-dc>'));
  const steps = between(source, 'steps = [', '];');

  return `<!--
  GENERATED FILE - do not edit.
  Source: docs/design/how-to-insert.dc.html
  Regenerate with: npm run build
-->
<!DOCTYPE html>
<html>
<head>
<base target="_top">
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
${styles}
[data-when] { display: contents; }
[data-when][hidden] { display: none !important; }
[data-action] { user-select: none; }
[data-action]:hover { background: #f4faf9 !important; border-color: #89ccca !important; }
@media (prefers-reduced-motion: reduce) {
  #ptr { transition: none !important; }
  [style*="animation"] { animation: none !important; }
}
</style>
</head>
<body>
${markup}
<script>
(function () {
  'use strict';

  var steps = [${steps}];

  var state = { i: 0, playing: true, clicking: false };
  var stepTimer = null;
  var clickTimer = null;

  /**
   * @param {string} name Binding name.
   * @return {!Array<!Element>} Elements bound to it.
   */
  function bound(name) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-when="' + name + '"]'));
  }

  /**
   * @param {string} name Binding name.
   * @param {string} value Text to show.
   */
  function setText(name, value) {
    document.querySelectorAll('[data-text="' + name + '"]').forEach(function (node) {
      node.textContent = value;
    });
  }

  /** Shows the regions this step needs and hides the rest. */
  function render() {
    var s = steps[state.i];
    var flags = {
      showMenu: s.p === 'menu',
      showDialog: s.p === 'dialog',
      showDone: s.p === 'done',
      tabDrive: s.tab === 'drive',
      tabFolder: s.tab === 'folder',
      tabRecent: s.tab === 'recent',
      clicking: state.clicking
    };
    Object.keys(flags).forEach(function (name) {
      bound(name).forEach(function (node) {
        node.hidden = !flags[name];
      });
    });
    setText('caption', s.cap);
    setText('stepNo', String(state.i + 1));
    setText('playLabel', state.playing ? 'Pause' : 'Play');
    paint();
  }

  /** Positions the pointer and highlights, as the artboard did. */
  function paint() {
    var wrap = document.getElementById('stageWrap');
    var inner = document.getElementById('scaleInner');
    if (!wrap || !inner) {
      return;
    }
    var scale = (wrap.clientWidth || 960) / 960;
    inner.style.transform = 'scale(' + scale + ')';

    var s = steps[state.i];
    ['audio', 'folder', 'file', 'recentFile'].forEach(function (key) {
      var node = document.getElementById('hi-' + key);
      if (!node) {
        return;
      }
      var on = s.hi === key;
      node.style.background = on ? '#e8f0fe' : 'transparent';
      node.style.boxShadow = on ? 'inset 0 0 0 2px #ffce32' : 'none';
    });

    var driveTab = document.getElementById('tab-drive');
    var recentTab = document.getElementById('tab-recent');
    var recent = s.tab === 'recent';
    if (driveTab) {
      driveTab.style.color = recent ? '#5f6368' : '#1a73e8';
      driveTab.style.borderBottom = '3px solid ' + (recent ? 'transparent' : '#1a73e8');
    }
    if (recentTab) {
      recentTab.style.color = recent ? '#1a73e8' : '#5f6368';
      recentTab.style.borderBottom = '3px solid ' + (recent ? '#1a73e8' : 'transparent');
    }

    var pointer = document.getElementById('ptr');
    var target = s.t ? document.getElementById(s.t) : null;
    if (pointer && target) {
      var innerRect = inner.getBoundingClientRect();
      var targetRect = target.getBoundingClientRect();
      var x = (targetRect.left - innerRect.left) / scale +
          Math.min(46, (targetRect.width / scale) / 2);
      var y = (targetRect.top - innerRect.top) / scale + (targetRect.height / scale) / 2;
      pointer.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    } else if (pointer && s.p === 'done') {
      pointer.style.transform = 'translate3d(700px,400px,0)';
    }
  }

  /** Schedules the click ripple and the move to the next step. */
  function queue() {
    clearTimeout(stepTimer);
    clearTimeout(clickTimer);
    if (!state.playing) {
      return;
    }
    var s = steps[state.i];
    if (s.click) {
      clickTimer = setTimeout(function () {
        state.clicking = true;
        render();
        setTimeout(function () {
          state.clicking = false;
          render();
        }, 700);
      }, 780);
    }
    stepTimer = setTimeout(function () {
      state.i = (state.i + 1) % steps.length;
      render();
      queue();
    }, s.dur);
  }

  document.addEventListener('click', function (event) {
    var action = event.target.closest('[data-action]');
    if (!action) {
      return;
    }
    if (action.dataset.action === 'toggle') {
      state.playing = !state.playing;
    } else if (action.dataset.action === 'restart') {
      state.i = 0;
      state.playing = true;
    }
    render();
    queue();
  });

  window.addEventListener('resize', paint);
  if (window.ResizeObserver) {
    var wrap = document.getElementById('stageWrap');
    if (wrap) {
      new ResizeObserver(paint).observe(wrap);
    }
  }

  render();
  queue();
}());
</script>
</body>
</html>
`;
}

/**
 * @return {{changed: boolean}} What the run did.
 */
function main() {
  const next = render(fs.readFileSync(SOURCE, 'utf8'));
  const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : null;
  if (current === next) {
    return { changed: false };
  }
  fs.writeFileSync(TARGET, next);
  return { changed: true };
}

if (require.main === module) {
  const result = main();
  console.log(result.changed ?
      'Wrote apps-script/HowTo.html' :
      'apps-script/HowTo.html is already up to date');
}

module.exports = { render, plainify, SOURCE, TARGET };
