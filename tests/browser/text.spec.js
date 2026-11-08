import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

async function open(page, transparent = false) {
  await page.goto("/");
  const png = new PNG({ width: 480, height: 320 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([255, 255, 255, transparent ? 0 : 255], i);
  await page.getByTestId("file-input").setInputFiles({ name: "text.png", mimeType: "image/png", buffer: PNG.sync.write(png) });
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const viewport = element.parentElement.getBoundingClientRect();
    return Math.abs(rect.width - viewport.width) < 1 && Math.abs(rect.height - viewport.height) < 1;
  })).toBe(true);
  if (await page.locator(".zoom-input").count()) {
    await page.locator(".zoom-input").fill("100");
    await page.locator(".zoom-input").press("Enter");
  }
}
async function point(page, x = 40, y = 40) {
  const box = await page.getByTestId("editor-canvas").boundingBox();
  const zoom = await page.locator(".zoom-input").count() ? Number(await page.locator(".zoom-input").inputValue()) / 100 : Math.max(.05, Math.min((box.width - 80) / 480, (box.height - 80) / 320, 1));
  return { x: box.x + box.width / 2 + (x - 240) * zoom, y: box.y + box.height / 2 + (y - 160) * zoom };
}
async function add(page, text = "Hello\nWorld") {
  await page.locator(".tool-text").click();
  const p = await point(page);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("text-editor")).toBeFocused();
  await page.getByTestId("text-editor").fill(text);
}
async function save(page) { await page.getByTestId("text-editor").press("Control+Enter"); }
async function clickText(page, x = 50, y = 50) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("text-editor")).toBeFocused();
}
async function setFontSize(page, value) {
  const slider = page.locator("#text-size");
  await slider.focus();
  await slider.fill(String(value));
  await slider.blur();
}
async function expectAlignedTextSettings(page) {
  const sizeLabel = await page.locator('label[for="text-size"]').boundingBox();
  const colorLabel = await page.locator('label[for="text-color"]').boundingBox();
  const size = await page.locator('output[for="text-size"]').boundingBox();
  const slider = await page.locator("#text-size").boundingBox();
  const color = await page.locator("#text-color").boundingBox();
  expect(sizeLabel.x).toBe(colorLabel.x);
  expect(size.x + size.width).toBe(color.x + color.width);
  expect(slider.x).toBe(sizeLabel.x);
  expect(slider.x + slider.width).toBe(color.x + color.width);
  expect(slider.y).toBeGreaterThan(size.y + size.height);
  expect(slider.y).toBeLessThan(color.y);
  expect(color.width).toBe(44);
  expect(color.height).toBe(26);
  for (const [label, input] of [[sizeLabel, size], [colorLabel, color]]) {
    expect(label.x + label.width).toBeLessThan(input.x);
    expect(label.y + label.height / 2).toBeCloseTo(input.y + input.height / 2, 0);
  }
}
async function download(page, format = "png") {
  await page.locator(".action-bar .primary").click();
  await page.locator("#export-format").selectOption(format);
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download image", exact: true }).click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("typing sessions save once, cancel, delete and respect native text keys", async ({ page }) => {
  await open(page);
  await page.keyboard.press("t");
  await expect(page.locator(".tool-text")).toBeFocused();
  const p = await point(page); await page.mouse.click(p.x, p.y);
  const field = page.getByTestId("text-editor");
  await field.pressSequentially("vrbth spaces");
  await field.press("Enter"); await field.pressSequentially("line two");
  await field.press("Backspace");
  await expect(field).toHaveValue("vrbth spaces\nline tw");
  await expect(page.locator(".tool-text")).toHaveAttribute("aria-pressed", "true");
  await field.evaluate(el => {
    el.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", isComposing: true, bubbles: true }));
  });
  await expect(field).toBeVisible();
  await field.evaluate(el => el.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await field.press("Meta+Enter");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.locator(".region-row").press("Enter");
  await expect(field).toBeFocused();
  await field.fill("cancel me"); await field.press("Escape");
  await expect(page.locator(".region-row")).toContainText("vrbth spaces line tw");
  await clickText(page);
  await field.fill(" \n "); await save(page);
  await expect(page.locator(".region-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Delete edit 1", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(0);
  await add(page, " "); await save(page);
  await expect(page.locator(".region-row")).toHaveCount(0);
});

test("click-away export and clipboard include latest text above later pixelation", async ({ page }) => {
  await open(page);
  await add(page);
  const first = PNG.sync.read(await download(page));
  expect([first.width, first.height]).toEqual([480, 320]);
  expect(first.data.some((v, i) => i % 4 !== 3 && v < 100)).toBe(true);
  await page.locator(".tool-rect").click();
  const a = await point(page, 10, 10), b = await point(page, 300, 200);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  expect(PNG.sync.read(await download(page)).data).toEqual(first.data);
  // Selection follows visual stacking, rather than array order.
  await page.locator(".tool-select").click();
  await clickText(page);
  await expect(page.getByTestId("text-editor")).toHaveValue("Hello\nWorld");
  await page.getByTestId("text-editor").fill("Latest");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    write: async items => { const blob = await items[0].getType("image/png"); window.textCopy = [...new Uint8Array(await blob.arrayBuffer())]; },
  } }));
  await page.locator(".copy-action").click();
  await expect.poll(() => page.evaluate(() => Boolean(window.textCopy))).toBe(true);
  const copied = Buffer.from(await page.evaluate(() => window.textCopy));
  expect(PNG.sync.read(copied).data).toEqual(PNG.sync.read(await download(page)).data);
  expect(PNG.sync.read(copied).data).not.toEqual(first.data);
});

