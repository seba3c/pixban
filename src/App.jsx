import { useEffect, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Type,
  ArrowUpRight,
  FolderOpen,
  ClipboardPaste,
  Copy,
  Github,
  MousePointer2,
  SquareDashed,
  Paintbrush,
  Hand,
  Undo2,
  Redo2,
  Sun,
  Moon,
  Download,
  Plus,
  Minus,
  Maximize,
  ZoomIn,
  ZoomOut,
  Trash2,
  ChevronsDown,
  ChevronsUp,
  PanelRightClose,
  PanelRightOpen,
  X,
  Check,
  Image as ImageIcon,
  SlidersHorizontal,
  ShieldCheck,
  Layers,
  Upload,
} from "lucide-react";
import Editor from "./Editor.jsx";
import { APP_VERSION, REPOSITORY_URL } from "./app-info.js";
import sampleCar from "./assets/sample-car.webp";
import { historyReducer, initialHistory, resolveTextEdit } from "./engine.js";
import { measureText, renderImage } from "./render.js";
import { messages, preference, persist } from "./i18n.js";
import { localePath, pathLocale, renderGuide, seo, updatePageMetadata } from "./seo.js";
const DEFAULT_BLOCK = 25;
const DEFAULT_DIAMETER = 45;
const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Render only image pixels; editor overlays never enter either export destination.
async function encodeImage(image, ops, format) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const pixels = renderImage(image, ops);
  const ctx = canvas.getContext("2d");
  if (format === "jpeg") {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(pixels, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (blob) resolve(blob);
    else reject(new Error("encode"));
  }, `image/${format}`, 0.92));
}

