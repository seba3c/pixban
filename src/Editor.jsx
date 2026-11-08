import { useEffect, useRef, useState } from "react";
import { bounds, clamp, hitTest } from "./engine.js";
import { renderImage, textFont, textLineHeight } from "./render.js";
export default function Editor({
  image,
  suspended,
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
  textEdit,
  onTextStart,
  onTextChange,
  onTextFinish,
  onTextCancel,
}) {
  const drawRef = useRef(),
    wrap = useRef(),
    canvas = useRef(),
    gesture = useRef(),
    space = useRef(false),
    offscreen = useRef(),
    appliedView = useRef(),
    textInput = useRef();
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
    if (!textEdit) return;
    const frame = requestAnimationFrame(() => textInput.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [textEdit?.id]);
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
    if (suspended) return;
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
      reset();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [suspended]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      offscreen.current = renderImage(image, shown.filter(op => op.id !== textEdit?.id));
      drawRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [image, ops, draft, textEdit]);
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
      const hit = hitTest(ops, p.x, p.y);
      const op = ops.find((o) => o.id === selected);
      if (op?.kind === "rect" && hit?.kind !== "text") {
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
      onSelect(hit?.id || null);
      if (hit?.kind === "rect" || hit?.kind === "text")
        gesture.current = { type: "move", start: p, op: hit, x: e.clientX, y: e.clientY };
      return;
    }
    if (p.x < 0 || p.y < 0 || p.x > image.width || p.y > image.height) return;
    if (tool === "text") {
      const hit = hitTest(ops.filter(op => op.kind === "text"), p.x, p.y);
      onTextStart(hit || { x: clamp(p.x, 0, image.width - 1), y: clamp(p.y, 0, image.height - 1) });
      return;
    }
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
      if (g.op.kind === "text" && !g.result && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 4) return;
      const op = {
        ...g.op,
        x: clamp(g.op.x + q.x - g.start.x, 0, Math.max(0, image.width - (g.op.kind === "text" ? 1 : g.op.w))),
        y: clamp(g.op.y + q.y - g.start.y, 0, Math.max(0, image.height - (g.op.kind === "text" ? 1 : g.op.h))),
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
  function up(e) {
    const g = gesture.current;
    if (!g) return;
    const movingText = g.type === "move" && g.op.kind === "text";
    if (movingText) move(e);
    gesture.current = null;
    if (
      g.type === "new" &&
      (g.op.kind !== "rect" || (g.op.w >= 1 && g.op.h >= 1))
    )
      onCommit([...ops, g.op]);
    else if (g.result)
      onCommit(ops.map((o) => (o.id === g.op.id ? g.result : o)));
    else if (movingText) onTextStart(g.op);
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
              : tool === "text"
                ? "text"
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
      {textEdit && <div className="text-edit-clip" style={{
        left: origin.x, top: origin.y, width: image.width * scale, height: image.height * scale,
      }}>
        <textarea ref={textInput} key={textEdit.id} className="text-editor" data-testid="text-editor"
          aria-label={t.textContent} aria-describedby="text-edit-hint" autoFocus wrap="off" spellCheck={false}
          value={textEdit.text}
          style={{ left: textEdit.x * scale, top: textEdit.y * scale,
            width: Math.max(textEdit.w, textEdit.fontSize * 3) * scale + 2,
            height: textEdit.h * scale + 2,
            font: textFont(textEdit.fontSize * scale),
            lineHeight: `${textLineHeight(textEdit.fontSize) * scale}px`, color: textEdit.color }}
          onChange={e => onTextChange(e.target.value)}
          onBlur={() => onTextFinish()}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === "Escape") { e.preventDefault(); onTextCancel(); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onTextFinish(); }
          }} />
      </div>}
      <div className="canvas-hint" id="text-edit-hint">
        {textEdit ? t.textEditingTip : tool === "text" ? t.textTip : sampleHint || (tool === "rect"
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