test("styles, move, zoom and pan preserve text and session defaults", async ({ page }) => {
  await open(page);
  const firstSetting = page.locator(".settings-row").first();
  const pixelSettingsTop = (await firstSetting.boundingBox()).y;
  await add(page, "Move me"); await save(page);
  await setFontSize(page, 48);
  await page.locator("#text-color").fill("#ff0000");
  await page.locator(".tool-select").click();
  const a = await point(page, 50, 50), b = await point(page, 110, 90);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); await page.mouse.up();
  await expect(page.getByTestId("text-editor")).toHaveCount(0);
  await clickText(page, 110, 90);
  const field = page.getByTestId("text-editor");
  await expect(field).toHaveCSS("font-size", "48px");
  await expect(field).toHaveCSS("color", "rgb(255, 0, 0)");
  let box = await field.boundingBox(); expect(box.x).toBeCloseTo((await point(page, 100, 80)).x, 0);
  await save(page);
  await page.locator(".zoom-input").fill("200"); await page.locator(".zoom-input").press("Enter");
  await clickText(page, 110, 90);
  await expect(field).toHaveCSS("font-size", "96px"); await save(page);
  await page.locator(".tool-pan").click();
  const center = await point(page, 240, 160);
  await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 30, center.y + 20); await page.mouse.up();
  await page.locator(".region-row").click();
  expect(await page.locator(".settings input").evaluateAll(inputs => inputs.map(input => input.id))).toEqual(["text-size", "text-color"]);
  await expect(field).toHaveCount(0);
  const moved = await point(page, 110, 90);
  await page.mouse.click(moved.x + 30, moved.y + 20);
  await expect(field).toBeFocused();
  box = await field.boundingBox(); expect(box.x).toBeCloseTo((await point(page, 100, 80)).x + 30, 0);
  await save(page);
  await page.locator(".tool-text").click();
  await expect(page.locator("#text-size")).toHaveValue("48");
  await expect(page.locator("#text-color")).toHaveValue("#ff0000");
  expect((await firstSetting.boundingBox()).y).toBeCloseTo(pixelSettingsTop, 0);
  await expectAlignedTextSettings(page);
});

test("font size previews while dragging and records one history change", async ({ page }) => {
  await open(page); await add(page, "Resize"); await save(page);
  const slider = page.getByRole("slider", { name: "Font size", exact: true });
  const value = page.locator('output[for="text-size"]');
  await expect(slider).toHaveAttribute("min", "8");
  await expect(slider).toHaveAttribute("max", "256");
  await expect(slider).toHaveAttribute("step", "1");
  await expect(value).toHaveText("32 px");
  const { x, y, width, height } = await slider.boundingBox();
  const trackY = y + height / 2;
  await page.mouse.move(x + width * 0.4, trackY);
  const snapshot = () => page.getByTestId("editor-canvas").evaluate(canvas => canvas.toDataURL());
  const before = await snapshot();
  await page.mouse.down();
  await page.mouse.move(x + width * 0.65, trackY, { steps: 5 });
  const resized = await slider.inputValue();
  expect(Number(resized)).toBeGreaterThan(32);
  await expect(value).toHaveText(`${resized} px`);
  await expect.poll(snapshot).not.toBe(before);
  await page.mouse.up();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(slider).toHaveValue("32");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(slider).toHaveValue(resized);
  await slider.press("Home");
  await expect(value).toHaveText("8 px");
  await slider.press("End");
  await expect(value).toHaveText("256 px");
});

