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
async function download(page, format = "png") {
  await page.getByRole("button", { name: "Download", exact: true }).click();
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
  await page.getByLabel("Language", { exact: true }).selectOption("es");
  await expect(
    page.getByRole("button", { name: "Abrir imagen", exact: true }),
  ).toHaveCount(2);
  await page.getByLabel("Cambiar tema de color").click();
  const theme = await page.locator("html").getAttribute("data-theme");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
});
test("rectangle, independent intensity, history, exports and preference changes", async ({
  page,
}) => {
  await openImage(page);
  await draw(page);
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
  const second = await download(page);
  expect(PNG.sync.read(second.bytes).data.equals(result.data)).toBe(true);
  const jpg = await download(page, "jpeg");
  expect(jpg.filename).toBe("test-pixelated.jpg");
  expect(jpg.bytes[0]).toBe(255);
  expect(jpg.bytes[1]).toBe(216);
  await page.getByLabel("Language", { exact: true }).selectOption("es");
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
