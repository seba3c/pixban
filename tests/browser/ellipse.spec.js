import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
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


async function drag(page, x1, y1, x2, y2, shift = false) {
  const a = await point(page, x1, y1), b = await point(page, x2, y2);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
function pixel(png, x, y) { return [...png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]; }
function extent(png) {
  const xs = [], ys = [];
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++)
    if (png.data[(y * png.width + x) * 4 + 3]) { xs.push(x); ys.push(y); }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

test("outline preserves opaque and transparent interiors and clipboard matches download", async ({ page }) => {
  for (const transparent of [false, true]) {
    await open(page, transparent);
    await page.keyboard.press("e");
    await expect(page.locator(".tool-ellipse")).toBeFocused();
    await drag(page, 80, 60, 280, 180);
    const png = PNG.sync.read(await download(page));
    expect([png.width, png.height]).toEqual([480, 320]);
    expect(pixel(png, 180, 120)).toEqual([transparent ? 0 : 255, transparent ? 0 : 255, transparent ? 0 : 255, transparent ? 0 : 255]);
    expect(pixel(png, 180, 60)).toEqual([255, 0, 0, 255]);
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      write: async items => { window.ellipseCopy = [...new Uint8Array(await (await items[0].getType("image/png")).arrayBuffer())]; },
    } }));
    await page.locator(".copy-action").click();
    await expect.poll(() => page.evaluate(() => Boolean(window.ellipseCopy))).toBe(true);
    expect(PNG.sync.read(Buffer.from(await page.evaluate(() => window.ellipseCopy))).data).toEqual(png.data);
    if (transparent) {
      const jpeg = await download(page, "jpeg");
      const center = await page.evaluate(async bytes => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
        const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 320;
        const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
        return [...ctx.getImageData(180, 120, 1, 1).data];
      }, [...jpeg]);
      expect(center).toEqual([255, 255, 255, 255]);
    }
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Close image", exact: true }).click();
  }
});

test("reverse drags, interior movement, corner resizing and history", async ({ page }) => {
  await open(page, true); await page.locator(".tool-ellipse").click();
  await drag(page, 280, 180, 80, 60);
  expect(extent(PNG.sync.read(await download(page)))).toEqual([78, 58, 281, 181]);
  await page.locator(".tool-select").click();
  await drag(page, 180, 120, 200, 140);
  expect(extent(PNG.sync.read(await download(page)))).toEqual([98, 78, 301, 201]);
  await drag(page, 300, 200, 340, 240);
  expect(extent(PNG.sync.read(await download(page)))).toEqual([98, 78, 341, 241]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(extent(PNG.sync.read(await download(page)))).toEqual([98, 78, 301, 201]);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  expect(extent(PNG.sync.read(await download(page)))).toEqual([98, 78, 341, 241]);
});

test("circle constraint, image bounds, degenerate and cancelled gestures", async ({ page }) => {
  await open(page, true); await page.locator(".tool-ellipse").click();
  await drag(page, 100, 100, 160, 130, true);
  const circle = extent(PNG.sync.read(await download(page)));
  // Canvas engines can add one partially covered pixel around curved edges.
  for (const [i, expected] of [98, 98, 161, 161].entries()) expect(Math.abs(circle[i] - expected)).toBeLessThanOrEqual(1);
  expect(circle[2] - circle[0]).toBe(circle[3] - circle[1]);
  await drag(page, 460, 300, 510, 310, true);
  expect(pixel(PNG.sync.read(await download(page)), 470, 300)).toEqual([255, 0, 0, 255]);
  const p = await point(page, 10, 10); await page.mouse.click(p.x, p.y);
  await expect(page.locator(".region-row")).toHaveCount(2);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 30);
  await page.getByTestId("editor-canvas").dispatchEvent("pointercancel");
  await page.mouse.up();
  await expect(page.locator(".region-row")).toHaveCount(2);
});

