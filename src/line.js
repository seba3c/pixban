export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 25;
export const DEFAULT_STROKE_STYLE = { strokeWidth: 4, color: "#ff0000" };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function lineEnd(start, point, width, height, snap = false) {
  if (!snap) return { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) };
  const angle = Math.round(Math.atan2(point.y - start.y, point.x - start.x) / (Math.PI / 4)) * Math.PI / 4;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const length = Math.min(Math.hypot(point.x - start.x, point.y - start.y),
    Math.abs(dx) < 1e-10 ? Infinity : (dx > 0 ? width - start.x : -start.x) / dx,
    Math.abs(dy) < 1e-10 ? Infinity : (dy > 0 ? height - start.y : -start.y) / dy);
  return { x: clamp(start.x + dx * length, 0, width), y: clamp(start.y + dy * length, 0, height) };
}
export function lineMarkers(op) {
  const angle = Math.atan2(op.y2 - op.y1, op.x2 - op.x1);
  return [[op.startStyle, op.x1, op.y1, angle + Math.PI], [op.endStyle, op.x2, op.y2, angle]].flatMap(([style, x, y, a]) => {
    if (style === "circle") return [{ kind: "circle", x, y, r: op.strokeWidth * 1.5 }];
    if (style !== "arrow") return [];
    const length = op.strokeWidth * 4, half = op.strokeWidth * 1.5;
    const bx = x - Math.cos(a) * length, by = y - Math.sin(a) * length;
    return [{ kind: "arrow", points: [{ x, y }, { x: bx - Math.sin(a) * half, y: by + Math.cos(a) * half }, { x: bx + Math.sin(a) * half, y: by - Math.cos(a) * half }] }];
  });
}
export function segmentDistance(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}
// A single description of the visible shaft and endpoint decorations, in image pixels.
export function lineGeometry(op) {
  const dx = op.x2 - op.x1, dy = op.y2 - op.y1, length = Math.hypot(dx, dy);
  const startInset = op.startStyle === "arrow" ? op.strokeWidth * 2 : 0;
  const endInset = op.endStyle === "arrow" ? op.strokeWidth * 2 : 0;
  let shaft = null;
  if (length > startInset + endInset) {
    const ux = dx / length, uy = dy / length, r = op.strokeWidth / 2;
    const from = { x: op.x1 + ux * startInset, y: op.y1 + uy * startInset };
    const to = { x: op.x2 - ux * endInset, y: op.y2 - uy * endInset };
    shaft = { from, to, points: [
      { x: from.x - uy * r, y: from.y + ux * r },
      { x: to.x - uy * r, y: to.y + ux * r },
      { x: to.x + uy * r, y: to.y - ux * r },
      { x: from.x + uy * r, y: from.y - ux * r },
    ] };
  }
  return { shaft, markers: lineMarkers(op) };
}
function polygonContains(points, x, y, tolerance) {
  const crosses = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
  });
  return crosses.every(v => v >= 0) || crosses.every(v => v <= 0) ||
    points.some((a, i) => segmentDistance(x, y, a, points[(i + 1) % points.length]) <= tolerance);
}
export function lineContains(op, x, y, tolerance = 0) {
  const { shaft, markers } = lineGeometry(op);
  if (shaft && polygonContains(shaft.points, x, y, tolerance)) return true;
  return markers.some(m => m.kind === "circle"
    ? Math.hypot(x - m.x, y - m.y) <= m.r + tolerance
    : polygonContains(m.points, x, y, tolerance));
}
export function lineBounds(op) {
  const { shaft, markers } = lineGeometry(op);
  const points = [...(shaft?.points ?? [])];
  for (const m of markers) points.push(...(m.kind === "circle" ? [{ x: m.x - m.r, y: m.y - m.r }, { x: m.x + m.r, y: m.y + m.r }] : m.points));
  if (!points.length) return { x: op.x1, y: op.y1, w: 0, h: 0 };
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
}
