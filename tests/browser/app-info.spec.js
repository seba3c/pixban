import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const metadata = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("the built version endpoint matches the package version", async ({ request }) => {
  const response = await request.get("/version.json");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toEqual({ version: metadata.version });
});

for (const lang of ["en", "es"]) {
  test(`footer metadata is small, accessible and responsive in ${lang}`, async ({ page, browserName }) => {
    await page.goto(lang === "en" ? "/" : "/es/");
    const label = lang === "en" ? "View source on GitHub" : "Ver código en GitHub";
    const link = page.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveAttribute("href", metadata.repository.url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("title", label);
    await expect(link).toHaveText("");
    await expect(link.locator("svg")).toHaveAttribute("aria-hidden", "true");
    for (const width of [320, 680, 681, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      for (let theme = 0; theme < 2; theme++) {
        await page.getByLabel(lang === "en" ? "Toggle color theme" : "Cambiar tema de color").click();
        await expect(page.locator(".app-version")).toHaveText(`v${metadata.version}`);
        await expect(page.locator(".app-version")).toHaveCSS("font-size", "11px");
        const footer = await page.locator(".site-footer").boundingBox();
        const copyright = await page.locator(".copyright").boundingBox();
        const info = await page.locator(".app-info").boundingBox();
        const icon = await link.locator("svg").boundingBox();
        const target = await link.boundingBox();
        expect(icon.width).toBeCloseTo(13, 2);
        expect(icon.height).toBeCloseTo(13, 2);
        expect(target.width).toBeCloseTo(24, 2);
        expect(target.height).toBeCloseTo(24, 2);
        expect(info.x + info.width / 2).toBeCloseTo(footer.x + footer.width / 2, 0);
        expect(info.y).toBeGreaterThanOrEqual(footer.y);
        expect(info.y + info.height).toBeLessThanOrEqual(footer.y + footer.height);
        await expect(page.locator(".header .app-info")).toHaveCount(0);
        if (width <= 680) {
          expect(info.y).toBeGreaterThanOrEqual(copyright.y + copyright.height);
          await expect(page.locator(".canvas-bottom .status-privacy")).toBeVisible();
          await expect(page.locator(".footer-privacy")).toHaveCount(0);
          await expect(page.locator(".copyright")).toHaveText("@pixban 2026 by Juana y Lola");
        } else {
          expect(info.x).toBeGreaterThanOrEqual(copyright.x + copyright.width);
          expect(info.y + info.height / 2).toBeCloseTo(copyright.y + copyright.height / 2, 0);
          const privacy = await page.locator(".footer-privacy").boundingBox();
          expect(privacy.x).toBeGreaterThanOrEqual(info.x + info.width);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    await page.locator(".copyright a").focus();
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(link).toBeFocused();
  });
}
