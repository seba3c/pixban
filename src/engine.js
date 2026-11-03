export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function bounds(op) {
  if (op.kind === "rect") return { x: op.x, y: op.y, w: op.w, h: op.h };
  const xs = op.points.map((p) => p.x),
    ys = op.points.map((p) => p.y),
    r = op.diameter / 2;
  return {
    x: Math.min(...xs) - r,
    y: Math.min(...ys) - r,
    w: Math.max(...xs) - Math.min(...xs) + 2 * r,
    h: Math.max(...ys) - Math.min(...ys) + 2 * r,
  };
}
export function contains(op, x, y) {
  if (op.kind === "rect")
    return x >= op.x && x < op.x + op.w && y >= op.y && y < op.y + op.h;
  const r2 = (op.diameter / 2) ** 2;
  for (let i = 0; i < op.points.length; i++) {
    const a = op.points[Math.max(0, i - 1)],
      b = op.points[i],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t =
      dx || dy
        ? clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1)
        : 0;
    if ((x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2 <= r2) return true;
  }
  return false;
}
export function renderPixels(source, width, height, ops) {
  const out = new Uint8ClampedArray(source),
    caches = new Map();
  for (const op of ops) {
    const block = Math.max(2, Math.round(op.block)),
      b = bounds(op);
    let cache = caches.get(block);
    if (!cache) {
      cache = new Map();
      caches.set(block, cache);
    }
    for (
      let y = Math.max(0, Math.floor(b.y));
      y < Math.min(height, Math.ceil(b.y + b.h));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(b.x));
        x < Math.min(width, Math.ceil(b.x + b.w));
        x++
      ) {
        if (!contains(op, x + 0.5, y + 0.5)) continue;
        const bx = Math.floor(x / block) * block,
          by = Math.floor(y / block) * block,
          key = by * width + bx;
        let color = cache.get(key);
        if (!color) {
          let r = 0,
            g = 0,
            bv = 0,
            a = 0,
            n = 0;
          for (let yy = by; yy < Math.min(height, by + block); yy++)
            for (let xx = bx; xx < Math.min(width, bx + block); xx++) {
              const i = (yy * width + xx) * 4,
                alpha = source[i + 3];
              r += source[i] * alpha;
              g += source[i + 1] * alpha;
              bv += source[i + 2] * alpha;
              a += alpha;
              n++;
            }
          color = a ? [r / a, g / a, bv / a, a / n] : [0, 0, 0, 0];
          cache.set(key, color);
        }
        out.set(color, (y * width + x) * 4);
      }
    }
  }
  return out;
}
export const initialHistory = { past: [], present: [], future: [] };
export function historyReducer(state, action) {
  if (action.type === "reset") return initialHistory;
  if (action.type === "commit")
    return {
      past: [...state.past, state.present],
      present: action.ops,
      future: [],
    };
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past.at(-1),
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}
