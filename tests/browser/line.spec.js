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



async function click(page, x, y) { const p = await point(page, x, y); await page.mouse.click(p.x, p.y); }
async function draw(page, x1 = 80, y1 = 80, x2 = 280, y2 = 180) {
  await page.locator(".tool-line").click(); await click(page, x1, y1); await click(page, x2, y2);
}
async function drag(page, x1, y1, x2, y2) {
  const a = await point(page, x1, y1), b = await point(page, x2, y2);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
}
function pixel(png, x, y) { return [...png.data.slice((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]; }

test("two clicks create exactly one line; preview is excluded from export and undo", async ({ page }) => {
  await open(page, true); await page.keyboard.press("l");
  await expect(page.locator(".tool-line")).toBeFocused();
  await click(page, 80, 80); const p = await point(page, 280, 180); await page.mouse.move(p.x, p.y);
  await expect(page.locator(".region-row")).toHaveCount(0);
  expect(PNG.sync.read(await download(page)).data.every(v => v === 0)).toBe(true);
  await click(page, 80, 80); await click(page, 280, 180);
  await expect(page.locator(".region-row")).toHaveCount(1);
  const png = PNG.sync.read(await download(page)); expect(pixel(png, 180, 130)).toEqual([255, 0, 0, 255]);
  expect(pixel(png, 180, 100)[3]).toBe(0);
  await click(page, 30, 30); await page.keyboard.press("Control+z");
  await expect(page.locator(".region-row")).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(page.locator(".region-row")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z"); await expect(page.locator(".region-row")).toHaveCount(1);
});

test("nine marker combinations render and selected lines move and change endpoints", async ({ page }) => {
  await open(page, true); await draw(page, 80, 100, 280, 100);
  for (const start of ["none", "circle", "arrow"]) for (const end of ["none", "circle", "arrow"]) {
    await page.locator(`#line-startStyle input[value="${start}"]`).check(); await page.locator(`#line-endStyle input[value="${end}"]`).check();
    const png = PNG.sync.read(await download(page));
    expect(pixel(png, 180, 100)).toEqual([255, 0, 0, 255]);
    expect(pixel(png, 80, 104)[3] > 0).toBe(start === "circle");
    expect(pixel(png, 267, 104)[3] > 0).toBe(end === "arrow");
  }
  await page.locator(".tool-select").click(); await drag(page, 180, 100, 200, 140);
  expect(pixel(PNG.sync.read(await download(page)), 200, 140)).toEqual([255, 0, 0, 255]);
  await drag(page, 300, 140, 300, 240);
  expect(pixel(PNG.sync.read(await download(page)), 200, 190)).toEqual([255, 0, 0, 255]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(pixel(PNG.sync.read(await download(page)), 200, 140)).toEqual([255, 0, 0, 255]);
});

test("draft cancellation, snapping, zero length and color and width settings", async ({ page }) => {
  await open(page, true); await page.locator(".tool-line").click();
  await click(page, 80, 80); await page.keyboard.press("Escape");
  await click(page, 80, 80); await page.locator("#line-color").fill("#0000ff");
  await click(page, 100, 100); await expect(page.locator(".region-row")).toHaveCount(0);
  await page.keyboard.down("Shift"); await click(page, 200, 120); await page.keyboard.up("Shift");
  let png = PNG.sync.read(await download(page)); expect(pixel(png, 150, 100)).toEqual([0, 0, 255, 255]);
  const width = page.locator("#line-width"); await width.press("End"); await expect(width).toHaveValue("25");
  await width.press("Home"); await expect(width).toHaveValue("1");
  await page.locator(".tool-ellipse").click(); await expect(page.locator("#ellipse-width")).toHaveValue("4");
  await page.locator(".tool-line").click(); await click(page, 10, 10); await click(page, 10, 10);
  await expect(page.locator(".region-row")).toHaveCount(1);
  await click(page, 20, 20); await page.getByTestId("editor-canvas").dispatchEvent("pointercancel");
  await click(page, 40, 40); await expect(page.locator(".region-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await click(page, 460, 300); await click(page, 520, 310);
  png = PNG.sync.read(await download(page)); expect(pixel(png, 479, 309)[3]).toBeGreaterThan(0);
});

test.describe("touch lines", () => {
  test.use({ hasTouch: true });
for (const theme of ["light", "dark"]) test(`mobile line tool and two taps, ${theme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: theme });
  for (const width of [320, 375, 680]) {
    await page.setViewportSize({ width, height: 812 }); await open(page, true);
    await page.locator(".tool-line").click();
    for (const locale of ["EN", "ES"]) {
      await page.getByRole("link", { name: locale, exact: true }).click();
      await expect(page.locator(".tool-line")).toHaveAccessibleName(locale === "EN" ? "Line" : "Línea");
      await page.locator(".settings-action").click();
      await expect(page.locator("#line-width")).toHaveAttribute("max", "25");
      for (const id of ["line-startStyle", "line-endStyle"]) {
        const box = await page.locator(`#${id}`).boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true }).click();
    }
    const a = await point(page, 80, 80), b = await point(page, 280, 180);
    await page.touchscreen.tap(a.x, a.y); await page.touchscreen.tap(b.x, b.y);
    await page.locator(".edits-action").click(); await expect(page.locator(".region-row")).toHaveCount(1);
    await page.keyboard.press("Escape");
    page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Cerrar imagen", exact: true }).click();
  }
});

});

test("pending line survives zoom and temporary pan, and cancels on blur and toolbar undo", async ({ page }) => {
  await open(page, true); await draw(page, 80, 80, 200, 80);
  await click(page, 60, 60);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".region-row")).toHaveCount(1);
  await click(page, 60, 60); await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await click(page, 60, 60); await expect(page.locator(".region-row")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.locator(".tool-line").click(); await click(page, 100, 100);
  await page.locator(".zoom-input").fill("200"); await page.locator(".zoom-input").press("Enter");
  await page.locator(".zoom-input").blur();
  await page.keyboard.down("Space");
  const p = await point(page, 180, 150);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 20, p.y + 20); await page.mouse.up();
  await page.keyboard.up("Space");
  const end = await point(page, 200, 100); await page.mouse.click(end.x + 20, end.y + 20);
  await expect(page.locator(".region-row")).toHaveCount(2);
  expect(pixel(PNG.sync.read(await download(page)), 150, 100)).toEqual([255, 0, 0, 255]);
});

test("line export and clipboard match, preserve alpha and reset session styles on close", async ({ page }) => {
  await open(page, true); await draw(page);
  await page.locator('#line-startStyle input[value="circle"]').check();
  await page.locator('#line-endStyle input[value="arrow"]').check();
  await page.locator("#line-color").fill("#0000ff");
  await page.locator("#line-width").press("End");
  const png = PNG.sync.read(await download(page));
  expect(pixel(png, 0, 0)[3]).toBe(0);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    write: async items => { window.lineCopy = [...new Uint8Array(await (await items[0].getType("image/png")).arrayBuffer())]; },
  } }));
  await page.locator(".copy-action").click();
  await expect.poll(() => page.evaluate(() => Boolean(window.lineCopy))).toBe(true);
  expect(PNG.sync.read(Buffer.from(await page.evaluate(() => window.lineCopy))).data).toEqual(png.data);
  for (const format of ["webp", "jpeg"]) {
    const bytes = await download(page, format);
    const corner = await page.evaluate(async ({ bytes, format }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: `image/${format}` }));
      const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 320;
      const ctx = canvas.getContext("2d"); ctx.drawImage(bitmap, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, { bytes: [...bytes], format });
    expect(corner).toEqual(format === "jpeg" ? [255, 255, 255, 255] : [0, 0, 0, 0]);
  }
  await page.getByRole("button", { name: "Close image", exact: true }).click();
  await open(page); await page.locator(".tool-line").click();
  await expect(page.locator("#line-color")).toHaveValue("#ff0000");
  await expect(page.locator("#line-width")).toHaveValue("4");
  await expect(page.locator('#line-startStyle input[value="none"]')).toBeChecked();
  await expect(page.locator('#line-endStyle input[value="none"]')).toBeChecked();
});

