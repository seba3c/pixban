# pixban

A browser-only image pixelation editor. Images stay on your device: no API, uploads, accounts, telemetry, external fonts, or runtime CDN dependencies.

## Development

Node.js 22.12+ and npm are required.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. English is the default language. Choose Spanish from the language selector. Light/dark appearance initially follows the system; preferences are saved locally. Images and edit history are not persisted.

## Editing

Open or drop a PNG, JPEG or WebP (up to 32 megapixels). Draw rectangles or continuous brush strokes. Select a rectangle to move it or drag its corner handles to resize it. Select any operation from the Regions panel to adjust its block size or delete it. Later operations win overlaps and always sample the unmodified original. The brush diameter affects new strokes.

Shortcuts: V select, R rectangle, B brush, H pan; hold Space or use the middle button to pan. Scroll pans; Ctrl/Command + scroll zooms. Ctrl/Command+Z undo, Shift+Ctrl/Command+Z redo. Delete removes the selected operation. Zoom and color theme do not affect exported pixels.

Download flattened PNG (with transparency) or JPEG (white background, quality 92%). Output retains the decoded original dimensions and does not copy original EXIF/location metadata. The browser controls where downloads are saved; starting a download cannot confirm successful storage. Reloading loses the editing session. Pixelation is a visual obscuration tool, not a guarantee of irreversible anonymization.

## Verification

```sh
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
npm run build
npm run preview
```

The test suite covers masks, continuous strokes, overlap precedence, alpha weighting, history, dictionaries, preferences, PNG/JPEG downloads, and exported pixels across theme changes. Playwright exercises Chromium, Firefox and WebKit; native Safari/Windows/Linux device checks remain useful before a broader release.

## Static hosting

`npm run build` produces `dist/`. Serve it from any static HTTPS host; no application server is required. The project includes a private Sites hosting manifest. No PWA/offline reload guarantee, batch processing, face detection, or editable project files are included.
