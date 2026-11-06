import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
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
async function expectSelectionColor(page, theme, visible = true) {
  // Fixture pixels have no red above 159 and no bright blue-dominant pixels.
  // This checks the visible outline, including antialiased strokes, after redraw.
  await expect.poll(() => page.getByTestId("editor-canvas").evaluate((canvas, mode) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = data.subarray(i, i + 3);
      if (mode === "light" ? b > 160 && b > r * 1.7 && b > g * 1.3 : r > 180 && r > g * 1.5 && r > b * 1.5) return true;
    }
    return false;
  }, theme)).toBe(visible);
}
async function expectCompactPreviews(page) {
  const block = page.locator(".block-preview");
  const brush = page.locator(".brush-preview");
  await expect(block).toHaveCSS("width", "60px");
  await expect(block).toHaveCSS("height", "60px");
  await expect(block).toHaveAttribute("width", "120");
  await expect(block).toHaveAttribute("height", "120");
  await expect(block.locator("..")).toHaveCSS("height", "78px");
  await expect(brush).toHaveCSS("height", "60px");
  await expect(brush.locator("..")).toHaveCSS("height", "78px");
  await expect(brush.locator("span")).toHaveCSS("width", "50px");
  await expect(brush.locator("span")).toHaveCSS("height", "50px");
  expect(await brush.evaluate(element => {
    const preview = element.getBoundingClientRect();
    const circle = element.firstElementChild.getBoundingClientRect();
    return circle.left >= preview.left && circle.right <= preview.right &&
      circle.top >= preview.top && circle.bottom <= preview.bottom;
  })).toBe(true);
}
async function imageAction(page, name) {
  const close = ["Close", "Cerrar"].includes(name);
  await page.locator(close ? ".document-bar" : ".action-bar").getByRole("button", { name: close ? (name === "Close" ? "Close image" : "Cerrar imagen") : name, exact: true }).click();
}
async function download(page, format = "png") {
  await imageAction(page, "Export");
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
    page.locator(".action-bar").getByRole("button", { name: "Abrir imagen", exact: true }),
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
  await page.locator("#block").fill("20");
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

for (const theme of ["light", "dark"]) {
  test(`brush shows its region outline only after release in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openImage(page);
    await draw(page);
    await expectSelectionColor(page, theme);
    await page.getByRole("button", { name: "Brush", exact: true }).click();
    const box = await page.getByTestId("editor-canvas").boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x - 60, y + 10);
    await page.mouse.down();
    await expectSelectionColor(page, theme, false);
    await page.mouse.move(x - 50, y + 20, { steps: 4 });
    await expectSelectionColor(page, theme, false);
    await expect(page.locator(".region-row")).toHaveCount(1);
    await page.mouse.up();
    await expect(page.locator(".region-row")).toHaveCount(2);
    await expect(page.locator(".region-row").last()).toContainText("Brush stroke");
    await expectSelectionColor(page, theme);
  });
}

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
  await expect(page.locator(".document-bar")).toHaveCount(0);
  await expect(page.locator("#block")).toHaveValue("25");
  await expect(page.getByRole("button", { name: "Brush", exact: true })).toBeDisabled();
  await expect(page.locator("#diameter")).toHaveValue("45");
  await openImage(page);
  await draw(page);
  await page.locator("#block").fill("20");
  await page.locator("#block").blur();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.locator("#diameter").fill("50");
  await imageAction(page, "Export");
  await page.locator("#export-format").selectOption("jpeg");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Toggle color theme").click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("link", { name: "ES", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await imageAction(page, "Cerrar");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await expect(page.locator("#diameter")).toHaveValue("50");
  page.once("dialog", (dialog) => dialog.accept());
  await imageAction(page, "Cerrar");
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  await expect(page.locator(".region-row")).toHaveCount(0);
  await expect(page.locator("#block")).toHaveValue("25");
  await expect(page.getByRole("button", { name: "Rectángulo", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Deshacer", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Rehacer", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Exportar", exact: true })).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.getByRole("button", { name: "Pincel", exact: true })).toBeDisabled();
  await expect(page.locator("#diameter")).toHaveValue("45");
  await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await imageAction(page, "Exportar");
  await expect(page.locator("#export-format")).toHaveValue("png");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  // An untouched image resets without a confirmation dialog.
  let confirmed = false;
  page.once("dialog", async (dialog) => { confirmed = true; await dialog.accept(); });
  await imageAction(page, "Cerrar");
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  expect(confirmed).toBe(false);
});

test("block size stops at 25 px, brush at 50 px and previews match their pixel sizes", async ({ page }) => {
  await openImage(page);
  const preview = page.locator(".block-preview");
  const block = page.locator("#block");
  const brush = page.locator("#diameter");
  const zoom = await page.locator(".zoom-input").inputValue();
  await expect(block).toHaveValue("25");
  await expect(brush).toHaveValue("45");
  await expect(brush).toBeDisabled();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await expect(brush).toBeEnabled();
  for (const [control, minimum, maximum] of [[block, "4", "25"], [brush, "8", "50"]]) {
    await expect(control).toHaveAttribute("min", minimum);
    await expect(control).toHaveAttribute("max", maximum);
    await control.press("End");
    await control.press("ArrowRight");
    await expect(control).toHaveValue(maximum);
    await control.press("Home");
    await control.press("ArrowLeft");
    await expect(control).toHaveValue(minimum);
  }
  await expect(page.locator(".range-ends span")).toHaveText(["4 px", "25 px"]);
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  for (const value of [4, 25, 20]) {
    await block.fill(String(value));
    await expect(preview).toHaveAttribute("data-cell-size", String(value));
  }
  await draw(page);
  await block.fill("25");
  await expect(preview).toHaveAttribute("data-cell-size", "25");
  await block.blur();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(block).toHaveValue("20");
  await expect(preview).toHaveAttribute("data-cell-size", "20");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(block).toHaveValue("25");
  await expect(preview).toHaveAttribute("data-cell-size", "25");
  await page.locator(".region-row").click();
  await expect(page.locator(".tool-select")).toHaveAttribute("aria-pressed", "true");
  await expect(block).toBeEnabled();
  await block.fill("24");
  await block.blur();
  await expect(preview).toHaveAttribute("data-cell-size", "24");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(block).toHaveValue("25");
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  for (const value of [8, 45, 50]) {
    await brush.fill(String(value));
    await expect(page.locator(".brush-preview span")).toHaveCSS("width", `${value}px`);
    await expect(page.locator(".brush-preview span")).toHaveCSS("height", `${value}px`);
  }
  await expect(page.locator(".zoom-input")).toHaveValue(zoom);
  await brush.press("ArrowLeft");
  await expect(page.locator(".brush-preview span")).toHaveCSS("width", "49px");
  await brush.press("ArrowRight");
  for (let appearance = 0; appearance < 2; appearance++) {
    await expectCompactPreviews(page);
    await page.getByLabel("Toggle color theme").click();
  }
  const pixels = () => preview.evaluate(canvas => [...canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data]);
  const beforeZoom = await pixels();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".zoom-input")).not.toHaveValue(zoom);
  await expectCompactPreviews(page);
  expect(await pixels()).toEqual(beforeZoom);
});

test("header, attribution and previews remain available on mobile in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openImage(page);
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
      await page.locator("#block").fill("25");
      await page.locator("#diameter").fill("50");
      await expectCompactPreviews(page);
      await expect(page.locator(".settings-dialog .status-privacy")).toHaveCount(0);
      const drawer = await page.locator(".settings-dialog").boundingBox();
      expect(Math.round(drawer.y + drawer.height)).toBe(Math.round((await page.locator(".site-footer").boundingBox()).y));
      await page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true }).click();
      await expect(page.locator(".site-footer")).toContainText("@pixban 2026 by Juana y Lola");
      await expect(page.locator(".copyright a")).toBeVisible();
      await expect(page.locator(".site-footer")).toHaveCSS("font-size", "13px");
      await expect(page.locator(".site-footer")).toHaveCSS("text-align", "center");
      await expect(page.locator(".copyright a")).toHaveAttribute("href", "https://juanaylola.com/");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await expect(page.locator(".header-caption, .local-badge, .header select")).toHaveCount(0);
  await expect(page.locator(".size-preview figcaption, .empty-state h2")).toHaveCount(0);
});


test("sample car loads without edits, suggests the plate and exports edited pixels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a sample image", exact: true }).click();
  await expect(page.locator(".image-name")).toHaveText("Retro cars.webp");
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

test("visible actions support keyboard navigation and viewport layout", async ({ page, browserName }) => {
  await openImage(page);
  const open = page.locator(".open-action");
  await open.focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator(".paste-action")).toBeFocused();
  // Disabled history buttons are skipped in the native tab order.
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator(".copy-action")).toBeFocused();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator(".action-bar .primary")).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  for (const size of [{ width: 1440, height: 900 }, { width: 320, height: 700 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    const studio = await page.locator(".studio").boundingBox();
    expect(Math.round(studio.x)).toBe(0);
    expect(Math.round(studio.width)).toBe(size.width);
    if (size.width <= 680) {
      const toolbar = await page.locator(".toolbar").boundingBox();
      const canvas = await page.locator(".canvas-area").boundingBox();
      expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(canvas.y);
    }
  }
});


test("pixban branding and localized route preserve the legacy theme preference", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pixelar.language", "es");
    localStorage.setItem("pixelar.theme", "dark");
  });
  await page.goto("/es/");
  await expect(page).toHaveTitle("pixban — Pixelar imágenes online y en privado");
  await expect(page.locator(".brand")).toHaveText("pixban.");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".toolbar h1")).toHaveCount(0);
  await expect(page.locator(".privacy-notice")).toContainText("100 % local. Siempre privado.");
  await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute("aria-label", "Editor de imagen");
});


test("light mode uses neutral fills and keeps status privacy outside a long region list", async ({ page }) => {
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
  await page.locator(".privacy-notice").scrollIntoViewIfNeeded();
  await expect(page.locator(".privacy-notice")).toBeVisible();
  await expect(page.locator(".panel .status-privacy")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.getByRole("button", { name: "Settings and regions", exact: true }).click();
  await expect(page.locator(".settings-dialog .status-privacy")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".site-footer")).toHaveCSS("text-align", "center");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await imageAction(page, "Export");
  await expect(page.locator(".dialog-icon")).toHaveCSS("background-color", "rgb(229, 229, 229)");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await imageAction(page, "Close");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCSS("color", "rgb(176, 176, 176)");
});

test("collapsing the inspector preserves edits, manual zoom and the centered image point", async ({ page }) => {
  await openImage(page);
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.locator("#diameter").fill("50");
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await draw(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  const canvas = page.getByTestId("editor-canvas");
  await canvas.hover();
  const wheelDrawn = canvas.evaluate(element => new Promise(resolve => {
    element.addEventListener("wheel", () => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, { once: true });
  }));
  await page.mouse.wheel(15, 10);
  await wheelDrawn;
  const centerPixel = () => canvas.evaluate(c => [...c.getContext("2d").getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data]);
  const before = await canvas.boundingBox();
  const pixel = await centerPixel();
  const zoom = await page.locator(".zoom-input").inputValue();
  const toggle = page.getByRole("button", { name: "Collapse settings and regions", exact: true });
  await toggle.click();
  await expect(page.locator("#settings-content")).toBeHidden();
  await expect(page.getByRole("button", { name: "Expand settings and regions" })).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await canvas.boundingBox()).width).toBeGreaterThan(before.width);
  await expect(page.locator(".zoom-input")).toHaveValue(zoom);
  await expect.poll(centerPixel).toEqual(pixel);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Settings and regions", exact: true }).click();
  await expect(page.locator("#diameter")).toHaveValue("50");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Settings and regions", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#settings-content")).toBeHidden();
  await page.getByRole("button", { name: "Expand settings and regions" }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await expect(page.locator(".region-list li.selected")).toHaveCount(1);
  await expect(page.locator("#diameter")).toHaveValue("50");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Fit to view", exact: true }).click();
  await expect(page.locator(".zoom-input")).toHaveValue("100");
  await expect.poll(async () => (await centerPixel()).every((n, i) => Math.abs(n - [80, 100, 130, 255][i]) <= 2)).toBe(true);
});

test("grayscale mosaic is stable and brush diameter is enabled only with the brush tool", async ({ page }) => {
  await openImage(page);
  await page.locator("#block").fill("10");
  const pixels = () => page.locator(".block-preview").evaluate(c => [...c.getContext("2d").getImageData(0, 0, c.width, c.height).data]);
  const original = await pixels();
  const tones = new Set();
  let grayscale = true;
  for (let i = 0; i < original.length; i += 4) {
    grayscale &&= original[i] === original[i + 1] && original[i] === original[i + 2] && original[i + 3] === 255;
    tones.add(original[i]);
  }
  expect(grayscale).toBe(true);
  expect(tones.size).toBeGreaterThan(10);
  await page.locator("#block").fill("15");
  const alternate = await pixels();
  await page.locator("#block").fill("21");
  await page.locator("#block").fill("15");
  expect(await pixels()).toEqual(alternate);
  await page.locator("#block").fill("10");
  // A full cell is flat, and distant cells are not a repeated checkerboard tile.
  expect(original.slice(0, 4)).toEqual(original.slice(10 * 4, 10 * 4 + 4));
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.locator("#diameter").fill("40");
  for (const tool of ["Select", "Rectangle", "Brush", "Pan"]) {
    await page.getByRole("button", { name: tool, exact: true }).click();
    await expect(page.locator("#block")).toBeEnabled();
    await expect(page.locator("#diameter")).toBeVisible();
    if (tool === "Brush") await expect(page.locator("#diameter")).toBeEnabled();
    else await expect(page.locator("#diameter")).toBeDisabled();
    await expect(page.locator("#diameter")).toHaveValue("40");
    await expect(page.locator(".brush-preview")).toBeVisible();
  }
  await page.getByLabel("Toggle color theme").click();
  await page.getByRole("link", { name: "ES", exact: true }).click();
  expect(await pixels()).toEqual(original);
  await expect(page.locator(".copyright a")).toHaveCSS("text-decoration-line", "none");
});

test("block preview scales the same cells around a fixed center", async ({ page }) => {
  await openImage(page);
  let reference;
  for (const value of [4, 15, 20, 25]) {
    await page.locator("#block").fill(String(value));
    const samples = await page.locator(".block-preview").evaluate((canvas, block) => {
      const ctx = canvas.getContext("2d");
      const center = canvas.width / 2;
      const offset = Math.min(block, center / 2);
      // Sample the four cells touching the center, both near the origin and
      // farther inside the visible circle. Their colors stay anchored at every scale.
      return [-1, 1].flatMap(y => [-1, 1].map(x => ({
        near: [...ctx.getImageData(center + (x < 0 ? -1 : 0), center + (y < 0 ? -1 : 0), 1, 1).data],
        interior: [...ctx.getImageData(center + x * offset, center + y * offset, 1, 1).data],
      })));
    }, value);
    const colors = samples.map(sample => sample.interior);
    for (const sample of samples) expect(sample.near).toEqual(sample.interior);
    reference ??= colors;
    expect(colors).toEqual(reference);
  }
  for (const value of [4, 10, 20]) {
    await page.locator("#block").fill(String(value));
    const cells = await page.locator(".block-preview").evaluate((canvas, block) => {
      const ctx = canvas.getContext("2d");
      const center = canvas.width / 2;
      const pixel = x => [...ctx.getImageData(x, center, 1, 1).data];
      // A CSS pixel uses two backing pixels, so a block-wide cell ends here.
      return {
        center: pixel(center),
        last: pixel(center + 2 * block - 1),
        next: pixel(center + 2 * block),
      };
    }, value);
    expect(cells.last).toEqual(cells.center);
    expect(cells.next).not.toEqual(cells.center);
  }
});

test("desktop inspector starts below the logo and icon tools keep hints and shortcuts", async ({ page }) => {
  await page.goto("/");
  for (const locale of ["EN", "ES"]) {
    await page.getByRole("link", { name: locale, exact: true }).click();
    for (const width of [1440, 812, 681]) {
      await page.setViewportSize({ width, height: 900 });
      for (let appearance = 0; appearance < 2; appearance++) {
        await page.locator(".header-actions .icon-button").click();
        for (const collapsed of [false, true]) {
          const header = await page.locator(".header").boundingBox();
          const panel = await page.locator(".panel").boundingBox();
          const actions = await page.locator(".action-bar").boundingBox();
          const tools = await page.locator(".toolbar").boundingBox();
          expect(panel.y).toBeCloseTo(header.y + header.height, 0);
          expect(actions.x + actions.width).toBeCloseTo(panel.x, 0);
          expect(tools.width).toBe(52);
          const bottom = await page.locator(".canvas-bottom").boundingBox();
          const privacy = await page.locator(".site-footer .footer-privacy").boundingBox();
          const footer = await page.locator(".site-footer").boundingBox();
          const copyright = await page.locator(".copyright").boundingBox();
          await expect(page.locator(".canvas-bottom .privacy-notice")).toHaveCount(0);
          await expect(page.locator(".footer-privacy p")).toBeVisible();
          expect(footer.x + footer.width - privacy.x - privacy.width).toBeCloseTo(16, 0);
          expect(copyright.x - footer.x).toBeCloseTo(16, 0);
          expect(privacy.x).toBeGreaterThanOrEqual(copyright.x + copyright.width);
          expect(privacy.y + privacy.height).toBeLessThanOrEqual(footer.y + footer.height);
          expect(bottom.x).toBe(0);
          expect(bottom.x + bottom.width).toBeCloseTo(panel.x, 0);
          expect(tools.y).toBeCloseTo(actions.y + actions.height, 0);
          const emptyCanvas = await page.locator(".canvas-area").boundingBox();
          expect(emptyCanvas.y).toBeCloseTo(tools.y, 0);
          expect(tools.y + tools.height).toBeCloseTo(bottom.y, 0);
          for (const button of await page.locator(".action-bar > button").all()) {
            const box = await button.boundingBox();
            expect(box.x + box.width).toBeLessThanOrEqual(panel.x);
          }
          const toggle = page.locator(".panel-heading button");
          await expect(toggle).toHaveAttribute("aria-expanded", String(!collapsed));
          await expect(toggle).toBeEnabled();
          await toggle.click();
        }
      }
    }
    await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
    for (const [id, shortcut] of [["select", "V"], ["rect", "R"], ["brush", "B"], ["pan", "H"]]) {
      const tool = page.locator(`.tool-${id}`);
      await expect(tool).toHaveText("");
      const label = await tool.getAttribute("aria-label");
      expect(label.length).toBeGreaterThan(0);
      await expect(tool).toHaveAttribute("title", `${label} (${shortcut})`);
      const button = await tool.boundingBox();
      const icon = await tool.locator("svg").boundingBox();
      expect(icon.x + icon.width / 2).toBeCloseTo(button.x + button.width / 2, 0);
      await page.keyboard.press(shortcut.toLowerCase());
      await expect(tool).toHaveAttribute("aria-pressed", "true");
      await expect(tool).toBeFocused();
    }
    await imageAction(page, locale === "EN" ? "Close" : "Cerrar");
  }
});

for (const theme of ["light", "dark"]) {
  test(`empty editor stays readable and its inspector can collapse in ${theme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/");
    const toggle = page.locator(".panel-heading button");
    await expect(page.locator(".panel")).not.toHaveAttribute("aria-disabled");
    await expect(page.locator(".toolbar")).toHaveCSS("background-color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(37, 41, 48)");
    await expect(page.locator(".panel")).toHaveCSS("background-color", theme === "light" ? "rgb(250, 250, 250)" : "rgb(48, 53, 61)");
    await expect(page.locator("#settings-content")).toHaveAttribute("aria-disabled", "true");
    await expect(toggle).toHaveAttribute("aria-label", "Collapse settings and regions");
    for (const method of ["click", "Enter", "Space"]) {
      const activate = () => method === "click" ? toggle.click() : toggle.press(method);
      await activate();
      if (method !== "click") await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAttribute("aria-label", "Expand settings and regions");
      await expect(page.locator("#settings-content")).toBeHidden();
      await activate();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toHaveAttribute("aria-label", "Collapse settings and regions");
      await expect(page.locator("#settings-content")).toBeVisible();
      await expect(page.locator("#block")).toBeDisabled();
      await expect(page.locator("#diameter")).toBeDisabled();
      for (const tool of await page.locator(".tool").all()) await expect(tool).toBeDisabled();
    }
    const luminance = rgb => rgb.map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    const foreground = theme === "light" ? [176, 176, 176] : [161, 162, 172];
    const textForeground = theme === "light" ? [115, 115, 115] : foreground;
    // Light disabled icons use a visibly lighter gray; text retains its stronger contrast.
    const controlContrast = theme === "light" ? 2 : 3;
    const visible = await page.locator(".toolbar, .panel, .panel-heading strong, .range-label, .range-ends, .size-preview, .block-preview, .brush-preview, .regions-empty svg, .regions-empty strong, .regions-empty p, button:disabled, input:disabled").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
      const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number);
      let opacity = 1, background;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        opacity *= Number(style.opacity);
        if (!background && !style.backgroundColor.endsWith(", 0)")) background = rgb(style.backgroundColor);
      }
      return { opacity, foreground: rgb(getComputedStyle(element).color), background, disabled: element.matches(":disabled"), iconControl: element.matches(".tool, .icon-button, input[type='range']") };
    }));
    for (const element of visible) {
      expect(element.opacity).toBe(1);
      expect(contrast(element.foreground, element.background)).toBeGreaterThanOrEqual(element.disabled && element.iconControl ? controlContrast : 4.5);
      if (element.disabled) expect(element.foreground).toEqual(element.iconControl ? foreground : textForeground);
    }
    // Inspect painted pixels: native slider pseudo-element computed styles vary by engine.
    for (const selector of ["#block", "#diameter"]) {
      const range = page.locator(selector);
      const box = await range.boundingBox();
      const fraction = await range.evaluate(input => (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)));
      const clip = { x: Math.floor(box.x), y: Math.floor(box.y) - 8, width: Math.ceil(box.width), height: Math.ceil(box.height) + 16 };
      const png = PNG.sync.read(await page.screenshot({ clip, scale: "css" }));
      const same = (x, y) => foreground.every((value, channel) => Math.abs(png.data[(y * png.width + x) * 4 + channel] - value) <= 1);
      const centerY = Math.round(box.y - clip.y + box.height / 2);
      expect(same(Math.floor(png.width / 4), centerY)).toBe(true);
      const centerX = Math.round(box.x - clip.x + 7 + (box.width - 14) * fraction);
      let thumbPixels = 0;
      for (let y = centerY - 7; y <= centerY + 7; y++)
        for (let x = Math.max(0, centerX - 7); x <= Math.min(png.width - 1, centerX + 7); x++)
          if (Math.abs(y - centerY) >= 3 && same(x, y)) thumbPixels++;
      expect(thumbPixels).toBeGreaterThan(8);
    }
  });

  test(`tools and settings require an open image in ${theme} mode`, async ({ page, browserName }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const locale of ["EN", "ES"]) {
      for (const width of [1440, 375]) {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(locale === "EN" ? "/" : "/es/");
        const settings = page.locator(width === 375 ? ".settings-action" : ".panel-heading button");
        const expectDisabled = async () => {
          for (const tool of await page.locator(".tool").all()) await expect(tool).toBeDisabled();
          await expect(page.locator("#block")).toBeDisabled();
          await expect(page.locator("#diameter")).toBeDisabled();
          if (width === 375) await expect(settings).toBeDisabled();
          else await expect(settings).toBeEnabled();
          await expect(page.locator(".tool-rect")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
          await expect(page.locator(".open-action")).toBeEnabled();
          await expect(page.locator(".paste-action")).toBeEnabled();
          await expect(page.locator(".sample-link")).toBeEnabled();
        };
        await expectDisabled();
        await page.locator(".paste-action").focus();
        for (const key of ["v", "r", "b", "h"]) {
          await page.keyboard.press(key);
          await expect(page.locator(".paste-action")).toBeFocused();
          await expect(page.locator(".tool-rect")).toHaveAttribute("aria-pressed", "true");
        }
        await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
        await expect(page.locator(".empty-state .primary")).toBeFocused();
        await page.getByTestId("file-input").setInputFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
        await expect(page.getByTestId("editor-canvas")).toBeVisible();
        for (const tool of await page.locator(".tool").all()) await expect(tool).toBeEnabled();
        await expect(settings).toBeEnabled();
        if (width === 375) await settings.click();
        await expect(page.locator("#block")).toBeEnabled();
        await expect(page.locator("#diameter")).toBeDisabled();
        if (width === 375) await page.keyboard.press("Escape");
        await imageAction(page, locale === "EN" ? "Close" : "Cerrar");
        await expectDisabled();
      }
    }
  });

  test(`tool shortcuts move visible focus and respect editable fields and dialogs in ${theme} mode`, async ({ page, browserName }) => {
    await page.emulateMedia({ colorScheme: theme });
    await openImage(page);
    await page.locator(".tool-brush").click();
    await page.keyboard.press("r");
    await expect(page.locator(".tool-rect")).toBeFocused();
    await expect(page.locator(".tool-brush")).not.toBeFocused();
    for (const [id, key] of [["select", "v"], ["rect", "r"], ["brush", "b"], ["pan", "h"]]) {
      const button = page.locator(`.tool-${id}`);
      for (const shortcut of [key, `Shift+Key${key.toUpperCase()}`]) {
        await page.keyboard.press(shortcut);
        await expect(button).toBeFocused();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".tool:focus-visible")).toHaveCount(1);
        await expect(page.locator(".tool:focus-visible")).toHaveClass(new RegExp(`tool-${id}`));
        await expect(page.locator(".tool.active")).toHaveCount(1);
      }
      await page.keyboard.down(key);
      await page.keyboard.down(key);
      await page.keyboard.up(key);
      await expect(button).toBeFocused();
      await expect(button).toHaveAttribute("aria-pressed", "true");
    }
    await page.keyboard.press("r");
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(page.locator(".tool-brush")).toBeFocused();
    await expect(page.locator(".tool-rect")).toHaveAttribute("aria-pressed", "true");
    for (const selector of [".zoom-input", "#block"]) {
      const field = page.locator(selector);
      await field.focus();
      await page.keyboard.press("b");
      await expect(field).toBeFocused();
      await expect(page.locator(".tool-rect")).toHaveAttribute("aria-pressed", "true");
    }
    await imageAction(page, "Export");
    const cancel = page.getByRole("button", { name: "Cancel", exact: true });
    await cancel.focus();
    await page.keyboard.press("h");
    await expect(cancel).toBeFocused();
    await expect(page.locator(".tool-rect")).toHaveAttribute("aria-pressed", "true");
    await cancel.click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "Settings and regions", exact: true }).click();
    const close = page.getByRole("button", { name: "Close settings", exact: true });
    await close.focus();
    await page.keyboard.press("h");
    await expect(close).toBeFocused();
    await expect(page.locator(".tool-rect")).toHaveAttribute("aria-pressed", "true");
  });
}

