import { hinglishToDevanagari, hinglishToKrutiDev, unicodeToKrutiDev, transliterateWord, WORD_DICT, ENGLISH_LOANWORDS } from './engine.js';

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const input = document.getElementById('input');
const output = document.getElementById('output');
const hint = document.getElementById('hint');
const btnMangal = document.getElementById('btnMangal');
const btnKD = document.getElementById('btnKD');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const dictForm = document.getElementById('dictForm');
const dictList = document.getElementById('dictList');
const importDictBtn = document.getElementById('importDictBtn');
const exportDictBtn = document.getElementById('exportDictBtn');

const stModeLabel = document.getElementById('stModeLabel');
const stWordCount = document.getElementById('stWordCount');
const stSaved = document.getElementById('stSaved');
const kdDot = document.getElementById('kdDot');
const kdStatusText = document.getElementById('kdStatusText');
const kdInstallBtn = document.getElementById('kdInstallBtn');

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
let mode = 'mangal'; // 'mangal' | 'kd'
let customDict = {};
let currentFilePath = null;
let isDirty = false;

// ---------------------------------------------------------------------------
// conversion (custom dictionary takes precedence over the built-in word list)
// ---------------------------------------------------------------------------
function convertDevanagari(text) {
  // danda / double-danda: separate character-level pass, kept out of the word
  // regex below — see hinglishToDevanagari in engine.js
  text = text.replace(/\/\//g, '॥').replace(/\|\|/g, '॥').replace(/\//g, '।').replace(/\|/g, '।');
  // apostrophe included as a word character so a retroflex marker like "t'"
  // stays attached to its word — see hinglishToDevanagari in engine.js
  return text.replace(/[A-Za-z']+/g, function (word) {
    const lower = word.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(customDict, lower)) return customDict[lower];
    if (Object.prototype.hasOwnProperty.call(ENGLISH_LOANWORDS, lower)) return ENGLISH_LOANWORDS[lower];
    if (Object.prototype.hasOwnProperty.call(WORD_DICT, lower)) return WORD_DICT[lower];
    return transliterateWord(word);
  });
}

function wordCount(text) {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function render() {
  const dev = convertDevanagari(input.value);
  if (mode === 'mangal') {
    output.textContent = dev;
    output.className = 'output-box deva';
    hint.innerHTML = '<strong>Mangal / Unicode:</strong> this is standard Hindi text — it will display correctly in Word, WhatsApp, or anywhere, no special font needed.';
  } else {
    const kd = unicodeToKrutiDev(dev);
    output.textContent = kd;
    output.className = 'output-box kd';
    hint.innerHTML = '<strong>Kruti Dev:</strong> this preview uses the bundled Kruti Dev font, so it should already look right here. Pasting into Word or Notepad will only look correct there too once Kruti Dev is installed system-wide (use the button below to do that).';
  }
  updateStatusBar();
}

function updateStatusBar() {
  stModeLabel.textContent = 'Mode: ' + (mode === 'mangal' ? 'Mangal (Unicode)' : 'Kruti Dev');
  stWordCount.textContent = wordCount(input.value) + ' word' + (wordCount(input.value) === 1 ? '' : 's');
  stSaved.textContent = isDirty ? 'Unsaved changes' : 'Saved';
  stSaved.classList.toggle('unsaved', isDirty);
}

function markDirty(val) {
  isDirty = val;
  updateStatusBar();
  window.api.setDirty(isDirty);
}

// ---------------------------------------------------------------------------
// input / mode / copy / clear
// ---------------------------------------------------------------------------
input.addEventListener('input', function () {
  markDirty(true);
  render();
});

btnMangal.addEventListener('click', function () {
  mode = 'mangal'; btnMangal.classList.add('active'); btnKD.classList.remove('active'); render();
});
btnKD.addEventListener('click', function () {
  mode = 'kd'; btnKD.classList.add('active'); btnMangal.classList.remove('active'); render();
});

async function copyOutputToClipboard() {
  try {
    await window.api.copyText(output.textContent);
    copyBtn.textContent = 'Copied';
    copyBtn.classList.add('copied');
    setTimeout(function () { copyBtn.textContent = 'Copy output'; copyBtn.classList.remove('copied'); }, 1400);
  } catch (e) {
    copyBtn.textContent = 'Copy failed';
    setTimeout(function () { copyBtn.textContent = 'Copy output'; }, 1400);
  }
}
copyBtn.addEventListener('click', copyOutputToClipboard);

clearBtn.addEventListener('click', function () {
  input.value = '';
  markDirty(true);
  render();
  input.focus();
});

// ---------------------------------------------------------------------------
// custom dictionary (persisted via main process, userData/dictionary.json)
// ---------------------------------------------------------------------------
async function persistDict() {
  await window.api.dictSave(customDict);
}

function renderDictList() {
  dictList.innerHTML = '';
  const words = Object.keys(customDict).sort();
  if (words.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No custom words yet.';
    li.style.color = 'var(--ink-soft)';
    dictList.appendChild(li);
    return;
  }
  words.forEach(function (w) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = w + ' → ';
    const dev = document.createElement('span');
    dev.className = 'dev';
    dev.textContent = customDict[w];
    const del = document.createElement('button');
    del.type = 'button';
    del.title = 'Remove';
    del.textContent = '✕';
    del.addEventListener('click', async function () {
      delete customDict[w];
      await persistDict();
      renderDictList();
      render();
    });
    li.appendChild(label);
    li.appendChild(dev);
    li.appendChild(del);
    dictList.appendChild(li);
  });
}

