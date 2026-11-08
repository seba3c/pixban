# pixban

## Summary

A browser-based image pixelation editor that processes images locally on your device.

Use **Text (T)** to click an image and add multiline text. Enter inserts a line;
Ctrl/⌘+Enter or clicking away saves, and Escape cancels the current edit.
Click existing text with Select or Text to edit it. With Select, drag text to move it.
You can also press Enter on a focused text row in Edits. Settings include a font size
slider (8–256 px) and a color picker. Text stays above pixelation and is included in
downloads and clipboard copies at the original image resolution.

## Tech stack

React, JavaScript, CSS, Vite, Lucide icons, and Playwright.

## App metadata

`package.json` is the source of the app version and repository URL. Vite injects
them as `APP_VERSION` and `REPOSITORY_URL`, exported by `src/app-info.js`.
The footer displays this build's version and repository icon in the center on
desktop, and beneath the copyright on mobile.

`npm run build` also generates `dist/version.json` with `{ "version": "…" }`.
The same `/version.json` route is available during development. After updating
the package version, rebuild and deploy `dist` to publish the new version.

## Commands

Requires Node.js 22.12+ and npm.

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