test("tools start below actions beside the document title and file actions use accessible icons", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".action-bar .primary")).toBeDisabled();
  await expect(page.locator(".empty-state").getByRole("button", { name: "Open image", exact: true })).toHaveText("Open image");
  const chooserReady = page.waitForEvent("filechooser");
  await page.locator(".open-action").click();
  await (await chooserReady).setFiles({ name: "test.png", mimeType: "image/png", buffer: fixture() });
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await expect(page.locator(".document-bar > svg.lucide-image")).toBeVisible();
  await expect(page.locator(".document-bar").getByRole("button", { name: "Close image", exact: true })).toBeVisible();
  for (const locale of ["EN", "ES"]) {
    await page.getByRole("link", { name: locale, exact: true }).click();
    for (const size of [{width: 1440, height: 900}, {width: 812, height: 900}, {width: 681, height: 900}, {width: 375, height: 812}, {width: 320, height: 700}]) {
      await page.setViewportSize(size);
      for (let appearance = 0; appearance < 2; appearance++) {
        await page.locator(".header-actions .icon-button").click();
        for (const [selector, label] of [[".copy-action", locale === "EN" ? "Copy to clipboard" : "Copiar al portapapeles"], [".open-action", locale === "EN" ? "Open image" : "Abrir imagen"], [".paste-action", locale === "EN" ? "Paste image" : "Pegar imagen"], [".action-bar .primary", locale === "EN" ? "Export" : "Exportar"]]) {
          const action = page.locator(selector);
          await expect(action).toHaveText("");
          await expect(action).toHaveAttribute("aria-label", label);
          await expect(action).toHaveAttribute("title", label);
          await expect(action.locator("svg")).toBeVisible();
          const rect = await action.boundingBox();
          const undo = await page.locator(".action-bar").getByRole("button", { name: locale === "EN" ? "Undo" : "Deshacer", exact: true }).boundingBox();
          expect(rect.width).toBe(rect.height);
          expect(rect.height).toBe(undo.height);
        }
        for (let state = 0; state < (size.width > 680 ? 2 : 1); state++) {
          const title = await page.locator(".document-bar").boundingBox();
          const bottom = await page.locator(".canvas-bottom").boundingBox();
          const tools = await page.locator(".toolbar").boundingBox();
          const canvas = await page.locator(".canvas-area").boundingBox();
          expect(bottom.x).toBe(0);
          expect(title.x).toBeCloseTo(canvas.x, 0);
          expect(title.width).toBeCloseTo(canvas.width, 0);
          expect(canvas.y).toBeCloseTo(title.y + title.height, 0);
          expect(canvas.y + canvas.height).toBeCloseTo(bottom.y, 0);
          if (size.width > 680) {
            const panel = await page.locator(".panel").boundingBox();
            const actions = await page.locator(".action-bar").boundingBox();
            expect(title.x).toBeCloseTo(tools.x + tools.width, 0);
            expect(title.x + title.width).toBeCloseTo(panel.x, 0);
            expect(bottom.width).toBeCloseTo(panel.x, 0);
            expect(tools.y).toBeCloseTo(actions.y + actions.height, 0);
            expect(title.y).toBeCloseTo(tools.y, 0);
            expect(tools.y + tools.height).toBeCloseTo(bottom.y, 0);
            await page.locator(".panel-heading button").click();
          } else {
            expect(title.x).toBe(0);
            expect(bottom.width).toBe(size.width);
            const actions = await page.locator(".action-bar").boundingBox();
            expect(tools.y).toBeCloseTo(actions.y + actions.height, 0);
            expect(title.y).toBeCloseTo(tools.y + tools.height, 0);
          }
        }
      }
    }
  }
});