test("text preserves alpha, clips overflow and JPEG fills transparency white", async ({ page }) => {
  await open(page, true); await add(page, "Text"); await save(page);
  const png = PNG.sync.read(await download(page));
  expect(png.data[3]).toBe(0);
  expect(png.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  const jpeg = await download(page, "jpeg");
  const background = await page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
    const c = document.createElement("canvas"); c.width = 480; c.height = 320;
    const ctx = c.getContext("2d"); ctx.drawImage(bitmap, 0, 0); return [...ctx.getImageData(0, 0, 1, 1).data];
  }, [...jpeg]);
  expect(background).toEqual([255, 255, 255, 255]);
  await clickText(page);
  await page.getByTestId("text-editor").fill("Very long text ".repeat(8));
  await save(page); expect(PNG.sync.read(await download(page)).width).toBe(480);
});

test.describe("mobile text settings", () => {
  test.use({ hasTouch: true });
  for (const theme of ["light", "dark"]) test(`text controls fit mobile in both languages, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width: 320, height: 812 }); await open(page);
    await add(page, "Mobile"); await save(page);
    for (const locale of ["EN", "ES"]) {
      await page.getByRole("link", { name: locale, exact: true }).click();
      const text = page.locator(".tool-text");
      await expect(text).toHaveAttribute("aria-label", locale === "EN" ? "Text" : "Texto");
      for (const button of await page.locator(".toolbar button").all()) {
        const box = await button.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
      }
      const close = page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true });
      await page.locator(".settings-action").click();
      const slider = page.getByRole("slider", { name: locale === "EN" ? "Font size" : "Tamaño de letra", exact: true });
      await expect(slider).toHaveValue("32");
      await expectAlignedTextSettings(page);
      await setFontSize(page, 40);
      await close.click();
      await page.locator(".edits-action").tap();
      const row = await page.locator(".text-row").boundingBox();
      expect(row.width).toBeGreaterThan(250);
      await expect(page.getByRole("button", { name: /^(Edit text|Editar texto)$/ })).toHaveCount(0);
      await page.locator(".region-row").press("Enter");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByTestId("text-editor")).toBeFocused();
      await save(page);
      for (const tool of ["text", "select"]) {
        await page.locator(`.tool-${tool}`).tap();
        const p = await point(page, 50, 50);
        await page.touchscreen.tap(p.x, p.y);
        await expect(page.getByTestId("text-editor")).toBeFocused();
        await expect(page.getByTestId("text-editor")).toHaveValue("Mobile");
        await save(page);
      }
      await page.locator(".header-actions .icon-button").click();
      await page.locator(".settings-action").click(); await setFontSize(page, 32);
      await close.click();
    }
    await expect(page.locator(".app-version")).toHaveText(`v${version}`);
    expect(await (await page.request.get("/version.json")).json()).toEqual({ version });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("pending text prompts before closing, paste stays in text and close resets defaults", async ({ page }) => {
  await open(page); await add(page, "Pending");
  await page.getByTestId("text-editor").evaluate(el => {
    const clipboardData = new DataTransfer(); clipboardData.setData("text/plain", "pasted");
    const event = new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true });
    el.dispatchEvent(event); window.textPastePrevented = event.defaultPrevented;
  });
  expect(await page.evaluate(() => window.textPastePrevented)).toBe(false);
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Close image", exact: true }).click();
  await expect(page.locator(".region-row")).toContainText("Pending");
  await setFontSize(page, 12);
  await expect(page.locator("#text-size")).toHaveValue("12");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Close image", exact: true }).click();
  await expect(page.getByTestId("editor-canvas")).toHaveCount(0);
  await expect(page.locator(".tool-text")).toBeDisabled();
  await open(page); await page.locator(".tool-text").click();
  await expect(page.locator("#text-size")).toHaveValue("32");
  await expect(page.locator("#text-color")).toHaveValue("#000000");
});
