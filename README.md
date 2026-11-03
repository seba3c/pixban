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

`npm run build` produces `dist/`. Serve it from any static HTTPS host; no application server is required. The project includes a Sites hosting manifest; public access must be enabled in the hosting service for crawlers to reach it. No PWA/offline reload guarantee, batch processing, face detection, or editable project files are included.

## SEO and crawler access

The tracked `.env` sets `SITE_URL=https://pixban.app`, the public production origin. Override it in `.env.local` or the build environment when deploying to a different canonical domain. Use an HTTPS origin without a path. Without `SITE_URL`, builds warn and omit canonical URLs, hreflang and the sitemap rather than publishing an invented domain.

The build emits English (`/`) and Spanish (`/es/`) HTML with readable introductory content, instructions, localized titles/descriptions, Open Graph/Twitter metadata, and WebApplication JSON-LD. The same instructions are available in the editor's expandable guide. Language links support direct navigation and preserve an editing session when switched normally. The URL determines the language, including after reload and browser Back/Forward; existing theme preferences are retained.

`robots.txt` allows all crawlers, including search and AI crawlers. With `SITE_URL` configured, `sitemap.xml` lists both pages with language alternates and is referenced by `robots.txt`. `llms.txt` provides a plain-text product summary and limitations for agents that support it; it is supplementary, not a requirement or guarantee of AI indexing.

After deploying, verify that `/`, `/es/`, `/robots.txt`, `/sitemap.xml` and `/llms.txt` are publicly accessible without authentication. Ensure the CDN, WAF and hosting service do not override these settings with bot challenges, restrictive crawler rules, or `X-Robots-Tag: noindex` headers. Unknown paths should return HTTP 404 rather than duplicate homepage content. Submit the sitemap through Google Search Console and Bing Webmaster Tools. Crawling and indexing remain at each search provider's discretion.