test("editable zoom confirms, cancels, validates and synchronizes with view controls", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("textbox", { name: "Zoom (%)", exact: true });
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue("—");
  await openImage(page);
  await expect(input).toHaveValue("100");
  await input.focus();
  expect(await input.evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([0, 3]);
  const sideAlpha = () => page.getByTestId("editor-canvas").evaluate(c => c.getContext("2d").getImageData(Math.floor(c.width / 2 + 120 * c.width / c.getBoundingClientRect().width), Math.floor(c.height / 2), 1, 1).data[3]);
  await input.fill("200");
  expect(await sideAlpha()).toBe(0);
  await input.press("Enter");
  await expect.poll(sideAlpha).toBe(255);
  await input.fill("62,5");
  await input.blur();
  await expect(input).toHaveValue("62.5");
  await input.fill("400");
  await input.press("Escape");
  await expect(input).toHaveValue("62.5");
  for (const invalid of ["", "abc", "12foo", "Infinity"]) {
    await input.fill(invalid);
    await input.press("Enter");
    await expect(input).toHaveValue("62.5");
  }
  for (const [entered, expected] of [["-10", "5"], ["0", "5"], ["900", "800"], ["33.333", "33.3"]]) {
    await input.fill(entered);
    await input.press("Enter");
    await expect(input).toHaveValue(expected);
  }
  await input.fill("200");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(input).toHaveValue("240");
  await input.fill("30");
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(input).toHaveValue("25");
  await input.fill("400");
  await page.getByRole("button", { name: "Fit to view", exact: true }).click();
  await expect(input).toHaveValue("100");
  await input.fill("200");
  await page.getByTestId("editor-canvas").hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -80);
  await page.keyboard.up("Control");
  await expect(input).toHaveValue("298.4");
  await page.getByRole("button", { name: "Fit to view", exact: true }).click();
  await draw(page);
  await input.fill("100");
  await input.press("r");
  await input.press("Control+z");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await input.press("Escape");
});

