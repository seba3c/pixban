import { renderPixels } from "./engine.js";

export const textFont = size => `${size}px Arial, sans-serif`;
export const textLineHeight = size => size * 1.2;

export function measureText(op) {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = textFont(op.fontSize);
  const lines = op.text.split("\n");
  // Include glyph overhang and a small caret margin, shared by editor and hit testing.
  const w = Math.max(op.fontSize / 2, ...lines.map(line => {
    const m = ctx.measureText(line);
    return Math.max(m.width, m.actualBoundingBoxRight || 0) + Math.max(0, m.actualBoundingBoxLeft || 0);
  })) + 2;
  return { ...op, w, h: lines.length * textLineHeight(op.fontSize) };
}

export function renderImage(image, ops) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(renderPixels(image.data, image.width, image.height, ops), image.width, image.height), 0, 0);
  ctx.textBaseline = "alphabetic";
  for (const op of ops) {
    if (op.kind !== "text") continue;
    ctx.font = textFont(op.fontSize);
    ctx.fillStyle = op.color;
    // CSS line boxes center the font's em box within the line height.
    const metrics = ctx.measureText("M");
    const ascent = metrics.fontBoundingBoxAscent ?? op.fontSize * 0.9;
    const descent = metrics.fontBoundingBoxDescent ?? op.fontSize * 0.2;
    const baseline = (textLineHeight(op.fontSize) - ascent - descent) / 2 + ascent;
    op.text.split("\n").forEach((line, i) => ctx.fillText(line, op.x, op.y + baseline + i * textLineHeight(op.fontSize)));
  }
  return canvas;
}