function IconButton({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
function DisclosureButton({ label, expanded, controls, onClick }) {
  const Chevron = expanded ? ChevronsUp : ChevronsDown;
  return <IconButton className="section-toggle" type="button" label={label}
    aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
    <span className="section-toggle-face"><Chevron size={14} aria-hidden="true" /></span>
  </IconButton>;
}
function ZoomInput({ zoom, setZoom, disabled, label }) {
  const [draft, setDraft] = useState(null);
  const canceled = useRef(false);
  const formatted = String(Math.round(zoom * 1000) / 10);
  const commit = () => {
    if (!canceled.current && draft !== null) {
      const value = draft.trim().replace(",", ".");
      const percent = Number(value);
      if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(percent)) {
        setZoom(Math.max(0.05, Math.min(8, percent / 100)));
      }
    }
    canceled.current = false;
    setDraft(null);
  };
  return <span className="zoom-value">
    <input
      type="text"
      inputMode="decimal"
      className="zoom-input"
      aria-label={label}
      disabled={disabled}
      value={disabled ? "—" : draft ?? formatted}
      onFocus={e => { setDraft(formatted); e.currentTarget.select(); }}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          canceled.current = e.key === "Escape";
          e.currentTarget.blur();
        }
      }}
    />
    <span aria-hidden="true">%</span>
  </span>;
}
function BlockPreview({ block, label }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    // Two backing pixels per CSS pixel keep the full-size preview sharp.
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const cell = block;
    // Keep the central grid intersection fixed as cells grow in every direction.
    const center = 30;
    const first = Math.floor(-center / cell);
    const last = Math.ceil(center / cell);
    for (let row = first; row < last; row++) {
      for (let col = first; col < last; col++) {
        let seed = Math.imul(col + 1, 374761393) ^ Math.imul(row + 7, 668265263);
        seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
        const gray = 40 + ((seed ^ (seed >>> 16)) >>> 0) % 186;
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        ctx.fillRect(center + col * cell, center + row * cell, cell, cell);
      }
    }
  }, [block]);
  return <canvas ref={ref} className="block-preview" width="120" height="120" role="img" aria-label={label} data-cell-size={block} />;
}
function PixelLogo() {
  return (
    <span className="pixel-logo" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}
export default function App() {
  const [lang, setLang] = useState(() => pathLocale(location.pathname));
  const [theme, setTheme] = useState(() =>
    preference(
      "pixelar.theme",
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    ),
  );
  const t = messages[lang];
  const [mobilePanel, setMobilePanel] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [toolSettingsCollapsed, setToolSettingsCollapsed] = useState(false);
  const [editsCollapsed, setEditsCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 680px)").matches);
  const mobileDialog = useRef(), mobilePanelTrigger = useRef(), mobileCloseButton = useRef(), footerRef = useRef();
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const change = () => setNarrow(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty("--footer-height", `${entry.borderBoxSize?.[0]?.blockSize ?? footerRef.current.getBoundingClientRect().height}px`);
    });
    observer.observe(footerRef.current);
    return () => observer.disconnect();
  }, []);

  const [history, dispatch] = useReducer(historyReducer, initialHistory),
    ops = history.present;
  const [image, setImage] = useState(null),
    [tool, setTool] = useState("rect"),
    [block, setBlock] = useState(DEFAULT_BLOCK),
    [diameter, setDiameter] = useState(DEFAULT_DIAMETER),
    [selected, setSelected] = useState(null),
    [zoom, setZoom] = useState(1),
    [viewRequest, setViewRequest] = useState({ mode: "fit", token: 0 }),
    [format, setFormat] = useState("png"),
    [copying, setCopying] = useState(false),
    [exportFailure, setExportFailure] = useState(null),
    [exportOpen, setExportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [dragging, setDragging] = useState(false),
    [exported, setExported] = useState("[]"),
    [slider, setSlider] = useState(null),
    [textEdit, setTextEdit] = useState(null),
    [textStyle, setTextStyle] = useState({ fontSize: 32, color: "#000000" });
  const textEditRef = useRef(null), opsRef = useRef(ops);
  opsRef.current = ops;
  const updateTextEdit = next => { textEditRef.current = next; setTextEdit(next); };
  const fileInput = useRef(),
    toolButtons = useRef({}),
    loadId = useRef(0),
    dialog = useRef(),
    downloadUrl = useRef(),
    exportInFlight = useRef(false),
    dragCounter = useRef(0);
  const dirty = JSON.stringify(resolveTextEdit(ops, textEdit)) !== exported;
  const active = textEdit || ops.find((o) => o.id === selected);
  const settingsKind = tool === "select" ? active?.kind : tool;
  const textSettings = settingsKind === "text";
  const pixelSettings = settingsKind === "rect" || settingsKind === "brush";
  const effectiveBlock = slider ?? active?.block ?? block;
  const resizedText = active?.kind === "text" && slider !== null
    ? measureText({ ...active, fontSize: slider }) : null;
  const effectiveFontSize = resizedText?.fontSize ?? active?.fontSize ?? textStyle.fontSize;
  const effectiveOps = resolveTextEdit(
    slider !== null && active && active.kind !== "text"
      ? ops.map((o) => (o.id === active.id ? { ...o, block: slider } : o))
      : ops, resizedText ?? textEdit);
  const commit = (next) => {
    if (JSON.stringify(next) === JSON.stringify(opsRef.current)) return;
    opsRef.current = next;
    dispatch({ type: "commit", ops: next });
  };
  const finishText = () => {
    const edit = textEditRef.current;
    if (!edit) return opsRef.current;
    const next = resolveTextEdit(opsRef.current, edit);
    updateTextEdit(null);
    commit(next);
    if (!next.some(op => op.id === edit.id)) setSelected(null);
    return next;
  };
  const startText = op => {
    finishText();
    const next = measureText(op.kind === "text" ? op : {
      id: crypto.randomUUID(), kind: "text", text: "", ...op, ...textStyle,
    });
    setSelected(next.id);
    setSlider(null);
    // Inline editing must live outside the modal mobile inspector.
    setMobilePanel(null);
    updateTextEdit(next);
  };
  const changeTextStyle = patch => {
    setTextStyle(style => ({ ...style, ...patch }));
    if (active?.kind !== "text") return;
    const next = measureText({ ...active, ...patch });
    if (textEditRef.current) updateTextEdit(next);
    else commit(ops.map(op => op.id === active.id ? next : op));
  };
  useEffect(() => {
    const finishOutside = event => {
      if (textEditRef.current && !event.target.closest?.(".text-editor")) {
        // Commit before the same pointer event reaches selection or image actions.
        flushSync(() => finishText());
      }
    };
    document.addEventListener("pointerdown", finishOutside, true);
    return () => document.removeEventListener("pointerdown", finishOutside, true);
  });
  useEffect(() => {
    document.documentElement.lang = lang;
    updatePageMetadata(lang);
    if (location.pathname !== localePath(lang))
      window.history.replaceState(null, "", localePath(lang) + location.search + location.hash);
    persist("pixelar.language", lang);
  }, [lang]);
  useEffect(() => {
    const onPopState = () => setLang(pathLocale(location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = (e) => {
      if (!preference("pixelar.theme", ""))
        setTheme(e.matches ? "dark" : "light");
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (exportOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [exportOpen]);
  useEffect(
    () => () => {
      loadId.current++;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );
  const remove = () => {
    if (active) {
      commit(ops.filter((o) => o.id !== selected));
      setSelected(null);
    }
  };
  useEffect(() => {
    const handler = (e) => {
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(
          document.activeElement.tagName,
        ) ||
        !image || exportOpen || mobilePanel || busy
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      }
      if ((e.key === "Delete" || e.key === "Backspace") && active) {
        e.preventDefault();
        remove();
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tools = { v: "select", r: "rect", b: "brush", t: "text", h: "pan" };
        const nextTool = tools[e.key.toLowerCase()];
        if (nextTool) {
          e.preventDefault();
          finishText();
          setTool(nextTool);
          if (nextTool !== "select") setSelected(null);
          setSlider(null);
          toolButtons.current[nextTool]?.focus({ preventScroll: true });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [image, ops, selected, exportOpen, mobilePanel, busy]);
  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || busy || exportOpen || mobilePanel ||
        event.target?.closest?.("input, select, textarea, [contenteditable]:not([contenteditable='false'])")) return;
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter(item => item.kind === "file").map(item => item.getAsFile()).filter(Boolean);
      if (!files.length) files.push(...Array.from(event.clipboardData?.files ?? []));
      const file = files.find(file => Object.hasOwn(IMAGE_EXTENSIONS, file.type));
      if (file) {
        event.preventDefault();
        openFile(file);
      } else if (files.some(file => file.type.startsWith("image/"))) {
        event.preventDefault();
        setToast({ error: true, key: "badFile" });
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [busy, exportOpen, mobilePanel, dirty, lang]);
  function closeImage() {
    if (busy) return;
    finishText();
    if (dirty && !window.confirm(t.closeImageConfirm)) return;
    loadId.current++;
    if (downloadUrl.current) {
      URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = null;
    }
    fileInput.current.value = "";
    dragCounter.current = 0;
    setMobilePanel(null);
    setImage(null);
    dispatch({ type: "reset" });
    setSelected(null);
    setTool("rect");
    setBlock(DEFAULT_BLOCK);
    setDiameter(DEFAULT_DIAMETER);
    updateTextEdit(null);
    setTextStyle({ fontSize: 32, color: "#000000" });
    setZoom(1);
    setViewRequest({ mode: "fit", token: 0 });
    setFormat("png");
    setExportFailure(null);
    setSlider(null);
    setExportOpen(false);
    setToast(null);
    setDragging(false);
    setBusy(false);
    setExported("[]");
  }
  async function openFile(file, isSample = false, requestId) {
    if (requestId !== undefined && requestId !== loadId.current) return;
    if (!file) return;
    const pendingOps = finishText();
    if (!Object.hasOwn(IMAGE_EXTENSIONS, file.type)) {
      setToast({ error: true, key: "badFile" });
      return;
    }
    if (JSON.stringify(pendingOps) !== exported && !window.confirm(t.discard)) return;
    const id = requestId ?? ++loadId.current;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const bitmap = new Image();
      bitmap.src = url;
      await bitmap.decode();
      if (id !== loadId.current) return;
      if (bitmap.width * bitmap.height > 32e6) throw new Error("limit");
      const c = document.createElement("canvas");
      c.width = bitmap.naturalWidth;
      c.height = bitmap.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      if (id !== loadId.current) return;
      setImage({ name: file.name || `clipboard.${IMAGE_EXTENSIONS[file.type]}`, width: c.width, height: c.height, data, isSample, mimeType: file.type });
      setFormat(file.type.slice("image/".length));
      setExportFailure(null);
      dispatch({ type: "reset" });
      setSelected(null);
      setExported("[]");
      setTool("rect");
      setSlider(null);
      setMobilePanel(null);
    } catch (err) {
      if (id === loadId.current)
        setToast({
          error: true,
          key: err.message === "limit" ? "limit" : "loadError",
        });
    } finally {
      URL.revokeObjectURL(url);
      if (id === loadId.current) setBusy(false);
    }
  }
  async function pasteImage() {
    if (busy || exportOpen || mobilePanel) return;
    if (!navigator.clipboard?.read) {
      setToast({ error: true, key: "clipboardUnavailable" });
      return;
    }
    const id = ++loadId.current;
    setBusy(true);
    try {
      // Call directly from the click to retain the browser's user activation.
      const items = await navigator.clipboard.read();
      if (id !== loadId.current) return;
      for (const item of items) {
        const type = item.types.find(type => Object.hasOwn(IMAGE_EXTENSIONS, type));
        if (!type) continue;
        const blob = await item.getType(type);
        await openFile(new File([blob], blob.name || `clipboard.${IMAGE_EXTENSIONS[type]}`, { type }), false, id);
        return;
      }
      setToast({ error: true, key: "clipboardEmpty" });
    } catch {
      if (id === loadId.current) setToast({ error: true, key: "clipboardError" });
    } finally {
      if (id === loadId.current) setBusy(false);
    }
  }
  async function sample() {
    const id = ++loadId.current;
    setBusy(true);
    try {
      const response = await fetch(sampleCar);
      if (!response.ok) throw new Error("sample");
      const blob = await response.blob();
      if (id !== loadId.current) return;
      await openFile(new File([blob], `${t.sampleName}.webp`, { type: "image/webp" }), true);
    } catch {
      if (id === loadId.current) {
        setBusy(false);
        setToast({ error: true, key: "loadError" });
      }
    }
  }
  async function copyImage() {
    if (!image || busy || exportInFlight.current || exportOpen || mobilePanel) return;
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      setToast({ error: true, key: "clipboardCopyUnavailable" });
      return;
    }
    exportInFlight.current = true;
    setBusy(true);
    setCopying(true);
    setToast(null);
    const exportOps = finishText();
    const snapshot = JSON.stringify(exportOps);
    try {
      // Call write during the click; defer encoding without losing user activation.
      const png = Promise.resolve().then(() => encodeImage(image, exportOps, "png"));
      // A constructor/write rejection can happen before the browser consumes png.
      png.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setExported(snapshot);
      setToast({ key: "clipboardCopied" });
    } catch {
      setToast({ error: true, key: "clipboardCopyError" });
    } finally {
      exportInFlight.current = false;
      setCopying(false);
      setBusy(false);
    }
  }
  async function exportImage() {
    if (!image || busy || exportInFlight.current) return;
    exportInFlight.current = true;
    setBusy(true);
    setExportFailure(null);
    const exportOps = finishText();
    const snapshot = JSON.stringify(exportOps);
    try {
      const blob = await encodeImage(image, exportOps, format);
      const extension = IMAGE_EXTENSIONS[blob.type];
      if (!extension || (blob.type !== `image/${format}` && blob.type !== "image/png"))
        throw new Error("encode");
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl.current;
      a.download = image.name.replace(/\.[^.]+$/, "") +
        (lang === "es" ? "-pixelada" : "-pixelated") + `.${extension}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setExported(snapshot);
      setExportOpen(false);
      setToast({ key: blob.type === `image/${format}` ? "notice" : "exportPngFallback" });
    } catch {
      setExportFailure("exportError");
    } finally {
      exportInFlight.current = false;
      setBusy(false);
    }
  }
  const tools = [
    ["select", MousePointer2, t.select, "V"],
    ["pan", Hand, t.pan, "H"],
    ["rect", SquareDashed, t.rect, "R"],
    ["brush", Paintbrush, t.brush, "B"],
  ];
  const renderTool = ([id, Icon, label, shortcut]) => (
    <button
      key={id}
      ref={button => { toolButtons.current[id] = button; }}
      className={`tool tool-${id} ${tool === id ? "active" : ""}`}
      aria-label={label}
      aria-pressed={tool === id}
      title={`${label} (${shortcut})`}
      disabled={!image}
      onClick={() => {
        setTool(id);
        if (id !== "select") setSelected(null);
        setSlider(null);
      }}
    >
      <Icon size={20} />
    </button>
  );
  const finishSlider = () => {
    if (resizedText) {
      if (textEditRef.current?.id === resizedText.id) updateTextEdit(resizedText);
      else commit(resolveTextEdit(opsRef.current, resizedText));
    } else if (slider !== null && active && slider !== active.block) {
      commit(
        ops.map((o) => (o.id === active.id ? { ...o, block: slider } : o)),
      );
    }
    setSlider(null);
  };
  const openMobilePanel = (panel, trigger) => {
    mobilePanelTrigger.current = trigger;
    setMobilePanel(panel);
  };
  const closeMobilePanel = () => {
    if (mobilePanel === "settings" && slider !== null) finishSlider();
    setMobilePanel(null);
  };
  useEffect(() => {
    if (mobilePanel && !narrow) {
      closeMobilePanel();
    } else if (mobilePanel) {
      mobileDialog.current?.showModal();
      mobileCloseButton.current?.focus({ preventScroll: true });
    } else if (mobileDialog.current?.open) {
      mobileDialog.current.close();
      if (!textEditRef.current) mobilePanelTrigger.current?.focus({ preventScroll: true });
    }
  }, [mobilePanel, narrow]);
  const settingsFolded = !narrow && toolSettingsCollapsed;
  const editsFolded = !narrow && editsCollapsed;
  const settingsTitle = (
    <div className="section-title">
      <h2 className="section-heading" id="settings-heading">{t.toolSettings}</h2>
      {!narrow && <DisclosureButton expanded={!toolSettingsCollapsed} controls="tool-settings-body"
        label={toolSettingsCollapsed ? t.expandToolSettings : t.collapseToolSettings}
        onClick={() => {
          if (!toolSettingsCollapsed && slider !== null) finishSlider();
          setToolSettingsCollapsed(value => !value);
        }} />}
    </div>
  );
  const diameterLabel = active?.kind === "brush" ? t.nextStrokeDiameter : t.diameter;
  const clearEditsButton = ops.length > 0 && (
    <IconButton label={t.clear} type="button" onClick={() => {
      if (confirm(t.clearConfirm)) {
        commit([]);
        setSelected(null);
      }
    }}>
      <Trash2 size={14} aria-hidden="true" />
    </IconButton>
  );
  const editsTitle = (
    <div className="section-title">
      <h2 className="section-heading" id="edits-heading">
        {t.regions}
        <span>{ops.length}</span>
      </h2>
      {narrow ? clearEditsButton : <DisclosureButton expanded={!editsCollapsed} controls="edits-body"
        label={editsCollapsed ? t.expandEdits : t.collapseEdits}
        onClick={() => setEditsCollapsed(value => !value)} />}
    </div>
  );
  const settingsPanel = (
    <section className={`inspector-section settings${settingsFolded ? " is-collapsed" : ""}`}>
      {settingsTitle}
      <div className="section-fold">
        <div id="tool-settings-body" inert={settingsFolded} aria-disabled={!image}>
          {active && <span className="eyebrow">{t.selected}</span>}
          {!textSettings && !pixelSettings && (
            <div className="inspector-empty">
              <SlidersHorizontal size={28} strokeWidth={1.2} aria-hidden="true" />
              <strong>{t.emptyToolSettings}</strong>
              <p>{t.emptyToolSettingsHint}</p>
            </div>
          )}
          {textSettings && <>
            <div className="settings-row">
              <label htmlFor="text-size">{t.fontSize}</label>
              <output htmlFor="text-size">{effectiveFontSize}<small> px</small></output>
            </div>
            <input id="text-size" type="range" min="8" max="256" step="1" disabled={!image}
              value={effectiveFontSize} aria-valuetext={`${effectiveFontSize} ${t.pixels}`}
              onChange={e => {
                const fontSize = e.target.valueAsNumber;
                setTextStyle(style => ({ ...style, fontSize }));
                if (active?.kind === "text") setSlider(fontSize);
              }}
              onPointerUp={finishSlider} onPointerCancel={finishSlider}
              onKeyUp={finishSlider} onBlur={finishSlider} />
            <div className="range-ends">
              <span>8 px</span>
              <span>256 px</span>
            </div>
            <div className="settings-row">
              <label htmlFor="text-color">{t.textColor}</label>
              <input id="text-color" type="color" disabled={!image}
                value={active?.color ?? textStyle.color} onChange={e => changeTextStyle({ color: e.target.value })} />
            </div>
          </>}
          {pixelSettings && <>
            <div className="settings-row">
              <label htmlFor="block">{t.block}</label>
              <output>
                {effectiveBlock}
                <small> px</small>
              </output>
            </div>
            <input
              id="block"
              type="range"
              min="4"
              max="25"
              step="1"
              value={effectiveBlock}
              disabled={!image}
              onChange={(e) => {
                const n = Number(e.target.value);
                setBlock(n);
                if (active) setSlider(n);
              }}
              onPointerUp={finishSlider}
              onKeyUp={finishSlider}
              onBlur={finishSlider}
            />
            <div className="range-ends">
              <span>4 px</span>
              <span>25 px</span>
            </div>
            <div className="size-preview">
              <BlockPreview block={effectiveBlock} label={`${t.block}: ${effectiveBlock} px`} />
            </div>
            {tool === "brush" && <div className="brush-settings">
              <div className="settings-row">
                <label htmlFor="diameter">{diameterLabel}</label>
                <output>
                  {diameter}
                  <small> px</small>
                </output>
              </div>
              <input
                id="diameter"
                type="range"
                min="8"
                max="50"
                value={diameter}
                disabled={!image}
                onChange={(e) => setDiameter(Number(e.target.value))}
              />
              <div className="size-preview">
                <div
                  className="brush-preview"
                  role="img"
                  aria-label={`${diameterLabel}: ${diameter} px`}
                >
                  <span style={{ width: diameter, height: diameter }} />
                </div>
              </div>
            </div>}
          </>}
        </div>
      </div>
    </section>
  );
  const editsPanel = (
    <section className={`inspector-section regions${editsFolded ? " is-collapsed" : ""}`}>
      {editsTitle}
      <div className="section-fold">
        <div id="edits-body" className="edits-body" inert={editsFolded}>
          {!narrow && clearEditsButton && <div className="clear-edits">{clearEditsButton}</div>}
          {ops.length === 0 ? (
            <div className="inspector-empty">
              <Layers size={28} strokeWidth={1.2} />
              <strong>{t.emptyRegions}</strong>
              <p>{t.emptyRegionsHint}</p>
            </div>
          ) : (
            <ol className="region-list">
              {ops.map((op, i) => (
                <li
                  key={op.id}
                  className={`${op.id === selected ? "selected" : ""} ${op.kind === "text" ? "text-row" : ""}`}
                >
                  <button
                    className="region-row"
                    onKeyDown={e => {
                      if (op.kind !== "text" || e.key !== "Enter") return;
                      e.preventDefault();
                      if (!e.repeat) {
                        setTool("select");
                        startText(op);
                      }
                    }}
                    onClick={() => {
                      setSelected(op.id);
                      setTool("select");
                      setSlider(null);
                    }}
                  >
                    <span className="region-icon">
                      {op.kind === "text" ? <Type size={16} /> : op.kind === "rect" ? (
                        <SquareDashed size={16} />
                      ) : (
                        <Paintbrush size={16} />
                      )}
                    </span>
                    <span>
                      {t[op.kind]} {i + 1}
                      <small>{op.kind === "text" ? op.text.replace(/\n/g, " ") : `${op.block} px`}</small>
                    </span>
                  </button>
                  <IconButton
                    label={`${t.delete} ${i + 1}`}
                    onClick={() => {
                      commit(ops.filter((o) => o.id !== op.id));
                      if (selected === op.id) setSelected(null);
                    }}
                  >
                    <X size={13} />
                  </IconButton>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
  return (
    <div
      className="app"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          dragCounter.current++;
          setDragging(true);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        if (--dragCounter.current <= 0) {
          setDragging(false);
          dragCounter.current = 0;
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        dragCounter.current = 0;
        openFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={fileInput}
        data-testid="file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          openFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <header className="header">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <PixelLogo />
          pixban<span className="brand-dot">.</span>
        </a>
        <div className="header-actions">
          <nav className="language-picker" aria-label={t.language}>
            {["en", "es"].map((locale, i) => (
              <span key={locale}>
                {i > 0 && (
                  <span className="language-divider" aria-hidden="true">|</span>
                )}
                <a
                  href={localePath(locale)}
                  lang={locale}
                  hrefLang={locale}
                  aria-current={lang === locale ? "true" : undefined}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (lang !== locale) window.history.pushState(null, "", localePath(locale) + location.search);
                    setLang(locale);
                  }}
                >
                  {locale.toUpperCase()}
                </a>
              </span>
            ))}
          </nav>
          <IconButton
            label={t.theme}
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              persist("pixelar.theme", next);
              setTheme(next);
            }}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>
        </div>
      </header>
      <main>
        <section className={`studio${!narrow && panelCollapsed ? " panel-collapsed" : ""}`}>
          <nav className="action-bar" aria-label={t.imageActions}>
            <IconButton className="secondary open-action" label={t.open} disabled={busy} onClick={() => fileInput.current.click()}><FolderOpen size={18} /></IconButton>
            <IconButton className="secondary paste-action" label={t.paste} disabled={busy} onClick={pasteImage}><ClipboardPaste size={18} /></IconButton>
            <span className="action-divider" />
            <IconButton
              label={t.undo}
              disabled={!history.past.length}
              onClick={() => dispatch({ type: "undo" })}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              label={t.redo}
              disabled={!history.future.length}
              onClick={() => dispatch({ type: "redo" })}
            >
              <Redo2 size={18} />
            </IconButton>
            <span className="toolbar-spacer" />
            <IconButton className="secondary copy-action" label={t.copyImage} disabled={!image || busy} onClick={copyImage}><Copy size={18} /></IconButton>
            <IconButton className="primary" label={t.exportAction} disabled={!image || busy} onClick={() => { setExportFailure(null); setExportOpen(true); }}><Download size={18} /></IconButton>
          </nav>
          <nav className="toolbar" aria-label={t.tools} aria-disabled={!image}>
            {tools.map(renderTool)}
            <div className="additional-tools" role="group" aria-label={t.additionalTools}>
              {renderTool(["text", Type, t.text, "T"])}
            </div>
            {narrow && <div className="mobile-panel-actions">
              <IconButton className="edits-action" label={t.regions} disabled={!image} aria-haspopup="dialog"
                onClick={e => openMobilePanel("edits", e.currentTarget)}><Layers size={18} /></IconButton>
              <IconButton className="settings-action" label={t.settings} disabled={!image} aria-haspopup="dialog"
                onClick={e => openMobilePanel("settings", e.currentTarget)}><SlidersHorizontal size={18} /></IconButton>
            </div>}
          </nav>
          {image && <div className="document-bar">
            <ImageIcon size={16} aria-hidden="true" />
            <span className="image-name" title={image.name}>{image.name}</span>
            <IconButton label={t.closeImage} disabled={busy} onClick={closeImage}><X size={16} /></IconButton>
          </div>}
          <div className="canvas-area" onWheelCapture={() => {
            const focused = document.activeElement;
            if (focused?.classList.contains("zoom-input")) focused.blur();
          }}>
            {image ? (
              <Editor
                image={image}
                ops={effectiveOps}
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  setSlider(null);
                }}
                onCommit={commit}
                tool={tool}
                block={block}
                diameter={diameter}
                zoom={zoom}
                setZoom={setZoom}
                viewRequest={viewRequest}
                t={t}
                theme={theme}
                textEdit={textEdit}
                onTextStart={startText}
                onTextChange={text => updateTextEdit(measureText({ ...textEditRef.current, text }))}
                onTextFinish={finishText}
                onTextCancel={() => {
                  if (!ops.some(op => op.id === textEditRef.current?.id)) setSelected(null);
                  updateTextEdit(null);
                }}
                sampleHint={image.isSample && ops.length === 0 ? t.sampleHint : null}
              />
            ) : (
              <div className="empty-state">
                <h1>{seo[lang].heading}</h1>
                <p>{t.description}</p>
                <button
                  className="primary large"
                  onClick={() => fileInput.current.click()}
                  disabled={busy}
                >
                  <Plus size={18} />
                  {t.open}
                </button>
                <span className="drop-caption">{t.drop}</span>
                <span className="format-caption">
                  {t.formats}
                  <span>·</span>
                  {t.maxSize}
                </span>
                <button
                  className="sample-link"
                  onClick={sample}
                  disabled={busy}
                >
                  {t.sample}
                  <ArrowUpRight size={14} />
                </button>
                <details className="image-guide" dangerouslySetInnerHTML={{ __html: renderGuide(lang) }} />
              </div>
            )}
            {narrow && image && <nav className="mobile-zoom-controls" aria-label={t.zoomControls}>
              <IconButton label={t.zoomOut} onClick={() => setZoom(z => Math.max(0.05, z / 1.2))}><ZoomOut size={20} /></IconButton>
              <IconButton label={t.zoomIn} onClick={() => setZoom(z => Math.min(8, z * 1.2))}><ZoomIn size={20} /></IconButton>
              <IconButton label={t.fit} onClick={() => setViewRequest(v => ({ mode: "fit", token: v.token + 1 }))}><Maximize size={20} /></IconButton>
            </nav>}
          </div>
          <div className="canvas-bottom">
            <span className="image-status">
              <span className={`status-dot ${image ? "loaded" : ""}`} />
              {image ? <>
                <span className="image-dimensions">{image.width.toLocaleString(lang)} × {image.height.toLocaleString(lang)} px</span>
              </> : t.ready}
            </span>
            {!narrow && <div className="zoom-controls">
              <IconButton
                label={t.zoomOut}
                disabled={!image}
                onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
              >
                <Minus size={14} />
              </IconButton>
              <ZoomInput zoom={zoom} setZoom={setZoom} disabled={!image} label={t.zoomPercent} />
              <IconButton
                label={t.zoomIn}
                disabled={!image}
                onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
              >
                <Plus size={14} />
              </IconButton>
              <span className="zoom-divider" />
              <IconButton
                label={t.fit}
                disabled={!image}
                onClick={() => setViewRequest(v => ({ mode: "fit", token: v.token + 1 }))}
              >
                <Maximize size={15} />
              </IconButton>
            </div>}
            {narrow && <div className="privacy-notice status-privacy" title={t.privateLong}><ShieldCheck size={19} aria-hidden="true" /><div><strong>{t.private}</strong><p>{t.privateLong}</p></div></div>}
          </div>
          {!narrow && <aside className="panel" aria-labelledby="settings-heading">
            <div className="panel-heading">
              <IconButton className="panel-toggle" type="button"
                label={panelCollapsed ? t.showInspector : t.hideInspector}
                aria-expanded={!panelCollapsed} aria-controls="settings-content"
                onClick={() => {
                  if (!panelCollapsed && slider !== null) finishSlider();
                  setPanelCollapsed(value => !value);
                }}>
                {panelCollapsed ? <PanelRightOpen size={20} aria-hidden="true" /> : <PanelRightClose size={20} aria-hidden="true" />}
              </IconButton>
            </div>
            <div id="settings-content" hidden={panelCollapsed}>{settingsPanel}{editsPanel}</div>
          </aside>}

        </section>
        <footer className="site-footer" ref={footerRef}>
          <span className="copyright">
            @pixban 2026 by {" "}
            <a href="https://juanaylola.com/" target="_blank" rel="noopener noreferrer">
              Juana y Lola
            </a>
          </span>
          <div className="app-info">
            <span className="app-version">v{APP_VERSION}</span>
            <a className="repository-link" href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer"
              title={t.githubLink} aria-label={t.githubLink}>
              <Github size={13} aria-hidden="true" />
            </a>
          </div>
          {!narrow && <div className="privacy-notice footer-privacy" title={t.privateLong}><ShieldCheck size={19} aria-hidden="true" /><div><strong>{t.private}</strong><p>{t.privateLong}</p></div></div>}
        </footer>
      </main>
      {narrow && <dialog className="settings-dialog" ref={mobileDialog}
        aria-labelledby={mobilePanel === "edits" ? "edits-heading" : "settings-heading"}
        onCancel={e => { e.preventDefault(); closeMobilePanel(); }}
        onClick={e => { if (e.target === mobileDialog.current) closeMobilePanel(); }}>
        <div className="settings-dialog-header">
          <IconButton ref={mobileCloseButton} label={mobilePanel === "edits" ? t.closeEdits : t.closeSettings} onClick={closeMobilePanel}><X size={18} /></IconButton>
        </div>
        <div id="settings-content">{mobilePanel === "edits" ? editsPanel : mobilePanel === "settings" && settingsPanel}</div>
      </dialog>}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={40} />
          <h2>{t.open}</h2>
          <p>{t.formats}</p>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <span className="spinner" />
          {copying ? t.copying : exportOpen ? t.exporting : t.loading}
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <X size={16} /> : <Check size={16} />}
          <span>{t[toast.key]}</span>
          <IconButton label={t.close} onClick={() => setToast(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={e => { e.preventDefault(); if (!busy) setExportOpen(false); }}
        onClick={(e) => {
          if (!busy && e.target === dialog.current) setExportOpen(false);
        }}
        aria-labelledby="export-title"
      >
        <div className="dialog-top">
          <span className="dialog-icon">
            <Download size={22} />
          </span>
          <IconButton label={t.close} disabled={busy} onClick={() => setExportOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <h2 id="export-title">{t.exportTitle}</h2>
        <p>{t.exportDesc}</p>
        <label className="export-label" htmlFor="export-format">{t.format}</label>
        <select id="export-format" value={format} disabled={busy}
          onChange={e => { setFormat(e.target.value); setExportFailure(null); }}>
          <option value="png">{t.png}</option>
          <option value="jpeg">{t.jpeg}</option>
          <option value="webp">{t.webp}</option>
        </select>
        <div className="export-meta">
          <ImageIcon size={15} />
          {image?.width} × {image?.height} px
          <span>
            {ops.length} {t.regionCount}
          </span>
        </div>
        <p className="export-note">{t.exportNote}</p>
        {exportFailure && <p className="export-error" role="alert">{t[exportFailure]}</p>}
        <div className="dialog-buttons">
          <button className="secondary" disabled={busy} onClick={() => setExportOpen(false)}>
            {t.cancel}
          </button>
          <button className="primary" disabled={busy} onClick={exportImage}>
            <Download size={15} />
            {t.export}
          </button>
        </div>
      </dialog>
    </div>
  );
}
