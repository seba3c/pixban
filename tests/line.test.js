import { test } from "node:test";
import assert from "node:assert/strict";
import { bounds, contains, hitTest, renderPixels } from "../src/engine.js";
import { lineEnd, lineMarkers, lineGeometry, MIN_STROKE_WIDTH, MAX_STROKE_WIDTH } from "../src/line.js";
const line = { id: "l", kind: "line", x1: 50, y1: 50, x2: 150, y2: 50, strokeWidth: 4, color: "#ff0000", startStyle: "none", endStyle: "none" };
test("line hit testing follows segment and markers, with screen tolerance", () => {
  assert.equal(contains(line, 100, 51), true);
  assert.equal(contains(line, 100, 58), false);
  assert.equal(contains(line, 100, 58, 6), true);
  assert.equal(contains({ ...line, startStyle: "circle" }, 50, 55), true);
  assert.equal(contains({ ...line, endStyle: "arrow" }, 135, 55), true);
  assert.equal(contains(line, 135, 55), false);
  assert.deepEqual(bounds(line), { x: 50, y: 48, w: 100, h: 4 });
});
test("all nine marker combinations share bounds and preserve endpoint direction", () => {
  for (const startStyle of ["none", "circle", "arrow"]) for (const endStyle of ["none", "circle", "arrow"]) {
    const op = { ...line, startStyle, endStyle };
    const b = bounds(op);
    assert.equal(lineMarkers(op).length, Number(startStyle !== "none") + Number(endStyle !== "none"));
    assert.ok(b.x <= 50 && b.x + b.w >= 150);
    for (const m of lineMarkers(op)) if (m.points) for (const p of m.points) {
      assert.ok(p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    }
  }
  const reversed = { ...line, x1: 150, x2: 50, endStyle: "arrow" };
  assert.ok(lineMarkers(reversed)[0].points[1].x > reversed.x2);
});
test("45 degree snapping retains angle when clipped to image", () => {
  const end = lineEnd({ x: 90, y: 80 }, { x: 150, y: 130 }, 100, 100, true);
  assert.ok(Math.abs(end.x - 100) < 1e-8);
  assert.ok(Math.abs(end.y - 90) < 1e-8);
  assert.deepEqual(lineEnd({ x: 20, y: 20 }, { x: -10, y: 200 }, 100, 100), { x: 0, y: 100 });
  assert.equal(MIN_STROKE_WIDTH, 1); assert.equal(MAX_STROKE_WIDTH, 25);
});
test("lines are annotations in creation order and never pixelate the source", () => {
  const ellipse = { id: "e", kind: "ellipse", x: 40, y: 40, w: 100, h: 60, strokeWidth: 4 };
  assert.equal(hitTest([line, ellipse], 100, 50), ellipse);
  assert.equal(hitTest([ellipse, line], 100, 50), line);
  const source = new Uint8ClampedArray(16);
  assert.deepEqual(renderPixels(source, 2, 2, [line]), source);
});

test("arrow tips exclude the old shaft overhang and keep the shaft inside the heads", () => {
  for (const [x2, y2] of [[350, 150], [50, 150], [200, 300], [200, 0], [350, 300], [50, 0]]) {
    const dx = x2 - 200, dy = y2 - 150, length = Math.hypot(dx, dy), ux = dx / length, uy = dy / length;
    for (const [startStyle, endStyle] of [["none", "arrow"], ["arrow", "none"], ["arrow", "arrow"]]) {
      const op = { ...line, x1: 200, y1: 150, x2, y2, strokeWidth: 25, startStyle, endStyle };
      const { shaft } = lineGeometry(op);
      assert.ok(shaft);
      assert.ok(Math.abs(shaft.from.x - (200 + ux * (startStyle === "arrow" ? 50 : 0))) < 1e-8);
      assert.ok(Math.abs(shaft.to.y - (y2 - uy * (endStyle === "arrow" ? 50 : 0))) < 1e-8);
      for (const [style, x, y, sign] of [[startStyle, 200, 150, 1], [endStyle, x2, y2, -1]]) {
        if (style !== "arrow") continue;
        // A point beside the narrow tip, where the untrimmed rectangle used to show.
        assert.equal(contains(op, x + sign * ux * 3 - uy * 9, y + sign * uy * 3 + ux * 9), false);
        assert.equal(contains(op, x + sign * ux * 30, y + sign * uy * 30), true);
      }
    }
  }
});
test("short arrows omit an exhausted shaft without inverting it", () => {
  for (const length of [0, 1, 40, 50, 99, 100]) {
    const op = { ...line, x2: line.x1 + length, strokeWidth: 25, startStyle: "arrow", endStyle: "arrow" };
    assert.equal(lineGeometry(op).shaft, null);
    assert.ok(Object.values(bounds(op)).every(Number.isFinite));
  }
});
