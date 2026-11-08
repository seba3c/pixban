<h1 align="center">
  <img src="docs/assets/pixban-logo.svg" width="174" height="51" alt="pixban.">
</h1>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/github/package-json/v/seba3c/pixban/main?label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

<p align="center">A browser-based editor for pixelating image details and adding text</p>

<hr>

## ![](docs/assets/icons/readme/info.svg) Summary

Pixelate faces, license plates, and other details with a rectangle or brush.
Pixban processes images locally in your browser and exports at the original resolution.

- You can use the live app at [**pixban.app**](https://pixban.app).
- For help getting started, see the [**User guide**](docs/README.md).

## ![](docs/assets/icons/layers.svg) Tech stack

![Codex, primary development tool](https://img.shields.io/badge/Primary%20development%20tool-Codex-2563eb)

![React](https://img.shields.io/badge/React-555555)
![JavaScript](https://img.shields.io/badge/JavaScript-555555)
![CSS](https://img.shields.io/badge/CSS-555555)
![Vite](https://img.shields.io/badge/Vite-555555)
![Lucide icons](https://img.shields.io/badge/Lucide%20icons-555555)
![Playwright](https://img.shields.io/badge/Playwright-555555)

## ![](docs/assets/icons/readme/terminal.svg) Commands

To run Pixban locally, use Node.js 22.12+ and npm. Run `npm ci` and `npm run dev`
from the repository root, then open the local URL printed by Vite.

```sh
# Install dependencies
npm ci

# Start the development server
npm run dev

# Run unit tests
npm test

# Install browsers for end-to-end tests
npx playwright install chromium firefox webkit

# Run end-to-end tests
npm run test:e2e

# Build for production
npm run build

# Preview the production build
npm run preview
```

## ![](docs/assets/icons/readme/heart.svg) Support the project

If Pixban is useful to you, you can make a one-time or monthly contribution.
Your support helps cover the cost of the pixban.app domain and gives me time to
build new features, fix bugs, and improve the documentation.

[Support Pixban on GitHub Sponsors](https://github.com/sponsors/seba3c)