test("file and rectangle icons stay distinct and zoom labels stay accessible", async ({ page }) => {
  await openImage(page);
  await draw(page);
  await expect(page.locator(".open-action svg.lucide-folder-open")).toBeVisible();
  await expect(page.locator(".tool-rect svg.lucide-square-dashed")).toBeVisible();
  await expect(page.locator(".region-icon svg.lucide-square")).toBeVisible();
  await expect(page.locator(".document-bar > svg.lucide-image")).toHaveAttribute("width", "16");
  for (const locale of ["EN", "ES"]) {
    await page.getByRole("link", { name: locale, exact: true }).click();
    const fit = page.getByRole("button", { name: locale === "EN" ? "Fit to view" : "Ajustar a la ventana", exact: true });
    await expect(fit).toHaveText("");
    await expect(fit).toHaveAttribute("title", locale === "EN" ? "Fit to view" : "Ajustar a la ventana");
    await expect(fit.locator("svg.lucide-maximize")).toBeVisible();
    await expect(page.locator(".zoom-actual")).toHaveCount(0);
    await expect(page.locator(".canvas-bottom")).toHaveCSS("font-size", "11px");
    await expect(page.locator(".zoom-input")).toHaveCSS("font-size", "11px");
    await expect(page.locator(".site-footer")).toHaveCSS("font-size", "13px");
  }
});


