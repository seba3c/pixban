import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowUpRight,
  FolderOpen,
  ClipboardPaste,
  MousePointer2,
  Square,
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
  ChevronRight,
  X,
  Check,
  Image as ImageIcon,
  PanelRightClose,
  PanelRightOpen,
  SlidersHorizontal,
  ShieldCheck,
  Layers,
  Upload,
} from "lucide-react";
import Editor from "./Editor.jsx";
import sampleCar from "./assets/sample-car.webp";
import { historyReducer, initialHistory, renderPixels } from "./engine.js";
import { messages, preference, persist } from "./i18n.js";
import { localePath, pathLocale, renderGuide, seo, updatePageMetadata } from "./seo.js";
const DEFAULT_BLOCK = 35;
const DEFAULT_DIAMETER = 45;
const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function IconButton({ label, children, className = "", ...props }) {
  return (
    <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
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
    // Two backing pixels per CSS pixel keep half-pixel cells sharp and opaque.
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    const cell = block / 2;
    // Keep the central grid intersection fixed as cells grow in every direction.
    const center = 60;
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
  return <canvas ref={ref} className="block-preview" width="240" height="240" role="img" aria-label={label} data-cell-size={block / 2} />;
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 680px)").matches);
  const settingsDialog = useRef(), settingsButton = useRef(), footerRef = useRef();
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const change = () => { setNarrow(media.matches); setSettingsOpen(false); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
    else if (settingsDialog.current?.open) {
      settingsDialog.current.close();
      settingsButton.current?.focus({ preventScroll: true });
    }
  }, [settingsOpen, narrow]);
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
    [exportOpen, setExportOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null),
    [dragging, setDragging] = useState(false),
    [exported, setExported] = useState("[]"),
    [slider, setSlider] = useState(null);
  const fileInput = useRef(),
    loadId = useRef(0),
    dialog = useRef(),
    downloadUrl = useRef(),
    dragCounter = useRef(0);
  const dirty = JSON.stringify(ops) !== exported;
  const active = ops.find((o) => o.id === selected);
  const effectiveBlock = slider ?? active?.block ?? block;
  const effectiveOps =
    slider && active
      ? ops.map((o) => (o.id === active.id ? { ...o, block: slider } : o))
      : ops;
  const commit = (next) => {
    dispatch({ type: "commit", ops: next });
  };
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
        exportOpen || settingsOpen || busy
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
        const tools = { v: "select", r: "rect", b: "brush", h: "pan" };
        if (tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ops, selected, exportOpen, settingsOpen, busy]);
  useEffect(() => {
    const handler = (event) => {
      if (event.defaultPrevented || busy || exportOpen || settingsOpen ||
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
  }, [busy, exportOpen, settingsOpen, dirty, lang]);
  function closeImage() {
    if (dirty && !window.confirm(t.closeImageConfirm)) return;
    loadId.current++;
    if (downloadUrl.current) {
      URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = null;
    }
    fileInput.current.value = "";
    dragCounter.current = 0;
    setSettingsOpen(false);
    setImage(null);
    dispatch({ type: "reset" });
    setSelected(null);
    setTool("rect");
    setBlock(DEFAULT_BLOCK);
    setDiameter(DEFAULT_DIAMETER);
    setZoom(1);
    setViewRequest({ mode: "fit", token: 0 });
    setFormat("png");
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
    if (!Object.hasOwn(IMAGE_EXTENSIONS, file.type)) {
      setToast({ error: true, key: "badFile" });
      return;
    }
    if (dirty && !window.confirm(t.discard)) return;
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
      setImage({ name: file.name || `clipboard.${IMAGE_EXTENSIONS[file.type]}`, width: c.width, height: c.height, data, isSample });
      dispatch({ type: "reset" });
      setSelected(null);
      setExported("[]");
      setTool("rect");
      setSlider(null);
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
    if (busy || exportOpen || settingsOpen) return;
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
  async function download() {
    if (!image || busy) return;
    setBusy(true);
    const snapshot = JSON.stringify(ops);
    try {
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d");
      const pixels = document.createElement("canvas");
      pixels.width = c.width;
      pixels.height = c.height;
      pixels
        .getContext("2d")
        .putImageData(
          new ImageData(
            renderPixels(image.data, image.width, image.height, ops),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      if (format === "jpeg") {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(pixels, 0, 0);
      const blob = await new Promise((resolve) =>
        c.toBlob(resolve, `image/${format}`, 0.92),
      );
      if (!blob) throw new Error("encode");
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl.current;
      a.download =
        image.name.replace(/\.[^.]+$/, "") +
        (lang === "es" ? "-pixelada" : "-pixelated") +
        (format === "jpeg" ? ".jpg" : ".png");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setExported(snapshot);
      setExportOpen(false);
      setToast({ key: "notice" });
    } catch {
      setToast({ error: true, key: "exportError" });
    } finally {
      setBusy(false);
    }
  }
  const tools = [
    ["select", MousePointer2, t.select, "V"],
    ["rect", Square, t.rect, "R"],
    ["brush", Paintbrush, t.brush, "B"],
    ["pan", Hand, t.pan, "H"],
  ];
  const finishSlider = () => {
    if (slider !== null && active && slider !== active.block)
      commit(
        ops.map((o) => (o.id === active.id ? { ...o, block: slider } : o)),
      );
    setSlider(null);
  };
  const settingsPanel = (
    <>
      <section className="settings">
        <span className="eyebrow">{active ? t.selected : t.next}</span>
        <div className="range-label">
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
          max="96"
          step="1"
          value={effectiveBlock}
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
          <span>96 px</span>
        </div>
        <div className="size-preview">
          <BlockPreview block={effectiveBlock} label={`${t.block}: ${effectiveBlock} px`} />
        </div>
          <div className="brush-settings">
            <div className="range-label">
              <label htmlFor="diameter">{t.diameter}</label>
              <output>
                {diameter}
                <small> px</small>
              </output>
            </div>
            <input
              id="diameter"
              type="range"
              min="8"
              max="240"
              value={diameter}
              onChange={(e) => setDiameter(Number(e.target.value))}
            />
            <div className="size-preview">
              <div
                className="brush-preview"
                role="img"
                aria-label={`${t.diameter}: ${diameter} px`}
              >
                <span style={{ width: diameter / 2, height: diameter / 2 }} />
              </div>
            </div>
          </div>
      </section>
      <section className="regions">
        <div className="section-title">
          <h2>
            {t.regions}
            <span>{ops.length}</span>
          </h2>
          {ops.length > 0 && (
            <IconButton
              label={t.clear}
              onClick={() => {
                if (confirm(t.clearConfirm)) {
                  commit([]);
                  setSelected(null);
                }
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
        {ops.length === 0 ? (
          <div className="regions-empty">
            <Layers size={28} strokeWidth={1.2} />
            <strong>{t.emptyRegions}</strong>
            <p>{t.emptyRegionsHint}</p>
          </div>
        ) : (
          <ol className="region-list">
            {ops.map((op, i) => (
              <li
                key={op.id}
                className={op.id === selected ? "selected" : ""}
              >
                <button
                  className="region-row"
                  onClick={() => {
                    setSelected(op.id);
                    setTool("select");
                    setSlider(null);
                  }}
                >
                  <span className="region-icon">
                    {op.kind === "rect" ? (
                      <Square size={16} />
                    ) : (
                      <Paintbrush size={16} />
                    )}
                  </span>
                  <span>
                    {op.kind === "rect" ? t.region : t.stroke} {i + 1}
                    <small>{op.block} px</small>
                  </span>
                  <ChevronRight size={14} />
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
      </section>
    </>
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
        <section className={`studio ${panelCollapsed ? "panel-collapsed" : ""}`}>
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
            <IconButton className="primary" label={t.download} disabled={!image || busy} onClick={() => setExportOpen(true)}><Download size={18} /></IconButton>
          </nav>
          <nav className="toolbar" aria-label={t.tools}>
            {tools.map(([id, Icon, label, key]) => (
              <button
                key={id}
                className={`tool tool-${id} ${tool === id ? "active" : ""}`}
                aria-label={label}
                aria-pressed={tool === id}
                title={`${label} (${key})`}
                onClick={() => {
                  setTool(id);
                  if (id !== "select") setSelected(null);
                  setSlider(null);
                }}
              >
                <Icon size={20} />
              </button>
            ))}
            {narrow && <IconButton className="settings-action" ref={settingsButton} label={t.settings} onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontal size={18} />
            </IconButton>}
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
            <span>
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
          </div>
          {!narrow && <aside className="panel">
            <div className="panel-heading">
              {!panelCollapsed && <strong>{t.settings}</strong>}
              <IconButton label={panelCollapsed ? t.expandSettings : t.collapseSettings} aria-expanded={!panelCollapsed} aria-controls="settings-content" onClick={() => setPanelCollapsed(v => !v)}>
                {panelCollapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
              </IconButton>
            </div>
            <div id="settings-content" hidden={panelCollapsed}>{settingsPanel}</div>
          </aside>}

        </section>
        <footer className="site-footer" ref={footerRef}>
          <span>
            @pixban 2026 by {" "}
            <a href="https://juanaylola.com/" target="_blank" rel="noopener noreferrer">
              Juana y Lola
            </a>
          </span>
          <div className="footer-privacy"><ShieldCheck size={19} aria-hidden="true" /><div><strong>{t.private}</strong><p>{t.privateLong}</p></div></div>
        </footer>
      </main>
      {narrow && <dialog className="settings-dialog" ref={settingsDialog}
        aria-label={t.settings} onCancel={e => { e.preventDefault(); setSettingsOpen(false); }}
        onClick={e => { if (e.target === settingsDialog.current) setSettingsOpen(false); }}>
        <div className="settings-dialog-header"><strong>{t.settings}</strong>
          <IconButton label={t.closeSettings} onClick={() => setSettingsOpen(false)}><X size={18} /></IconButton>
        </div>
        {settingsPanel}
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
          {exportOpen ? t.exporting : t.loading}
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
        onCancel={() => setExportOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setExportOpen(false);
        }}
        aria-labelledby="export-title"
      >
        <div className="dialog-top">
          <span className="dialog-icon">
            <Download size={22} />
          </span>
          <IconButton label={t.close} onClick={() => setExportOpen(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <h2 id="export-title">{t.exportTitle}</h2>
        <p>{t.exportDesc}</p>
        <label className="export-label" htmlFor="export-format">
          {t.format}
        </label>
        <select
          id="export-format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="png">{t.png}</option>
          <option value="jpeg">{t.jpeg}</option>
        </select>
        <div className="export-meta">
          <ImageIcon size={15} />
          {image?.width} × {image?.height} px
          <span>
            {ops.length} {t.regionCount}
          </span>
        </div>
        <p className="export-note">{t.exportNote}</p>
        <div className="dialog-buttons">
          <button className="secondary" onClick={() => setExportOpen(false)}>
            {t.cancel}
          </button>
          <button className="primary" disabled={busy} onClick={download}>
            <Download size={15} />
            {t.export}
          </button>
        </div>
      </dialog>
    </div>
  );
}
