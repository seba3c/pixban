import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderPixels,
  contains,
  historyReducer,
  initialHistory,
} from "../src/engine.js";
import { messages } from "../src/i18n.js";
const w = 8,
  h = 8,
  source = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++)
  for (let x = 0; x < w; x++)
    source.set([x * 30, y * 30, (x + y) * 15, 255], (y * w + x) * 4);
test("rectangle affects only its mask and never mutates original", () => {
  const before = source.slice(),
    op = { kind: "rect", x: 2, y: 2, w: 3, h: 3, block: 4 };
  const out = renderPixels(source, w, h, [op]);
  assert.deepEqual(source, before);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!contains(op, x + 0.5, y + 0.5))
        assert.deepEqual(
          out.slice((y * w + x) * 4, (y * w + x) * 4 + 4),
          source.slice((y * w + x) * 4, (y * w + x) * 4 + 4),
        );
  assert.notDeepEqual(out, source);
});
test("brush covers segment between distant pointer events", () => {
  const op = {
    kind: "brush",
    points: [
      { x: 1, y: 1 },
      { x: 6, y: 6 },
    ],
    diameter: 2,
    block: 4,
  };
  assert.equal(contains(op, 3.5, 3.5), true);
  assert.equal(contains(op, 6, 1), false);
  const out = renderPixels(source, w, h, [op]);
  assert.notDeepEqual(out.slice(108, 112), source.slice(108, 112));
});
test("last operation wins overlaps using original source", () => {
  const a = { kind: "rect", x: 0, y: 0, w: 8, h: 8, block: 8 },
    b = { kind: "rect", x: 2, y: 2, w: 3, h: 3, block: 2 };
  const combined = renderPixels(source, w, h, [a, b]),
    onlyB = renderPixels(source, w, h, [b]);
  assert.deepEqual(combined.slice(72, 76), onlyB.slice(72, 76));
  assert.notDeepEqual(combined.slice(0, 4), onlyB.slice(0, 4));
});
test("transparent blocks use alpha-weighted color", () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 255]);
  const out = renderPixels(pixels, 2, 1, [
    { kind: "rect", x: 0, y: 0, w: 2, h: 1, block: 2 },
  ]);
  assert.deepEqual([...out], [0, 0, 255, 128, 0, 0, 255, 128]);
});
test("undo and redo restore whole operations; new branch clears redo", () => {
  let s = historyReducer(initialHistory, {
    type: "commit",
    ops: [{ id: 1, block: 4 }],
  });
  s = historyReducer(s, { type: "commit", ops: [{ id: 1, block: 8 }] });
  s = historyReducer(s, { type: "undo" });
  assert.equal(s.present[0].block, 4);
  s = historyReducer(s, { type: "redo" });
  assert.equal(s.present[0].block, 8);
  s = historyReducer(s, { type: "undo" });
  s = historyReducer(s, { type: "commit", ops: [] });
  assert.equal(s.future.length, 0);
});
test("both languages cover exactly the same interface strings", () =>
  assert.deepEqual(
    Object.keys(messages.en).sort(),
    Object.keys(messages.es).sort(),
  ));
