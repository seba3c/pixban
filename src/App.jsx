import { useEffect, useReducer, useRef, useState } from "react";
import {
  ArrowUpRight,
  ImagePlus,
  MousePointer2,
  Scan,
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
  Trash2,
  ShieldCheck,
  ChevronRight,
  X,
  Check,
  Image as ImageIcon,
  Globe,
  Keyboard,
  Layers,
  Upload,
} from "lucide-react";
import Editor from "./Editor.jsx";
import { historyReducer, initialHistory, renderPixels } from "./engine.js";
import { messages, preference, persist } from "./i18n.js";
function IconButton({ label, children, ...props }) {
  return (
    <button className="icon-button" title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
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
  const [lang, setLang] = useState(() =>
    preference("pixelar.language", "en") === "es" ? "es" : "en",
  );
  const [theme, setTheme] = useState(() =>
    preference(
      "pixelar.theme",
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    ),
  );
  const t = messages[lang];
  const [history, dispatch] = useReducer(historyReducer, initialHistory),
    ops = history.present;
  const [image, setImage] = useState(null),
    [tool, setTool] = useState("rect"),
    [block, setBlock] = useState(16),
    [diameter, setDiameter] = useState(40),
    [selected, setSelected] = useState(null),
    [zoom, setZoom] = useState(1),
    [fitToken, setFitToken] = useState(0),
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
  const effectiveOps =
    slider && active
      ? ops.map((o) => (o.id === active.id ? { ...o, block: slider } : o))
      : ops;
  const commit = (next) => {
    dispatch({ type: "commit", ops: next });
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    persist("pixelar.language", lang);
  }, [lang]);
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
        exportOpen
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
  }, [ops, selected, exportOpen]);
  async function openFile(file) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setToast({ error: true, key: "badFile" });
      return;
    }
    if (dirty && !window.confirm(t.discard)) return;
    const id = ++loadId.current;
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const bitmap = new Image();
      bitmap.src = url;
      await bitmap.decode();
      if (bitmap.width * bitmap.height > 32e6) throw new Error("limit");
      const c = document.createElement("canvas");
      c.width = bitmap.naturalWidth;
      c.height = bitmap.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      if (id !== loadId.current) return;
      setImage({ name: file.name, width: c.width, height: c.height, data });
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
  function sample() {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const ctx = c.getContext("2d");
    const sky = ctx.createLinearGradient(0, 0, 0, 800);
    sky.addColorStop(0, "#e6b18b");
    sky.addColorStop(0.52, "#f3d9af");
    sky.addColorStop(0.53, "#577e7c");
    sky.addColorStop(1, "#183e48");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 1200, 800);
    ctx.fillStyle = "#fff0c8";
    ctx.beginPath();
    ctx.arc(820, 235, 64, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `rgba(255,230,180,${0.08 + (i % 4) * 0.025})`;
      ctx.fillRect(550 + (i % 7) * 29, 440 + i * 4, 270 - (i % 6) * 23, 2);
    }
    ctx.fillStyle = "#3a5451";
    ctx.beginPath();
    ctx.moveTo(0, 430);
    ctx.lineTo(160, 270);
    ctx.lineTo(380, 445);
    ctx.lineTo(0, 560);
    ctx.fill();
    ctx.fillStyle = "#213d3e";
    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.lineTo(180, 500);
    ctx.lineTo(380, 550);
    ctx.lineTo(650, 800);
    ctx.lineTo(0, 800);
    ctx.fill();
    ctx.save();
    ctx.translate(870, 540);
    ctx.rotate(-0.08);
    ctx.fillStyle = "#fcf6e8";
    ctx.shadowColor = "#0005";
    ctx.shadowBlur = 24;
    ctx.fillRect(-140, -60, 280, 160);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#38454a";
    ctx.font = "14px sans-serif";
    ctx.fillText("A NOTE TO MYSELF", -115, -30);
    ctx.font = "bold 23px sans-serif";
    ctx.fillText("Private details", -115, 8);
    ctx.font = "18px monospace";
    ctx.fillText("hello@example.com", -115, 45);
    ctx.restore();
    c.toBlob((blob) =>
      openFile(
        new File(
          [blob],
          lang === "en" ? "Coastal afternoon.png" : "Tarde en la costa.png",
          { type: "image/png" },
        ),
      ),
    );
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
    ["rect", Scan, t.rect, "R"],
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
          pixelar<span className="brand-dot">.</span>
        </a>
        <span className="header-divider" />
        <span className="header-caption">{t.about}</span>
        <div className="header-actions">
          <label className="language-picker">
            <Globe size={14} />
            <select
              aria-label={t.language}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
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
          <span className="header-divider" />
          <span className="local-badge">
            <i />
            {t.private}
          </span>
        </div>
      </header>
      <main>
        <section className="workspace-header">
          <div>
            <span className="eyebrow">{t.workspace}</span>
            <h1>{image ? image.name : t.intro}</h1>
          </div>
          <div className="workspace-actions">
            <button
              className="secondary"
              onClick={() => fileInput.current.click()}
              disabled={busy}
            >
              <ImagePlus size={16} />
              {image ? t.change : t.open}
            </button>
            <button
              className="primary"
              disabled={!image || busy}
              onClick={() => setExportOpen(true)}
            >
              <Download size={16} />
              {t.download}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </section>
        <section className="studio">
          <nav className="toolbar" aria-label={t.tools}>
            {tools.map(([id, Icon, label, key]) => (
              <button
                key={id}
                className={`tool ${tool === id ? "active" : ""}`}
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
                <span>{label}</span>
                <kbd>{key}</kbd>
              </button>
            ))}
            <span className="toolbar-spacer" />
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
          </nav>
          <div className="canvas-area">
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
                fitToken={fitToken}
                t={t}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-art" aria-hidden="true">
                  <div className="picture-card">
                    <div className="art-sun" />
                    <div className="art-mountain" />
                    <div className="mosaic">
                      {Array.from({ length: 20 }, (_, i) => (
                        <i key={i} />
                      ))}
                    </div>
                  </div>
                  <span className="art-chip">
                    <Scan size={18} />
                  </span>
                  <span className="art-spark">+</span>
                </div>
                <h2>
                  {t.tagline}
                  <br />
                  <em>{t.tagline2}</em>
                </h2>
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
              </div>
            )}
            <div className="canvas-bottom">
              <span>
                <span className={`status-dot ${image ? "loaded" : ""}`} />
                {image
                  ? `${image.width.toLocaleString(lang)} × ${image.height.toLocaleString(lang)} px`
                  : t.ready}
              </span>
              <div className="zoom-controls">
                <IconButton
                  label={t.zoomOut}
                  disabled={!image}
                  onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}
                >
                  <Minus size={14} />
                </IconButton>
                <span>{image ? `${Math.round(zoom * 100)}%` : "—"}</span>
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
                  onClick={() => setFitToken((n) => n + 1)}
                >
                  <Maximize size={15} />
                </IconButton>
              </div>
            </div>
          </div>
          <aside className="panel">
            <section className="settings">
              <span className="eyebrow">{active ? t.selected : t.next}</span>
              <div className="range-label">
                <label htmlFor="block">{t.block}</label>
                <output>
                  {slider ?? active?.block ?? block}
                  <small> px</small>
                </output>
              </div>
              <input
                id="block"
                type="range"
                min="4"
                max="96"
                step="1"
                value={slider ?? active?.block ?? block}
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
              <div className="block-preview" aria-hidden="true">
                {Array.from({ length: 18 }, (_, i) => (
                  <i key={i} style={{ opacity: 0.2 + (i % 5) * 0.16 }} />
                ))}
              </div>
              {tool === "brush" && (
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
                </div>
              )}
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
                            <Scan size={16} />
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
            <div className="privacy-card">
              <ShieldCheck size={19} />
              <div>
                <strong>{t.private}</strong>
                <p>{t.privateLong}</p>
              </div>
            </div>
          </aside>
        </section>
        <footer>
          <span>
            <Keyboard size={14} />
            {t.shortcuts}
          </span>
          <span>
            {t.support}
            <ShieldCheck size={13} />
          </span>
        </footer>
      </main>
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