async function pasteFixture(page, { name = "pasted.png", type = "image/png", bytes = [...fixture()], text = "", target = "body" } = {}) {
  return page.evaluate(({ name, type, bytes, text, target }) => {
    const data = new DataTransfer();
    if (text) data.items.add(text, "text/plain");
    if (bytes) data.items.add(new File([new Uint8Array(bytes)], name, { type }));
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    document.querySelector(target).dispatchEvent(event);
    return event.defaultPrevented;
  }, { name, type, bytes, text, target });
}

async function mockClipboard(page, mode = "image") {
  await page.evaluate(({ bytes, mode }) => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : {
      read: () => {
        window.clipboardReads = (window.clipboardReads || 0) + 1;
        if (mode === "denied") return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
        const items = mode === "empty" ? [] : mode === "text" ? [{ types: ["text/plain"] }] : [{
          types: ["text/plain", "image/png"],
          getType: async () => new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        }];
        if (mode === "delayed") return new Promise(resolve => { window.finishClipboardRead = () => resolve(items); });
        return Promise.resolve(items);
      },
    } });
  }, { bytes: [...fixture()], mode });
}

test("native paste opens the first supported image in mixed content and exports its pixels", async ({ page }) => {
  await page.goto("/");
  expect(await pasteFixture(page, { text: "Copied image", name: "" })).toBe(true);
  await expect(page.locator(".image-name")).toHaveText("clipboard.png");
  await expect(page.locator(".image-dimensions")).toHaveText("160 × 100 px");
  expect(PNG.sync.read((await download(page)).bytes).data).toEqual(PNG.sync.read(fixture()).data);
  await draw(page);
});