test("thick arrow tips have no rectangular overhang or seam in either direction", async ({ page }) => {
  for (const [x1, y1, x2, y2] of [[80, 160, 400, 160], [400, 160, 80, 160], [240, 40, 240, 280], [80, 60, 320, 240]]) {
    await open(page, true); await draw(page, x1, y1, x2, y2);
    await page.locator("#line-width").press("End");
    await page.locator('#line-startStyle input[value="arrow"]').check();
    await page.locator('#line-endStyle input[value="arrow"]').check();
    const png = PNG.sync.read(await download(page));
    const length = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / length, uy = (y2 - y1) / length;
    for (const [x, y, sign] of [[x1, y1, 1], [x2, y2, -1]]) {
      const sample = (along, side) => pixel(png, Math.floor(x + sign * ux * along - uy * side), Math.floor(y + sign * uy * along + ux * side));
      expect(sample(3, 9)[3]).toBe(0);
      expect(sample(30, 0)).toEqual([255, 0, 0, 255]);
      expect(sample(50, 0)).toEqual([255, 0, 0, 255]);
    }
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Close image", exact: true }).click();
  }
});

test("graphical endpoint choices align with titles and support native keyboard navigation", async ({ page, browserName }) => {
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [320, 375, 680, 800, 1050, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await open(page);
      await page.locator(".tool-line").click();
      for (const locale of ["EN", "ES"]) {
        await page.getByRole("link", { name: locale, exact: true }).click();
        if (width <= 680) await page.locator(".settings-action").click();
        for (const [key, title] of [["startStyle", locale === "EN" ? "Start" : "Inicio"], ["endStyle", locale === "EN" ? "End" : "Fin"]]) {
          const group = page.getByRole("radiogroup", { name: title, exact: true });
          await expect(group.getByRole("radio")).toHaveCount(3);
          const groupBox = await group.boundingBox();
          const titleBox = await page.locator(`#line-${key}-title`).boundingBox();
          const rowBox = await group.locator("..").boundingBox();
          const colorBox = await page.locator("#line-color").boundingBox();
          expect(titleBox.x).toBeCloseTo(rowBox.x, 0);
          expect(titleBox.x + titleBox.width).toBeLessThan(groupBox.x);
          expect(titleBox.y + titleBox.height / 2).toBeCloseTo(groupBox.y + groupBox.height / 2, 0);
          expect(groupBox.x + groupBox.width).toBeCloseTo(rowBox.x + rowBox.width, 0);
          for (const [i, option] of (await group.locator("label").all()).entries()) {
            const box = await option.boundingBox();
            expect(box.width).toBe(44); expect(box.height).toBe(colorBox.height);
            expect(box.x).toBeCloseTo(groupBox.x + i * 48, 0);
            expect(box.y).toBe(groupBox.y);
            await expect(option.locator("svg")).toHaveAttribute("aria-hidden", "true");
          }
          const radios = group.getByRole("radio");
          await radios.nth(0).check(); await radios.nth(0).focus();
          await page.keyboard.press("ArrowRight"); await expect(radios.nth(1)).toBeChecked();
          await page.keyboard.press("ArrowRight"); await expect(radios.nth(2)).toBeChecked();
          await page.keyboard.press("ArrowLeft"); await expect(radios.nth(1)).toBeChecked();
          await radios.nth(0).check();
        }
        expect(await page.locator("#line-startStyle svg").evaluateAll(icons => icons.map(icon => icon.outerHTML)))
          .toEqual(await page.locator("#line-endStyle svg").evaluateAll(icons => icons.map(icon => icon.outerHTML)));
        if (width <= 680) await page.getByRole("button", { name: locale === "EN" ? "Close settings" : "Cerrar ajustes", exact: true }).click();
      }
      await page.getByRole("button", { name: "Cerrar imagen", exact: true }).click();
    }
  }
});
