# PyLearn

A mobile-first Progressive Web App for learning Python from scratch, in short steps.
It is a static site (HTML, CSS and JavaScript only). There is no backend and no build step.
Real Python 3 runs in the browser through Pyodide, which is downloaded the first time code is run
and cached for offline use after that.

## Folder structure

```
index.html            app shell (iOS meta tags, manifest link, apple-touch-icon)
manifest.json         PWA manifest (name PyLearn, standalone, #0a0a12 colours, icons)
sw.js                 service worker: caches the app and lessons, plus Pyodide after its first download
css/app.css           cyberpunk theme, safe-area insets, 44px+ tap targets
js/app.js             routing, course map, lesson player, exercises, playground, progress, settings
js/editor.js          code editor (line numbers, Tab = 4 spaces, auto-indent, phone key row)
js/highlight.js       small Python syntax highlighter
js/py.js              loads Python lazily in a Web Worker, 8-second timeout for endless loops
js/py-worker.js       module worker that runs Pyodide 314.0.7 (Python 3.14) from cdn.jsdelivr.net
py/harness.py         runs a program with captured output and input(); shared by the browser and the verifier
content/course.json   all lessons (generated from tools/build_content.py, committed)
fonts/                Inter, JetBrains Mono and Orbitron (OFL), Latin subsets in WOFF2
icons/                180, 192, 512 and maskable 512 PNG icons, favicon
tools/                build_content.py, verify_content.py, make_icons.py (authoring only, not needed to host)
tests/                Playwright tests (iPhone 13 profile) and the highlighter test
screens/              screenshots from the test run, plus test-results.json
```

## Editing lessons

1. Edit `tools/build_content.py`.
2. `python3 tools/build_content.py` to write `content/course.json`.
3. `python3 tools/verify_content.py` to run every example and answer with python3.
4. Bump `VERSION` in `sw.js` so installed copies pick up the change.

## Running locally

```
cd pylearn
python3 -m http.server 8811
# open http://localhost:8811
```

## Hosting free on GitHub Pages

Push the whole folder as the root of a repository (or at least everything except `tools/`, `tests/` and `screens/`).

```
git remote add origin https://github.com/<user>/pylearn.git
git push -u origin main
```

Then on GitHub: Settings > Pages > Source: Deploy from a branch > Branch: main, folder / (root) > Save.
The site appears at `https://<user>.github.io/pylearn/`. All paths are relative, so the sub-folder works.

On the iPhone: open that address in Safari, tap Share, then Add to Home Screen.

Netlify works the same way: drag the folder onto app.netlify.com/drop, or connect the repository with
no build command and publish directory `.`.
