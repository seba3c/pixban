<h1 align="center">
  <img src="docs/assets/pixban-logo.svg" width="174" height="51" alt="pixban.">
</h1>

<p align="center">
  <a href="package.json"><img src="https://img.shields.io/github/package-json/v/seba3c/pixban/main?label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT"></a>
</p>

<p align="center">A browser-based editor for pixelating image details and adding text</p>

<hr>

## Summary

Pixelate faces, license plates, and other details with a rectangle or brush.
Pixban processes images locally in your browser and exports at the original resolution.

- You can use the live app at [**pixban.app**](https://pixban.app).
- For help getting started, see the [**User guide**](docs/README.md).

## Tech stack

React, JavaScript, CSS, Vite, Lucide icons, and Playwright.

## Commands

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