test("clipboard button reads on demand and resets history only after accepting pending edits", async ({ page }) => {
  await openImage(page);
  await draw(page);
  await mockClipboard(page);
  expect(await page.evaluate(() => window.clipboardReads || 0)).toBe(0);
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".paste-action").click();
  await expect(page.locator(".paste-action")).toBeEnabled();
  await expect(page.locator(".image-name")).toHaveText("test.png");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".paste-action").click();
  await expect(page.locator(".image-name")).toHaveText("clipboard.png");
  await expect(page.locator(".region-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.clipboardReads)).toBe(2);
});

test("paste skips confirmation for untouched and downloaded images", async ({ page }) => {
  await openImage(page);
  let dialogs = 0;
  page.on("dialog", async dialog => { dialogs++; await dialog.dismiss(); });
  await pasteFixture(page);
  await expect(page.locator(".image-name")).toHaveText("pasted.png");
  await draw(page);
  await download(page);
  await pasteFixture(page, { name: "after-export.png" });
  await expect(page.locator(".image-name")).toHaveText("after-export.png");
  expect(dialogs).toBe(0);
});

for (const mode of ["empty", "text", "denied", "missing"]) {
  test(`clipboard ${mode} preserves the document and provides localized feedback`, async ({ page }) => {
    await openImage(page);
    await draw(page);
    await page.getByRole("link", { name: "ES", exact: true }).click();
    await mockClipboard(page, mode);
    await page.locator(".paste-action").click();
    await expect(page.getByRole("alert")).toContainText(mode === "empty" || mode === "text" ? "no contiene una imagen" : "Ctrl/⌘+V");
    await expect(page.locator(".image-name")).toHaveText("test.png");
    await expect(page.locator(".region-row")).toHaveCount(1);
    await expect(page.locator(".paste-action")).toBeEnabled();
  });
}

test("invalid clipboard images preserve edits, while plain text is left alone", async ({ page }) => {
  await openImage(page);
  await draw(page);
  expect(await pasteFixture(page, { bytes: null, text: "hello" })).toBe(false);
  expect(await pasteFixture(page, { type: "image/gif" })).toBe(true);
  await expect(page.getByRole("alert")).toContainText("PNG, JPEG or WebP");
  page.once("dialog", dialog => dialog.accept());
  await pasteFixture(page, { bytes: [1, 2, 3] });
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(page.locator(".image-name")).toHaveText("test.png");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
});

test("oversized pasted images are rejected before replacing the document", async ({ page }) => {
  await openImage(page);
  await page.evaluate(() => {
    Object.defineProperty(HTMLImageElement.prototype, "width", { configurable: true, get: () => 8001 });
    Object.defineProperty(HTMLImageElement.prototype, "height", { configurable: true, get: () => 4000 });
  });
  await pasteFixture(page);
  await expect(page.getByRole("alert")).toContainText("32 megapixels");
  await expect(page.locator(".image-name")).toHaveText("test.png");
});

test("paste respects editable fields and export and settings dialogs", async ({ page }) => {
  await openImage(page);
  for (const target of [".zoom-input", "#block"]) {
    expect(await pasteFixture(page, { target })).toBe(false);
  }
  await page.evaluate(() => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.id = "paste-editable";
    document.body.appendChild(editable);
  });
  expect(await pasteFixture(page, { target: "#paste-editable" })).toBe(false);
  await imageAction(page, "Export");
  expect(await pasteFixture(page)).toBe(false);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Settings and regions", exact: true }).click();
  expect(await pasteFixture(page)).toBe(false);
  await expect(page.locator(".image-name")).toHaveText("test.png");
});

test("pending clipboard reads cannot overwrite a newer file or import a second paste", async ({ page }) => {
  await openImage(page);
  await mockClipboard(page, "delayed");
  await page.locator(".paste-action").click();
  await expect(page.locator(".paste-action")).toBeDisabled();
  expect(await pasteFixture(page)).toBe(false);
  await page.getByTestId("file-input").setInputFiles({ name: "newer.png", mimeType: "image/png", buffer: fixture() });
  await expect(page.locator(".image-name")).toHaveText("newer.png");
  await page.evaluate(() => window.finishClipboardRead());
  await expect(page.locator(".paste-action")).toBeEnabled();
  await expect(page.locator(".image-name")).toHaveText("newer.png");
});