dictForm.addEventListener('submit', async function (e) {
  e.preventDefault();
  const fd = new FormData(dictForm);
  const hinglish = (fd.get('hinglish') || '').toString().trim().toLowerCase();
  const dev = (fd.get('devanagari') || '').toString().trim();
  if (!hinglish || !dev) return;
  customDict[hinglish] = dev;
  await persistDict();
  dictForm.reset();
  renderDictList();
  render();
});

importDictBtn.addEventListener('click', async function () {
  const resp = await window.api.showMessage({
    type: 'question',
    title: 'Import Dictionary',
    message: 'Importing will merge into your current custom dictionary and can overwrite entries with the same Hinglish spelling. Continue?',
    buttons: ['Import', 'Cancel']
  });
  if (resp !== 0) return;
  const imported = await window.api.importDictionary();
  if (!imported) return;
  customDict = Object.assign({}, customDict, imported);
  await persistDict();
  renderDictList();
  render();
});

exportDictBtn.addEventListener('click', async function () {
  await window.api.exportDictionary(customDict, 'hinglish-dictionary.json');
});

// ---------------------------------------------------------------------------
// file: New / Open / Save / Save As / Export / Recent
// ---------------------------------------------------------------------------
async function confirmDiscardIfNeeded(actionLabel) {
  if (!isDirty) return true;
  const resp = await window.api.confirmUnsaved(actionLabel); // 0 Save, 1 Don't Save, 2 Cancel
  if (resp === 2) return false;
  if (resp === 0) {
    const ok = await doSave();
    if (!ok) return false;
  }
  return true;
}

async function doSave() {
  const result = await window.api.saveTextFile(currentFilePath, input.value);
  if (!result) return false;
  currentFilePath = result.path;
  markDirty(false);
  return true;
}

async function doSaveAs() {
  const result = await window.api.saveTextFile(null, input.value);
  if (!result) return false;
  currentFilePath = result.path;
  markDirty(false);
  return true;
}

async function loadFileResult(result) {
  if (!result) return;
  input.value = result.content;
  currentFilePath = result.path;
  markDirty(false);
  render();
}

window.api.onMenu('menu:new', async function () {
  const proceed = await confirmDiscardIfNeeded('starting a new file');
  if (!proceed) return;
  input.value = '';
  currentFilePath = null;
  markDirty(false);
  render();
  input.focus();
});

window.api.onMenu('menu:open', async function () {
  const proceed = await confirmDiscardIfNeeded('opening another file');
  if (!proceed) return;
  const result = await window.api.openTextFile();
  await loadFileResult(result);
});

window.api.onOpenRecentFile(async function (filePath) {
  const proceed = await confirmDiscardIfNeeded('opening another file');
  if (!proceed) return;
  const result = await window.api.readTextFileAtPath(filePath);
  await loadFileResult(result);
});

window.api.onMenu('menu:save', function () { doSave(); });
window.api.onMenu('menu:save-as', function () { doSaveAs(); });

window.api.onMenu('menu:export-output', async function () {
  const defaultName = mode === 'kd' ? 'output-krutidev.txt' : 'output-mangal.txt';
  await window.api.exportOutput(output.textContent, defaultName);
});

window.api.onMenu('menu:export-pdf', async function () {
  await window.api.exportOutputPdf({
    text: output.textContent,
    mode: mode,
    dateStr: new Date().toLocaleDateString(),
    defaultName: 'output.pdf'
  });
});

window.api.onMenu('menu:print', async function () {
  await window.api.printOutput({
    text: output.textContent,
    mode: mode,
    dateStr: new Date().toLocaleDateString()
  });
});

window.api.onMenu('menu:import-dict', function () { importDictBtn.click(); });
window.api.onMenu('menu:export-dict', function () { exportDictBtn.click(); });
window.api.onMenu('menu:copy-output', copyOutputToClipboard);

window.api.onRequestClose(async function () {
  const proceed = await confirmDiscardIfNeeded('closing the app');
  window.api.respondClose(proceed);
});

