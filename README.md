# Hinglish Notepad — Legal

A Windows desktop Notepad-style app for typing Hindi legal documents using an
English keyboard. Type Hinglish (Hindi written with Latin letters) on the
left; see it live, side by side, as either standard Unicode Devanagari
(Mangal) or legacy Kruti Dev–encoded text on the right — ready to paste into
Word or a Kruti Dev–based printing workflow.

**Nothing you type is ever auto-replaced.** The point of the side-by-side
layout is that you can compare what you typed against the converted output
and catch mistakes before filing.

## Accuracy caveat

This is a **best-effort transliteration tool**, not a proofreading tool.
Always read the output before using it in a real document. Hinglish spelling
is ambiguous by nature (e.g. is "kal" yesterday or tomorrow-ish "कल"? is a
word-final "i" long or short?) and the built-in word list and phonetic rules
make reasonable guesses, but they will occasionally be wrong — especially for
proper nouns, uncommon legal terms, or unusual spellings. Typing a short vowel
where a word needs a long one is the single most common source of these
misses (e.g. "nishan" → निशन instead of निशान, "mamla" → ममल instead of
मामला) — **type the vowel twice for a long sound** (`aa`, `ee`, `oo`) to fix
that case by case as you notice it, e.g. "nishaan"/"mamlaa".

Typing is also **not case-sensitive**: capital letters from proper nouns or
the start of a sentence never change how a word is read. A trailing
**apostrophe** is the explicit way to reach a retroflex consonant that plain
typing can't otherwise produce — `t'` ट, `d'` ड, `n'` ण, `th'` ठ, `dh'` ढ,
`sh'` ष (e.g. "t'op" → टोप) — common retroflex words (beta, ladka, bada,
gaadi, and the like) are already pre-seeded in the built-in word list so the
marker is rarely needed day to day; use "Fix a word" for anything else that
still comes out wrong.

Type **`/`** or **`|`** for a danda (।) — the Hindi full stop — and doubled,
**`//`** or **`||`**, for a double danda (॥). A plain period (`.`) is always
left alone as a literal ASCII period; use the danda when the sentence should
end the way Hindi text conventionally does.

**"ki"** always defaults to की (possessive, "of") since that's overwhelmingly
the more common reading. When a specific sentence means it as "that" (कि)
instead, either override that occurrence with "Fix a word" for the document
at hand, or type "keh" as a variant if that reads more naturally — the app
does not attempt to guess this from grammar.

A short list of common English words used verbatim in legal Hinglish (court,
case, order, affidavit, judge, and others — see `ENGLISH_LOANWORDS` in
`renderer/engine.js` for the full list) are recognized and kept as readable
Devanagari transliterations of the English word itself, rather than being
run through the phonetic engine, which would otherwise mangle them (e.g.
"court" letter-by-letter is not phonetic). Any English word **not** on that
list is still transliterated phonetically as if it were Hinglish, which will
usually look wrong for real English spellings — "Fix a word" handles those
as they come up.

Use **"Fix a word"** to teach the app a correction the moment you spot one.
Once saved, that correction is used every time you type that word again, in
both Mangal and Kruti Dev output. It is stored on this computer only (not in
the cloud) and can be backed up or moved to another computer with
**File → Export Dictionary...** / **File → Import Dictionary...**.

## Kruti Dev font — why install is per-user and doesn't need admin rights

Kruti Dev output only *looks* like Hindi once a real Kruti Dev 010 font is
applied to it — otherwise it looks like scrambled English, which is expected
and not a bug. This app bundles the font file so it can always render an
accurate on-screen preview, even on a machine where Kruti Dev isn't
installed at all.

But an on-screen preview isn't the same as the font being available
system-wide: other programs (Microsoft Word, a physical printer driver) only
render Kruti Dev correctly if the font is actually **installed on Windows**,
not just bundled inside this app. The status bar shows the real,
system-level state, and offers a one-click **"Install Kruti Dev font"**
button when it isn't installed.

That button copies `KrutiDev010.ttf` into your personal font folder
(`%LOCALAPPDATA%\Microsoft\Windows\Fonts`) and registers it under
`HKEY_CURRENT_USER\...\Fonts`. This is the standard **per-user** font install
method on Windows — it affects only your own Windows user account, and
critically, it **never requires administrator rights**, unlike installing a
font system-wide into `C:\Windows\Fonts`. You'll see a confirmation dialog
explaining exactly this before anything is copied.

Occasionally Windows doesn't pick up a newly-registered font until the app
(or, rarely, Windows itself) is restarted — if the status doesn't flip to
"Installed" right away after clicking Install, that's why; just restart the
app and check again.

## Development

```
npm install
npm start
```

## Building the Windows installer (.exe)

```
npm run build
```

This runs as three steps (see `package.json`'s `build` script and
`scripts/apply-exe-resources.js`): package the app, stamp the icon and
version info onto the exe, then wrap it in the NSIS installer. The icon step
is done with the small standalone `rcedit` package instead of
electron-builder's built-in resource-editing step, because that built-in step
downloads a helper archive containing some unrelated macOS files stored as
symlinks — extracting those needs a Windows privilege that a plain,
non-admin, non-Developer-Mode account doesn't have, which makes a default
`electron-builder` build fail on a machine set up like this one. Nothing here
needs admin rights or Developer Mode.

This produces an NSIS installer under `dist\` (e.g.
`dist\HinglishNotepad Setup 1.0.0.exe`), plus an unpacked
`dist\win-unpacked\HinglishNotepad.exe` you can run directly without
installing anything, for a quick sanity check.

`package.json`'s `author`/`version`/`build.appId` fields are placeholders —
edit them before a real release.

## Project structure

- `main.js` — Electron main process: window creation & persisted
  size/position, native menus, file/dialog/print IPC handlers, per-user
  Kruti Dev font install.
- `preload.js` — the only bridge between the renderer and Node/Electron
  (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`);
  exposes a small, explicit `window.api` surface.
- `renderer/engine.js` — the Hinglish→Devanagari transliteration engine and
  Unicode→Kruti Dev encoder, unchanged from the original prototype
  (`hindi-tool.html`). Treat this file as reviewed and correct; changes to
  the conversion logic itself should be a deliberate, separate decision.
- `renderer/renderer.js` — UI wiring: live conversion, file menu actions,
  custom dictionary, Kruti Dev status indicator/install flow, status bar.
- `renderer/index.html` / `renderer/style.css` — the UI, reusing the
  original prototype's markup and look.
- `renderer/print.html` / `renderer/print.js` / `renderer/print-preload.js`
  — a minimal, isolated print layout used for both File → Print and
  File → Export Output as PDF, so only the output panel is ever printed.
- `assets/fonts/` — bundled Noto Sans Devanagari (Mangal/Unicode rendering)
  and Kruti Dev 010 (bundled rendering fallback + the source file copied
  during per-user install). No fonts are ever loaded from the internet.
