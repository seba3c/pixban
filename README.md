# pixban

## Summary

A browser-based image pixelation editor that processes images locally on your device.

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
