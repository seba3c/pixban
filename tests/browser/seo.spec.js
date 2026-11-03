import { test, expect } from "@playwright/test";

test("both locale pages remain readable to crawlers without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  for (const [path, lang, heading] of [["/", "en", "Pixelate images online"], ["/es/", "es", "Pixelar imágenes online"]]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expect(page.locator(".image-guide li")).toHaveCount(3);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);
    const schema = await page.locator('script[type="application/ld+json"]').textContent();
    expect(JSON.parse(schema).inLanguage).toBe(lang);
  }
  await context.close();
});

test("language navigation updates URL and metadata and supports Back and reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  await expect(page).toHaveURL(/\/es\/$/);
  await expect(page).toHaveTitle("pixban — Pixelar imágenes online y en privado");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /^Pixela caras/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pixelar imágenes online");
  await page.getByRole("link", { name: "EN", exact: true }).click();
  expect(new URL(page.url()).pathname).toBe("/");
  await page.goBack();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle("pixban — Pixelar imágenes online y en privado");
});
