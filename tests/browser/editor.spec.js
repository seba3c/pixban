import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
function fixture() {
  const png = new PNG({ width: 160, height: 100 });
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      png.data.set([x % 256, (y * 2) % 256, (x + y) % 256, 255], i);
    }
  return PNG.sync.write(png);
}
async function openImage(page) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: fixture(),
  });
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect.poll(() => page.getByTestId("editor-canvas").evaluate(c => {
    const view = c.parentElement.getBoundingClientRect();
    const rect = c.getBoundingClientRect();
    const alpha = c.getContext("2d").getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data[3];
    return Math.abs(rect.width - view.width) < 1 && Math.abs(rect.height - view.height) < 1 && alpha === 255;
  })).toBe(true);
}
async function draw(page) {
  const c = page.getByTestId("editor-canvas"),
    b = await c.boundingBox();
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x - 40, y - 25);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 25, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".region-row")).toHaveCount(1);
}
async function expectSelectionColor(page, theme) {
  // Fixture pixels have no red above 159 and no bright blue-dominant pixels.
  // This checks the visible outline, including antialiased strokes, after redraw.
  await expect.poll(() => page.getByTestId("editor-canvas").evaluate((canvas, mode) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = data.subarray(i, i + 3);
      if (mode === "light" ? b > 160 && b > r * 1.7 && b > g * 1.3 : r > 180 && r > g * 1.5 && r > b * 1.5) return true;
    }
    return false;
  }, theme)).toBe(true);
}
async function imageAction(page, name) {
  await page.locator(".file-menu > button").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function download(page, format = "png") {
  await imageAction(page, "Download");
  await page.locator("#export-format").selectOption(format);
  const wait = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download image", exact: true })
    .click();
  const result = await wait;
  const stream = await result.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { bytes: Buffer.concat(chunks), filename: result.suggestedFilename() };
}
test("English default, language and theme persistence", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir imagen", exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("Cambiar tema de color").click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
});
test("rectangle, independent intensity, history, exports and preference changes", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openImage(page);
  await draw(page);
  await expect(page.locator(".tool.active")).toHaveCSS("color", "rgb(37, 99, 235)");
  await expectSelectionColor(page, "light");
  await page.locator("#block").fill("32");
  await page.locator("#block").press("ArrowRight");
  await page.locator("#block").blur();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  const first = await download(page);
  expect(first.filename).toBe("test-pixelated.png");
  const result = PNG.sync.read(first.bytes);
  expect([result.width, result.height]).toEqual([160, 100]);
  expect([...result.data.slice(0, 4)]).toEqual([0, 0, 0, 255]);
  expect(result.data.equals(PNG.sync.read(fixture()).data)).toBe(false);
  await page.getByLabel("Toggle color theme").click();
  await expect(page.locator(".tool.active")).toHaveCSS("color", "rgb(248, 113, 113)");
  await expectSelectionColor(page, "dark");
  const second = await download(page);
  expect(PNG.sync.read(second.bytes).data.equals(result.data)).toBe(true);
  const jpg = await download(page, "jpeg");
  expect(jpg.filename).toBe("test-pixelated.jpg");
  expect(jpg.bytes[0]).toBe(255);
  expect(jpg.bytes[1]).toBe(216);
  await page.getByRole("link", { name: "ES", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
});
test("brush, selection deletion and unsupported file preserve current image", async ({
  page,
}) => {
  await openImage(page);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await draw(page);
  await expect(page.locator(".region-row")).toContainText("Brush stroke");
  await page.getByTestId("file-input").setInputFiles({
    name: "bad.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("bad"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete region 1", exact: true })
    .click();
  await expect(page.locator(".region-row")).toHaveCount(0);
});

test("initial canvas render is centered before user interaction", async ({
  page,
}) => {
  await openImage(page);
  await expect
    .poll(async () =>
      page.getByTestId("editor-canvas").evaluate((c) => {
        const rgba = [
          ...c
            .getContext("2d")
            .getImageData(
              Math.floor(c.width / 2),
              Math.floor(c.height / 2),
              1,
              1,
            ).data,
        ];
        return rgba.every((n, i) => Math.abs(n - [80, 100, 130, 255][i]) <= 2);
      }),
    )
    .toBe(true);
});

test("reset cancels safely, clears history and restores defaults while preserving preferences", async ({ page }) => {
  await page.goto("/");
  await page.locator(".file-menu > button").click();
  await expect(page.getByRole("menuitem", { name: "Close", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("#block")).toHaveValue("35");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await expect(page.locator("#diameter")).toHaveValue("45");
  await openImage(page);
  await draw(page);
  await page.locator("#block").fill("80");
  await page.locator("#block").blur();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.locator("#diameter").fill("180");
  await imageAction(page, "Download");
  await page.locator("#export-format").selectOption("jpeg");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Toggle color theme").click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await imageAction(page, "Cerrar");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await expect(page.locator("#diameter")).toHaveValue("180");
  page.once("dialog", (dialog) => dialog.accept());
  await imageAction(page, "Cerrar");
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  await expect(page.locator(".region-row")).toHaveCount(0);
  await expect(page.locator("#block")).toHaveValue("35");
  await expect(page.getByRole("button", { name: "Rectángulo", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rehacer", exact: true })).toBeDisabled();
  await page.locator(".file-menu > button").click();
  await expect(page.getByRole("menuitem", { name: "Descargar", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await page.getByRole("button", { name: "Pincel", exact: true }).click();
  await expect(page.locator("#diameter")).toHaveValue("45");
  await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await imageAction(page, "Descargar");
  await expect(page.locator("#export-format")).toHaveValue("png");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  // An untouched image resets without a confirmation dialog.
  let confirmed = false;
  page.once("dialog", async (dialog) => { confirmed = true; await dialog.accept(); });
  await imageAction(page, "Cerrar");
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  expect(confirmed).toBe(false);
});

test("size previews follow sliders and selected regions at a fixed half scale", async ({ page }) => {
  await openImage(page);
  const preview = page.locator(".block-preview");
  const zoom = await page.locator(".zoom-controls > span").first().textContent();
  for (const value of [4, 35, 96]) {
    await page.locator("#block").fill(String(value));
    await expect(preview).toHaveCSS("background-size", `${value}px ${value}px`);
    await expect(preview).toHaveCSS("background-position", "50% 50%");
  }
  await draw(page);
  await page.locator("#block").fill("50");
  await expect(preview).toHaveCSS("background-size", "50px 50px");
  await page.locator("#block").blur();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(preview).toHaveCSS("background-size", "96px 96px");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  for (const value of [8, 45, 240]) {
    await page.locator("#diameter").fill(String(value));
    await expect(page.locator(".brush-preview span")).toHaveCSS("width", `${value / 2}px`);
    await expect(page.locator(".brush-preview span")).toHaveCSS("height", `${value / 2}px`);
  }
  await expect(page.locator(".zoom-controls > span").first()).toHaveText(zoom);
  await page.locator("#diameter").press("ArrowLeft");
  await expect(page.locator(".brush-preview span")).toHaveCSS("width", "119.5px");
});

test("header, attribution and previews remain available on mobile in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  for (const locale of ["EN", "ES"]) {
    await page.getByRole("link", { name: locale, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: locale, exact: true })).toHaveAttribute("aria-current", "true");
    for (let i = 0; i < 2; i++) {
      await page.locator(".header-actions .icon-button").click();
      const theme = await page.locator("html").getAttribute("data-theme");
      await expect(page.locator(".tool.active")).toHaveCSS("color", theme === "dark" ? "rgb(248, 113, 113)" : "rgb(37, 99, 235)");
      await page.getByRole("button", { name: locale === "EN" ? "Settings and regions" : "Ajustes y regiones", exact: true }).click();
      await expect(page.locator(".block-preview")).toBeVisible();
      await expect(page.locator(".brush-preview")).toBeVisible();
      await page.locator(".privacy-card").scrollIntoViewIfNeeded();
      await expect(page.locator(".privacy-card")).toBeVisible();
      expect(await page.locator(".regions").evaluate(el => el.nextElementSibling?.classList.contains("privacy-card"))).toBe(true);
      const drawer = await page.locator(".settings-dialog").boundingBox();
      expect(Math.round(drawer.y + drawer.height)).toBe(812 - 52);
      await page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true }).click();
      await expect(page.locator(".site-footer")).toContainText("@pixban 2026 - Designed by Juana y Lola");
      await expect(page.locator(".site-footer a")).toBeVisible();
      await expect(page.locator(".site-footer")).toHaveCSS("height", "52px");
      await expect(page.locator(".site-footer")).toHaveCSS("font-size", "13px");
      await expect(page.locator(".site-footer")).toHaveCSS("text-align", "center");
      await expect(page.locator(".site-footer a")).toHaveAttribute("href", "https://juanaylola.com/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await expect(page.locator(".header-caption, .local-badge, .header select")).toHaveCount(0);
  await expect(page.locator(".size-preview figcaption, .empty-state h2")).toHaveCount(0);
});


test("sample car loads without edits, suggests the plate and exports edited pixels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample image", exact: true }).click();
  await expect(page.locator(".image-name")).toHaveText("Retro cars.png");
  await expect(page.locator(".canvas-hint")).toHaveText("Try pixelating the cars’ license plates.");
  await expect(page.locator(".region-row")).toHaveCount(0);
  const original = PNG.sync.read((await download(page)).bytes);
  const box = await page.getByTestId("editor-canvas").boundingBox();
  const scale = Math.min((box.width - 80) / original.width, (box.height - 80) / original.height, 1);
  const x = box.x + (box.width - original.width * scale) / 2;
  const y = box.y + (box.height - original.height * scale) / 2;
  const plates = [[.270, .731, .347, .814], [.805, .716, .884, .800]];
  for (const [i, [left, top, right, bottom]] of plates.entries()) {
    await page.mouse.move(x + original.width * left * scale, y + original.height * top * scale);
    await page.mouse.down();
    await page.mouse.move(x + original.width * right * scale, y + original.height * bottom * scale, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".region-row")).toHaveCount(i + 1);
  }
  await expect(page.locator(".canvas-hint")).not.toContainText("license plate");
  const edited = PNG.sync.read((await download(page)).bytes);
  expect([edited.width, edited.height]).toEqual([original.width, original.height]);
  expect(edited.data.equals(original.data)).toBe(false);
  for (const [left, top, right, bottom] of plates) {
    let changed = false;
    for (let py = Math.ceil(top * original.height); py < Math.floor(bottom * original.height); py++) {
      const from = (py * original.width + Math.ceil(left * original.width)) * 4;
      const to = (py * original.width + Math.floor(right * original.width)) * 4;
      changed ||= !edited.data.subarray(from, to).equals(original.data.subarray(from, to));
    }
    expect(changed).toBe(true);
  }
  await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await expect(page.locator(".image-name")).toHaveText("test.png");
  await expect(page.locator(".canvas-hint")).not.toContainText("license plate");
});

test("menu keyboard navigation and viewport layout", async ({ page }) => {
  await openImage(page);
  const trigger = page.locator(".file-menu > button");
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Open image", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Download", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await trigger.click();
  await page.locator(".brand").click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  for (const size of [{ width: 1440, height: 900 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const studio = await page.locator(".studio").boundingBox();
    expect(Math.round(studio.x)).toBe(0);
    expect(Math.round(studio.width)).toBe(size.width);
  }
});


test("pixban branding preserves legacy preferences and removes the workspace heading", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pixelar.language", "es");
    localStorage.setItem("pixelar.theme", "dark");
  });
  await page.goto("/");
  await expect(page).toHaveTitle("pixban");
  await expect(page.locator(".brand")).toHaveText("pixban.");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".toolbar h1")).toHaveCount(0);
  await expect(page.locator(".privacy-card")).toContainText("100 % local. Siempre privado.");
  await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute("aria-label", "Editor de imagen");
});