test("mobile status bar, footer, tools and floating zoom fit both languages and themes", async ({ page }) => {
  await openImage(page);
  for (const locale of ["EN", "ES"]) {
    await page.getByRole("link", { name: locale, exact: true }).click();
    for (const width of [320, 375, 680]) {
      await page.setViewportSize({ width, height: 812 });
      for (let theme = 0; theme < 2; theme++) {
        await page.locator(".header-actions .icon-button").click();
        await expect(page.locator(".privacy-notice")).toBeVisible();
        await expect(page.locator(".status-privacy svg")).toBeVisible();
        await expect(page.locator(".status-privacy strong")).toBeVisible();
        await expect(page.locator(".status-privacy p")).toBeHidden();
        await expect(page.locator(".zoom-input")).toHaveCount(0);
        const footer = await page.locator(".site-footer").boundingBox();
        const copyright = await page.locator(".copyright").boundingBox();
        const privacy = await page.locator(".privacy-notice").boundingBox();
        const statusBar = await page.locator(".canvas-bottom").boundingBox();
        const dimensions = await page.locator(".image-dimensions").boundingBox();
        expect(statusBar.x + statusBar.width - privacy.x - privacy.width).toBeCloseTo(8, 0);
        expect(privacy.x).toBeGreaterThanOrEqual(dimensions.x + dimensions.width);
        expect(privacy.y).toBeGreaterThanOrEqual(statusBar.y);
        expect(privacy.y + privacy.height).toBeLessThanOrEqual(statusBar.y + statusBar.height);
        await expect(page.locator(".site-footer .status-privacy")).toHaveCount(0);
        await expect(page.locator(".copyright")).toHaveText("@pixban 2026 by Juana y Lola");
        expect(copyright.x + copyright.width / 2).toBeCloseTo(width / 2, 0);
        expect(copyright.y).toBeGreaterThanOrEqual(footer.y);
        expect(copyright.y + copyright.height).toBeLessThanOrEqual(footer.y + footer.height);
        const tools = await page.locator(".toolbar").boundingBox();
        const first = await page.locator(".tool-select").boundingBox();
        const settings = await page.locator(".settings-action").boundingBox();
        expect(first.x - tools.x).toBe(8);
        expect(tools.x + tools.width - settings.x - settings.width).toBe(8);
        expect(settings.width).toBe(44);
        const canvas = await page.locator(".canvas-area").boundingBox();
        const zoom = page.locator(".mobile-zoom-controls");
        const box = await zoom.boundingBox();
        expect(box.y - canvas.y).toBe(8);
        expect(canvas.x + canvas.width - box.x - box.width).toBe(8);
        await expect(zoom.getByRole("button")).toHaveCount(3);
        for (const button of await zoom.getByRole("button").all()) {
          const rect = await button.boundingBox();
          expect(rect.width).toBe(44);
          expect(rect.height).toBe(44);
          await expect(button).toHaveAttribute("title", await button.getAttribute("aria-label"));
        }
        await expect(zoom.locator("svg.lucide-zoom-out")).toBeVisible();
        await expect(zoom.locator("svg.lucide-zoom-in")).toBeVisible();
        await expect(zoom.locator("svg.lucide-maximize")).toBeVisible();
        expect((await page.locator(".canvas-bottom").boundingBox()).height).toBe(32);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
      }
    }
  }
});

test("mobile zoom changes scale without editing and survives viewport and settings changes", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openImage(page);
  await draw(page);
  const canvas = page.getByTestId("editor-canvas");
  const outsideImageAlpha = () => canvas.evaluate(c => c.getContext("2d").getImageData(Math.floor(c.width / 2 + 90 * c.width / c.getBoundingClientRect().width), Math.floor(c.height / 2), 1, 1).data[3]);
  await expect.poll(outsideImageAlpha).toBe(0);
  const zoom = page.locator(".mobile-zoom-controls");
  const position = await zoom.boundingBox();
  await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect.poll(outsideImageAlpha).toBe(255);
  expect(await zoom.boundingBox()).toEqual(position);
  await zoom.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect.poll(outsideImageAlpha).toBe(0);
  await zoom.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.locator(".settings-action").click();
  await page.getByRole("button", { name: "Close settings", exact: true }).click();
  await expect(page.locator(".settings-action")).toBeFocused();
  await page.setViewportSize({ width: 681, height: 900 });
  await expect(page.locator(".mobile-zoom-controls")).toHaveCount(0);
  await expect(page.locator(".zoom-input")).toHaveValue("120");
  await expect(page.locator(".privacy-notice")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await zoom.getByRole("button", { name: "Fit to view", exact: true }).click();
  await expect.poll(outsideImageAlpha).toBe(0);
  await page.locator(".tool-pan").focus();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.locator(".settings-action")).toBeFocused();
  await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
  await expect(page.getByRole("button", { name: "Close image", exact: true })).toBeFocused();
  await page.locator(".settings-action").click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
});

test("mobile empty state has no floating zoom and closing an image removes it", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(page.locator(".mobile-zoom-controls, .zoom-input")).toHaveCount(0);
  await expect(page.locator(".tool-rect")).toBeVisible();
  await openImage(page);
  await expect(page.locator(".mobile-zoom-controls")).toBeVisible();
  await imageAction(page, "Close");
  await expect(page.locator(".mobile-zoom-controls, .zoom-input")).toHaveCount(0);
  await expect(page.locator(".empty-state")).toBeVisible();
});

async function mockClipboardWrite(page, mode = "success") {
  await page.evaluate(mode => {
    window.clipboardWrites = 0;
    if (mode === "missing-item") {
      Object.defineProperty(window, "ClipboardItem", { configurable: true, value: undefined });
      return;
    }
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : {
      write: async items => {
        window.clipboardWrites++;
        window.writeWasActivated = navigator.userActivation.isActive;
        if (mode === "denied") throw new DOMException("Denied", "NotAllowedError");
        const blob = await items[0].getType("image/png");
        window.copiedImage = { type: blob.type, bytes: [...new Uint8Array(await blob.arrayBuffer())] };
        if (mode === "pending") await new Promise(resolve => { window.finishClipboardWrite = resolve; });
      },
    } });
  }, mode);
}

for (const format of ["png", "jpeg", "webp"]) {
  test(`source ${format} preselects the file format and downloads correctly`, async ({ page }) => {
    await openImage(page);
    let buffer = fixture();
    if (format === "webp") buffer = readFileSync(new URL("../../src/assets/sample-car.webp", import.meta.url));
    if (format === "jpeg") buffer = Buffer.from(await page.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 160; c.height = 100;
      const blob = await new Promise(resolve => c.toBlob(resolve, "image/jpeg"));
      return [...new Uint8Array(await blob.arrayBuffer())];
    }));
    await page.getByTestId("file-input").setInputFiles({ name: "source.wrong", mimeType: `image/${format}`, buffer });
    await imageAction(page, "Export");
    await expect(page.locator("#export-format")).toHaveValue(format);
    await expect(page.locator("#export-destination")).toHaveCount(0);
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download image", exact: true }).click();
    const result = await wait;
    const chunks = []; for await (const chunk of await result.createReadStream()) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    if (result.suggestedFilename().endsWith(".png")) {
      const png = PNG.sync.read(bytes);
      expect(png.width).toBeGreaterThan(0);
      if (format !== "png") await expect(page.locator(".toast[role=status]")).toContainText("Downloaded as PNG");
    } else if (format === "jpeg") {
      expect(result.suggestedFilename()).toBe("source-pixelated.jpg");
      expect([...bytes.subarray(0, 2)]).toEqual([255, 216]);
    } else {
      expect(result.suggestedFilename()).toBe("source-pixelated.webp");
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
    }
  });
}

test("PNG fallback uses the real extension and shows a notice", async ({ page }) => {
  await openImage(page);
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback) { return native.call(this, callback, "image/png"); };
  });
  const result = await download(page, "webp");
  expect(result.filename).toBe("test-pixelated.png");
  expect(PNG.sync.read(result.bytes).width).toBe(160);
  await expect(page.locator(".toast[role=status]")).toContainText("Downloaded as PNG");
});

