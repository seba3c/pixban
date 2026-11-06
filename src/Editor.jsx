import { useEffect, useRef, useState } from "react";
import { bounds, contains, clamp, renderPixels } from "./engine.js";
export default function Editor({
  image,
  ops,
  selected,
  onSelect,
  onCommit,
  tool,
  block,
  diameter,
  zoom,
  setZoom,
  viewRequest,
  t,
  theme,
  sampleHint,
}) {
  const drawRef = useRef(),
    wrap = useRef(),
    canvas = useRef(),
    gesture = useRef(),
    space = useRef(false),
    offscreen = useRef(),
    appliedView = useRef();
  const [size, setSize] = useState({ w: 600, h: 500 }),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [draft, setDraft] = useState(null),
    [cursor, setCursor] = useState(null);
  const scale = zoom,
    origin = {
      x: (size.w - image.width * scale) / 2 + pan.x,
      y: (size.h - image.height * scale) / 2 + pan.y,
    };
  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - origin.x) / scale,
      y: (e.clientY - r.top - origin.y) / scale,
    };
  };
  const shown = draft
    ? draft.replace
      ? ops.map((o) => (o.id === draft.op.id ? draft.op : o))
      : [...ops, draft.op]
    : ops;
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!wrap.current || size.w <= 0 || size.h <= 0) return;
    if (appliedView.current?.image === image && appliedView.current?.request === viewRequest) return;
    const rect = wrap.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setZoom(Math.max(0.05, Math.min((rect.width - 80) / image.width, (rect.height - 80) / image.height, 1)));
    setPan({ x: 0, y: 0 });
    appliedView.current = { image, request: viewRequest };
  }, [image, viewRequest, size.w, size.h]);
  useEffect(() => {
    const down = (e) => {
      if (
        e.code === "Space" &&
        !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(
          document.activeElement.tagName,
        )
      ) {
        e.preventDefault();
        space.current = true;
      }
    };
    const up = (e) => {
      if (e.code === "Space") space.current = false;
    };
    const reset = () => (space.current = false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const output = document.createElement("canvas");
      output.width = image.width;
      output.height = image.height;
      output
        .getContext("2d")
        .putImageData(
          new ImageData(
            renderPixels(image.data, image.width, image.height, shown),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      offscreen.current = output;
      drawRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [image, ops, draft]);
  function draw() {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    const ctx = el.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.scale(scale, scale);
    // The checkerboard only appears behind transparency, never in the export.
    const tile = 16 / scale;
    ctx.fillStyle = "#d7d7dc";
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.fillStyle = "#eeeeF1";
    for (let y = 0; y < Math.ceil(image.height / tile); y++)
      for (let x = 0; x < Math.ceil(image.width / tile); x++)
        if ((x + y) % 2 === 0)
          ctx.fillRect(
            x * tile,
            y * tile,
            Math.min(tile, image.width - x * tile),
            Math.min(tile, image.height - y * tile),
          );
    if (offscreen.current) ctx.drawImage(offscreen.current, 0, 0);
    const op = draft?.op.kind === "brush"
      ? null
      : shown.find((o) => o.id === selected) || draft?.op;
    if (op) {
      const b = bounds(op);
      ctx.strokeStyle = theme === "dark" ? "#f87171" : "#2563eb";
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([5 / scale, 4 / scale]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
      if (op.kind === "rect")
        for (const [x, y] of [
          [b.x, b.y],
          [b.x + b.w, b.y],
          [b.x, b.y + b.h],
          [b.x + b.w, b.y + b.h],
        ]) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(x - 4 / scale, y - 4 / scale, 8 / scale, 8 / scale);
          ctx.strokeRect(x - 4 / scale, y - 4 / scale, 8 / scale, 8 / scale);
        }
    }
    if (tool === "brush" && cursor) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.2 / scale;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, diameter / 2, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = "#262626";
      ctx.lineWidth = 0.5 / scale;
      ctx.stroke();
    }
    ctx.restore();
  }
  drawRef.current = draw;
  useEffect(draw, [size, zoom, pan, selected, cursor, tool, diameter, theme]);
  function down(e) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    canvas.current.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "pan" || space.current || e.button === 1) {
      gesture.current = { type: "pan", x: e.clientX, y: e.clientY, pan };
      return;
    }
    if (tool === "select") {
      const op = ops.find((o) => o.id === selected);
      if (op?.kind === "rect") {
        const corners = [
          ["nw", op.x, op.y],
          ["ne", op.x + op.w, op.y],
          ["sw", op.x, op.y + op.h],
          ["se", op.x + op.w, op.y + op.h],
        ];
        const corner = corners.find(
          ([, x, y]) => Math.hypot(p.x - x, p.y - y) < 10 / scale,
        );
        if (corner) {
          gesture.current = { type: "resize", corner: corner[0], start: p, op };
          return;
        }
      }
      const hit = [...ops].reverse().find((o) => contains(o, p.x, p.y));
      onSelect(hit?.id || null);
      if (hit?.kind === "rect")
        gesture.current = { type: "move", start: p, op: hit };
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > image.width || p.y > image.height) return;
    const op = {
      id: crypto.randomUUID(),
      kind: tool,
      block,
      ...(tool === "rect"
        ? { x: p.x, y: p.y, w: 0, h: 0 }
        : { diameter, points: [p] }),
    };
    gesture.current = { type: "new", start: p, op };
    setDraft({ op });
    onSelect(op.id);
  }
  function move(e) {
    const p = point(e);
    setCursor(p);
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pan") {
      setPan({ x: g.pan.x + e.clientX - g.x, y: g.pan.y + e.clientY - g.y });
      return;
    }
    const q = { x: clamp(p.x, 0, image.width), y: clamp(p.y, 0, image.height) };
    if (g.type === "new") {
      if (g.op.kind === "rect") {
        const x = Math.min(g.start.x, q.x),
          y = Math.min(g.start.y, q.y);
        g.op = {
          ...g.op,
          x,
          y,
          w: Math.abs(q.x - g.start.x),
          h: Math.abs(q.y - g.start.y),
        };
      } else if (
        Math.hypot(q.x - g.op.points.at(-1).x, q.y - g.op.points.at(-1).y) >
        1 / scale
      )
        g.op = { ...g.op, points: [...g.op.points, q] };
      setDraft({ op: g.op });
    } else if (g.type === "move") {
      const op = {
        ...g.op,
        x: clamp(g.op.x + q.x - g.start.x, 0, image.width - g.op.w),
        y: clamp(g.op.y + q.y - g.start.y, 0, image.height - g.op.h),
      };
      g.result = op;
      setDraft({ replace: true, op });
    } else {
      const o = g.op,
        left = g.corner.includes("w") ? q.x : o.x,
        right = g.corner.includes("e") ? q.x : o.x + o.w,
        top = g.corner.includes("n") ? q.y : o.y,
        bottom = g.corner.includes("s") ? q.y : o.y + o.h;
      const op = {
        ...o,
        x: Math.min(left, right),
        y: Math.min(top, bottom),
        w: Math.max(1, Math.abs(right - left)),
        h: Math.max(1, Math.abs(bottom - top)),
      };
      g.result = op;
      setDraft({ replace: true, op });
    }
  }
  function up() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (
      g.type === "new" &&
      (g.op.kind !== "rect" || (g.op.w >= 1 && g.op.h >= 1))
    )
      onCommit([...ops, g.op]);
    else if (g.result)
      onCommit(ops.map((o) => (o.id === g.op.id ? g.result : o)));
    setDraft(null);
  }
  return (
    <div className="viewport" ref={wrap}>
      <canvas
        ref={canvas}
        aria-label={t.editor}
        data-testid="editor-canvas"
        style={{
          width: size.w,
          height: size.h,
          cursor:
            tool === "pan"
              ? "grab"
              : tool === "select"
                ? "default"
                : tool === "brush"
                  ? "none"
                  : "crosshair",
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          gesture.current = null;
          setDraft(null);
        }}
        onPointerLeave={() => setCursor(null)}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setZoom((z) => clamp(z * Math.exp(-e.deltaY * 0.005), 0.05, 8));
          } else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
        }}
      />
      <div className="canvas-hint">
        {sampleHint || (tool === "rect"
          ? t.tip
          : tool === "brush"
            ? t.brushTip
            : tool === "pan"
              ? t.panTip
              : t.selectTip)}
      </div>
    </div>
  );
}