test("light mode uses neutral fills and places privacy after a long region list", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openImage(page);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await expect(page.locator(".brush-preview span")).toHaveCSS("background-color", "rgb(229, 229, 229)");
  await expect(page.locator(".tool.active")).toHaveCSS("background-color", "rgb(229, 229, 229)");
  await expect(page.locator(".tool.active")).toHaveCSS("border-top-color", "rgb(37, 99, 235)");
  const canvas = await page.getByTestId("editor-canvas").boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(canvas.x + canvas.width / 2 - 25, canvas.y + canvas.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2 + 25, canvas.y + canvas.height / 2);
    await page.mouse.up();
  }
  await expect(page.locator(".region-row")).toHaveCount(12);
  await page.locator(".privacy-card").scrollIntoViewIfNeeded();
  await expect(page.locator(".privacy-card")).toBeVisible();
  expect(await page.locator(".regions").evaluate(el => el.nextElementSibling?.classList.contains("privacy-card"))).toBe(true);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Settings and regions", exact: true }).click();
  await page.locator(".privacy-card").scrollIntoViewIfNeeded();
  await expect(page.locator(".privacy-card")).toBeVisible();
  expect(await page.locator(".regions").evaluate(el => el.getBoundingClientRect().bottom <= el.nextElementSibling.getBoundingClientRect().top)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-footer")).toHaveCSS("text-align", "center");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await imageAction(page, "Download");
  await expect(page.locator(".dialog-icon")).toHaveCSS("background-color", "rgb(229, 229, 229)");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await imageAction(page, "Close");
  await page.locator(".file-menu > button").click();
  await expect(page.getByRole("menuitem", { name: "Download", exact: true })).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCSS("color", "rgb(115, 115, 115)");
});