test("clipboard copies edited PNG pixels and marks only successful copies as exported", async ({ page }) => {
  await openImage(page);
  await draw(page);
  const expected = PNG.sync.read((await download(page)).bytes);
  await mockClipboardWrite(page);
  let downloads = 0; page.on("download", () => downloads++);
  await page.evaluate(() => {
    window.openedDialogs = 0;
    const native = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function() { window.openedDialogs++; return native.call(this); };
  });
  await imageAction(page, "Copy to clipboard");
  await expect(page.locator(".toast[role=status]")).toHaveText(/Image copied to clipboard/);
  const copied = await page.evaluate(() => window.copiedImage);
  expect(copied.type).toBe("image/png");
  expect(PNG.sync.read(Buffer.from(copied.bytes)).data).toEqual(expected.data);
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => window.openedDialogs)).toBe(0);
  expect(await page.evaluate(() => window.writeWasActivated)).toBe(true);
  let confirmations = 0;
  page.on("dialog", async d => { confirmations++; await d.dismiss(); });
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await imageAction(page, "Copy to clipboard");
  await expect(page.locator(".toast[role=status]")).toHaveText(/Image copied/);
  await imageAction(page, "Close");
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  expect(confirmations).toBe(0);
  await openImage(page); await draw(page);
  await imageAction(page, "Close");
  expect(confirmations).toBe(1);
});

for (const mode of ["denied", "missing", "missing-item", "encode-error"]) {
  test(`clipboard ${mode} preserves edits and allows file download`, async ({ page }) => {
    await openImage(page); await draw(page);
    await mockClipboardWrite(page, mode);
    if (mode === "encode-error") await page.evaluate(() => {
      window.nativeToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = callback => callback(null);
    });
    await imageAction(page, "Copy to clipboard");
    await expect(page.getByRole("alert")).toContainText(mode.startsWith("missing") ? "unavailable" : "Could not copy");
    await expect(page.getByRole("button", { name: "Copy to clipboard", exact: true })).toBeEnabled();
    await expect(page.locator(".region-row")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    let confirmation = false;
    page.once("dialog", async d => { confirmation = true; await d.dismiss(); });
    await imageAction(page, "Close");
    expect(confirmation).toBe(true);
    await imageAction(page, "Export");
    if (mode === "encode-error") await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.nativeToBlob; });
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download image", exact: true }).click();
    expect((await wait).suggestedFilename()).toBe("test-pixelated.png");
  });
}

test("pending direct copy blocks duplicate copies and file export without opening a dialog", async ({ page }) => {
  await openImage(page); await mockClipboardWrite(page, "pending");
  await imageAction(page, "Copy to clipboard");
  await expect.poll(() => page.evaluate(() => typeof window.finishClipboardWrite)).toBe("function");
  await expect(page.locator(".copy-action")).toBeDisabled();
  await expect(page.locator(".action-bar .primary")).toBeDisabled();
  await expect(page.locator(".busy-overlay")).toHaveText(/Copying image/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".copy-action").dispatchEvent("click");
  await page.evaluate(() => window.finishClipboardWrite());
  await expect(page.locator(".toast[role=status]")).toHaveText(/Image copied/);
  expect(await page.evaluate(() => window.clipboardWrites)).toBe(1);
});

for (const lang of ["en", "es"]) {
  test(`direct copy fits mobile and preserves file format in ${lang}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/");
    await expect(page.locator(".copy-action")).toBeDisabled();
    await openImage(page);
    if (lang === "es") await page.getByRole("link", { name: "ES", exact: true }).click();
    const exportLabel = lang === "es" ? "Exportar" : "Export";
    const copyLabel = lang === "es" ? "Copiar al portapapeles" : "Copy to clipboard";
    const cancel = lang === "es" ? "Cancelar" : "Cancel";
    await expect(page.locator(".copy-action")).toHaveAttribute("title", copyLabel);
    for (const button of await page.locator(".action-bar > button").all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
    await imageAction(page, exportLabel);
    await expect(page.locator("#export-destination")).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("button", { name: copyLabel, exact: true })).toHaveCount(0);
    await page.locator("#export-format").selectOption("webp");
    const box = await page.getByRole("dialog").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
    await page.getByRole("button", { name: cancel, exact: true }).click();
    for (const mode of ["success", "denied"]) {
      await mockClipboardWrite(page, mode);
      await imageAction(page, copyLabel);
      await expect(page.locator(".toast")).toContainText(mode === "success" ? (lang === "es" ? "Imagen copiada" : "Image copied") : (lang === "es" ? "No se pudo copiar" : "Could not copy"));
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await imageAction(page, exportLabel);
      await expect(page.locator("#export-format")).toHaveValue("webp");
      await page.getByRole("button", { name: cancel, exact: true }).click();
    }
    await page.getByTestId("file-input").setInputFiles({ name: "new.png", mimeType: "image/png", buffer: fixture() });
    await imageAction(page, exportLabel);
    await expect(page.locator("#export-format")).toHaveValue("png");
  });
}

test("transparent exports preserve alpha in PNG and clipboard, and JPEG uses white", async ({ page }) => {
  await openImage(page);
  const transparent = new PNG({ width: 160, height: 100 });
  transparent.data.fill(0);
  await page.getByTestId("file-input").setInputFiles({ name: "alpha.png", mimeType: "image/png", buffer: PNG.sync.write(transparent) });
  const png = await download(page);
  expect(PNG.sync.read(png.bytes).data[3]).toBe(0);
  await mockClipboardWrite(page);
  await imageAction(page, "Copy to clipboard");
  await expect(page.locator(".toast")).toContainText("Image copied");
  const copied = await page.evaluate(() => window.copiedImage.bytes);
  expect(PNG.sync.read(Buffer.from(copied)).data[3]).toBe(0);
  await imageAction(page, "Export");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const jpeg = await download(page, "jpeg");
  const pixel = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    const c = document.createElement("canvas"); c.width = bitmap.width; c.height = bitmap.height;
    c.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
    return [...c.getContext("2d").getImageData(0, 0, 1, 1).data];
  }, [...jpeg.bytes]);
  expect(pixel).toEqual([255, 255, 255, 255]);
});

test("failed and cancelled imports preserve export choices", async ({ page }) => {
  await openImage(page); await draw(page);
  await imageAction(page, "Export");
  await page.locator("#export-format").selectOption("webp");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  page.once("dialog", d => d.dismiss());
  await page.getByTestId("file-input").setInputFiles({ name: "cancelled.png", mimeType: "image/png", buffer: fixture() });
  page.once("dialog", d => d.accept());
  await page.getByTestId("file-input").setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
  await expect(page.getByRole("alert")).toContainText("could not be opened");
  await expect(page.locator(".image-name")).toHaveText("test.png");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await imageAction(page, "Export");
  await expect(page.locator("#export-format")).toHaveValue("webp");
});