// ---------------------------------------------------------------------------
// Kruti Dev system-font detection + per-user install flow
// ---------------------------------------------------------------------------
// NOTE: document.fonts.check('16px "Kruti Dev 010"') was tried first, per the
// obvious reading of the CSS Font Loading API, but verified empirically (see
// dev notes) to return `true` in this Electron/Chromium build even for a
// completely made-up font name — i.e. it does not reliably reflect local/system
// font availability here, so it is not used. Detection instead relies on
// comparing rendered glyph metrics against a known generic fallback: if asking
// for "Kruti Dev 010" (with no bundled @font-face of that exact name in this
// document) changes the measured width versus asking for the generic alone,
// a real system font by that name must have been found.
function checkKrutiDevInstalledReal() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const testStr = 'ABCmmmmmmWWWlli09';
    ctx.font = '100px monospace';
    const baseline = ctx.measureText(testStr).width;
    ctx.font = '100px "Kruti Dev 010", monospace';
    const withFont = ctx.measureText(testStr).width;
    return Math.abs(withFont - baseline) > 1;
  } catch (e) {
    return false;
  }
}

function applyFontStatus(installed) {
  kdDot.className = 'dot ' + (installed ? 'ok' : 'warn');
  kdStatusText.textContent = installed ? 'Kruti Dev font: Installed' : 'Kruti Dev font: Not installed on this system';
  kdStatusText.className = installed ? 'ok' : 'warn';
  kdInstallBtn.hidden = installed;
}

async function refreshFontStatus() {
  const installed = checkKrutiDevInstalledReal();
  applyFontStatus(installed);
  return installed;
}

kdInstallBtn.addEventListener('click', async function () {
  kdInstallBtn.disabled = true;
  try {
    const result = await window.api.installKrutiDevFont();
    if (result.success) {
      const nowInstalled = await refreshFontStatus();
      await window.api.showMessage({
        type: 'info',
        title: 'Kruti Dev Font',
        message: nowInstalled ? 'Font installed and detected.' : result.message,
        buttons: ['OK']
      });
    } else {
      await window.api.showMessage({ type: 'warning', title: 'Kruti Dev Font', message: result.message, buttons: ['OK'] });
    }
  } finally {
    kdInstallBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
async function init() {
  customDict = await window.api.dictLoad();
  renderDictList();
  await refreshFontStatus();
  render();
}
window.__initPromise = init();

// ---------------------------------------------------------------------------
// autonomous self-test hook (used only when launched with SELFTEST=write|verify|1)
// ---------------------------------------------------------------------------
window.__selftest = async function (mode_) {
  await window.__initPromise;
  const results = {};
  try {
    const sample = 'namaste, kal appeal ki sunwai hai';
    const sampleDev = hinglishToDevanagari(sample);
    const sampleKD = hinglishToKrutiDev(sample);
    results.engine = {
      devSample: sampleDev,
      kdSample: sampleKD,
      devLooksRight: sampleDev.includes('नमस्ते') && sampleDev.includes('अपील') && sampleDev.includes('सुनवाई'),
      kdNonEmpty: sampleKD.length > 0
    };

    applyFontStatus(false);
    results.fontUiNotInstalled = {
      text: kdStatusText.textContent,
      cls: kdStatusText.className,
      btnHidden: kdInstallBtn.hidden
    };
    applyFontStatus(true);
    results.fontUiInstalled = {
      text: kdStatusText.textContent,
      cls: kdStatusText.className,
      btnHidden: kdInstallBtn.hidden
    };

    results.realFontInstalled = checkKrutiDevInstalledReal();
    applyFontStatus(results.realFontInstalled);

    if (mode_ === 'font-install' && window.api.installFontTestNoConfirm) {
      const installRes = await window.api.installFontTestNoConfirm();
      results.installCallSucceeded = !!(installRes && installRes.success);
    }
    if (mode_ === 'font-uninstall' && window.api.uninstallFontTest) {
      const uninstallRes = await window.api.uninstallFontTest();
      results.uninstallCallSucceeded = !!(uninstallRes && uninstallRes.success);
    }
    if (mode_ === 'font-install-live' && window.api.installFontTestNoConfirm) {
      const installRes = await window.api.installFontTestNoConfirm();
      results.installCallSucceeded = !!(installRes && installRes.success);
      results.detectedAfterLiveInstallSameProcess = checkKrutiDevInstalledReal();
      applyFontStatus(results.detectedAfterLiveInstallSameProcess);
    }

    if (mode_ === 'write') {
      customDict['__selftestword__'] = 'परीक्षण';
      await persistDict();
      results.dictWrite = true;
    } else if (mode_ === 'verify') {
      results.dictVerify = customDict['__selftestword__'] === 'परीक्षण';
    }

    if (mode_ === 'copy-test' || mode_ === 'copy-test-mangal') {
      // exercises the real UI copy path (types text, switches mode, clicks the
      // actual Copy output button) so the packaged build's clipboard IPC fix
      // can be verified against the real OS clipboard from outside the app.
      input.value = 'namaste vakil sahab, kal appeal ki sunwai hai';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      (mode_ === 'copy-test-mangal' ? btnMangal : btnKD).click();
      await new Promise((r) => setTimeout(r, 200));
      results.kdOnScreenBeforeCopy = output.textContent;
      copyBtn.click();
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    results.error = String((e && e.stack) || e);
  }
  return JSON.stringify(results);
};