test("stroke settings have 25px maximum, preview once and reset on close", async ({ page }) => {
  await open(page, true); await page.locator(".tool-ellipse").click();
  const width = page.getByRole("slider", { name: "Stroke width", exact: true });
  await expect(width).toHaveValue("4"); await expect(width).toHaveAttribute("min", "1");
  await expect(width).toHaveAttribute("max", "25");
  await drag(page, 80, 60, 280, 180);
  const before = await page.getByTestId("editor-canvas").evaluate(c => c.toDataURL());
  const track = await width.boundingBox();
  await page.mouse.move(track.x + track.width * .5, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * .8, track.y + track.height / 2, { steps: 5 });
  await expect.poll(() => page.getByTestId("editor-canvas").evaluate(c => c.toDataURL())).not.toBe(before);
  await page.mouse.up();
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(width).toHaveValue("4");
  await width.press("End"); await expect(width).toHaveValue("25");
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(width).toHaveValue("4");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(width).toHaveValue("25");
  await width.press("Home"); await expect(width).toHaveValue("1");
  await page.locator("#ellipse-color").fill("#0000ff");
  const png = PNG.sync.read(await download(page)); expect(pixel(png, 180, 60)[2]).toBe(255);
  await page.locator(".tool-text").click(); await expect(page.locator("#text-color")).toHaveValue("#000000");
  await page.locator(".tool-ellipse").click(); await expect(width).toHaveValue("1");
  await expect(page.locator("#ellipse-color")).toHaveValue("#0000ff");
  await page.getByRole("button", { name: "Close image", exact: true }).click();
  await open(page); await page.locator(".tool-ellipse").click();
  await expect(width).toHaveValue("4"); await expect(page.locator("#ellipse-color")).toHaveValue("#ff0000");
});


test("annotation rendering and selection follow creation order above masks", async ({ page }) => {
  await open(page);
  await page.locator(".tool-text").click();
  const p = await point(page, 140, 40); await page.mouse.click(p.x, p.y);
  await page.getByTestId("text-editor").fill("█");
  await page.getByTestId("text-editor").press("Control+Enter");
  const textOnly = PNG.sync.read(await download(page));
  expect(pixel(textOnly, 150, 60)).toEqual([0, 0, 0, 255]);
  await page.locator(".tool-ellipse").click(); await drag(page, 80, 60, 220, 180);
  await page.locator(".tool-rect").click(); await drag(page, 10, 10, 300, 250);
  expect(pixel(PNG.sync.read(await download(page)), 150, 60)).toEqual([255, 0, 0, 255]);
  await page.locator(".tool-select").click(); const hit = await point(page, 150, 60);
  await page.mouse.click(hit.x, hit.y);
  await expect(page.locator("#ellipse-width")).toBeVisible();
  await page.locator(".region-row").nth(0).click();
  await page.keyboard.press("Delete");
  await page.locator(".tool-text").click(); await page.mouse.click(p.x, p.y);
  await page.getByTestId("text-editor").fill("█"); await page.getByTestId("text-editor").press("Control+Enter");
  expect(pixel(PNG.sync.read(await download(page)), 150, 60)).toEqual([0, 0, 0, 255]);
});

for (const theme of ["light", "dark"]) test(`mobile ellipse settings and guide in both languages, ${theme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme });
  for (const width of [320, 375, 680]) {
    await page.setViewportSize({ width, height: 812 }); await open(page);
    await page.locator(".tool-ellipse").click();
    for (const locale of ["EN", "ES"]) {
      await page.getByRole("link", { name: locale, exact: true }).click();
      await expect(page.locator(".tool-ellipse")).toHaveAccessibleName(locale === "EN" ? "Ellipse" : "Elipse");
      await page.locator(".settings-action").click();
      await expect(page.getByRole("slider", { name: locale === "EN" ? "Stroke width" : "Grosor del trazo", exact: true })).toHaveValue("4");
      const color = await page.locator("#ellipse-color").boundingBox();
      expect(color.x + color.width).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true }).click();
      await page.getByRole("button", { name: locale === "EN" ? "User guide" : "Guía de usuario", exact: true }).click();
      const guide = page.getByRole("dialog");
      await expect(guide).toContainText("1–25 px");
      await expect(guide.locator("li").filter({ has: page.getByText(locale === "EN" ? "Ellipse" : "Elipse", { exact: true }) }).locator("img")).toHaveCount(1);
      await page.keyboard.press("Escape");
    }
  }
});
