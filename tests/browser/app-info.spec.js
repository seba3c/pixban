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
    const link = page.getByRole("link", { name: `v${metadata.version}, ${label}`, exact: true });
    await expect(link).toHaveAttribute("href", metadata.repository.url);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await expect(link).toHaveAttribute("title", label);
    const githubIcon = link.locator("svg.lucide-github");
    await expect(githubIcon).toHaveAttribute("aria-hidden", "true");
    const sponsorLabel = lang === "en" ? "Support Pixban on GitHub Sponsors" : "Apoyar Pixban en GitHub Sponsors";
    const sponsor = page.getByRole("link", { name: sponsorLabel, exact: true });
    const supportText = lang === "en" ? "Support" : "Apoyar";
    await expect(sponsor).toHaveText(supportText);
    await expect(sponsor).toHaveAttribute("href", "https://github.com/sponsors/seba3c");
    await expect(sponsor).toHaveAttribute("target", "_blank");
    await expect(sponsor).toHaveAttribute("rel", "noopener noreferrer");
    await expect(sponsor.locator("svg.lucide-heart")).toHaveAttribute("aria-hidden", "true");
    expect(await sponsor.evaluate(element => element.firstChild.textContent)).toBe(supportText);
    const separator = page.locator(".repository-link + span");
    await expect(separator).toHaveText("·");
    await expect(separator).toHaveAttribute("aria-hidden", "true");
    const version = link.locator(".app-version");
    await expect(sponsor).toHaveCSS("font-family", await version.evaluate(element => getComputedStyle(element).fontFamily));
    for (const width of [320, 680, 681, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      for (let theme = 0; theme < 2; theme++) {
        await page.getByLabel(lang === "en" ? "Toggle color theme" : "Cambiar tema de color").click();
        await expect(version).toHaveText(`v${metadata.version}`);
        await expect(version).toHaveCSS("font-size", "11px");
        await expect(sponsor).toHaveCSS("font-size", "11px");
        await expect(sponsor).toHaveCSS("color", await version.evaluate(element => getComputedStyle(element).color));
        const footer = await page.locator(".site-footer").boundingBox();
        const copyright = await page.locator(".copyright").boundingBox();
        const info = await page.locator(".app-info").boundingBox();
        const versionText = await version.boundingBox();
        const icon = await githubIcon.boundingBox();
        const target = await link.boundingBox();
        const divider = await separator.boundingBox();
        const sponsorTarget = await sponsor.boundingBox();
        expect(icon.width).toBeCloseTo(13, 2);
        expect(icon.height).toBeCloseTo(13, 2);
        expect(icon.x).toBeGreaterThanOrEqual(versionText.x + versionText.width);
        expect(target.height).toBeCloseTo(24, 2);
        expect(divider.x).toBeGreaterThanOrEqual(target.x + target.width);
        expect(sponsorTarget.x).toBeGreaterThanOrEqual(divider.x + divider.width);
        expect(sponsorTarget.y).toBeCloseTo(target.y, 2);
        expect(sponsorTarget.height).toBeCloseTo(24, 2);
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
    await sponsor.hover();
    await expect(sponsor).toHaveCSS("text-decoration-line", "none");
    const tab = browserName === "webkit" ? "Alt+Tab" : "Tab";
    await page.locator(".copyright a").focus();
    await page.keyboard.press(tab);
    await expect(link).toBeFocused();
    await page.keyboard.press(tab);
    await expect(sponsor).toBeFocused();
  });
}
