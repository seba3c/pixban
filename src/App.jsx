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
  ChevronRight,
  X,
  Check,
  Image as ImageIcon,
  Menu,
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
  const [lang, setLang] = useState(() => pathLocale(location.pathname));
  const [theme, setTheme] = useState(() =>
    preference(
      "pixelar.theme",
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    ),
  );
  const t = messages[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 680px)").matches);
  const menuRef = useRef(), menuButton = useRef(), settingsDialog = useRef();
  useEffect(() => {
    const media = matchMedia("(max-width: 680px)");
    const change = () => { setNarrow(media.matches); setSettingsOpen(false); };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (settingsOpen) settingsDialog.current?.showModal();
    else settingsDialog.current?.close();
  }, [settingsOpen, narrow]);
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = e => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen]);
  const closeMenu = () => { setMenuOpen(false); menuButton.current?.focus(); };

  const [history, dispatch] = useReducer(historyReducer, initialHistory),
    ops = history.present;
  const [image, setImage] = useState(null),
    [tool, setTool] = useState("rect"),
    [block, setBlock] = useState(DEFAULT_BLOCK),
    [diameter, setDiameter] = useState(DEFAULT_DIAMETER),
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
        exportOpen || menuOpen || settingsOpen
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
  }, [ops, selected, exportOpen, menuOpen, settingsOpen]);
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
    setFitToken(0);
    setFormat("png");
    setSlider(null);
    setExportOpen(false);
    setToast(null);
    setDragging(false);
    setBusy(false);
    setExported("[]");
  }
  async function openFile(file, isSample = false) {
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
      setImage({ name: file.name, width: c.width, height: c.height, data, isSample });
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
          <div
            className="block-preview"
            role="img"
            aria-label={`${t.block}: ${effectiveBlock} px`}
            style={{ "--preview-cell": `${effectiveBlock / 2}px` }}
          />
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
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>{t.private}</strong>
          <p>{t.privateLong}</p>
        </div>
      </div>
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
        <section className="studio">
          <nav className="toolbar" aria-label={t.tools}>
            <div className="file-menu" ref={menuRef}>
              <button className="icon-button" ref={menuButton} aria-label={t.imageActions}
                title={t.imageActions} aria-haspopup="menu" aria-expanded={menuOpen}
                aria-controls="image-menu" onClick={() => setMenuOpen(v => !v)}
                onKeyDown={e => { if (e.key === "ArrowDown") { e.preventDefault(); setMenuOpen(true); } }}>
                <Menu size={20} />
              </button>
              {menuOpen && <div id="image-menu" role="menu" aria-label={t.imageActions}
                onKeyDown={e => {
                  const items = [...e.currentTarget.querySelectorAll('button:not(:disabled)')];
                  const i = items.indexOf(document.activeElement);
                  if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
                  if (e.key === "Tab") closeMenu();
                  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
                    e.preventDefault();
                    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 :
                      (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
                    items[next]?.focus();
                  }
                }}>
                <button role="menuitem" disabled={busy} onClick={() => { closeMenu(); fileInput.current.click(); }}><ImagePlus size={16} />{t.open}</button>
                <button role="menuitem" disabled={!image || busy} onClick={() => { closeMenu(); setExportOpen(true); }}><Download size={16} />{t.download}</button>
                <button role="menuitem" disabled={!image || busy} onClick={() => { closeMenu(); closeImage(); }}><X size={16} />{t.close}</button>
              </div>}
            </div>
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
            {narrow && <IconButton label={t.settings} onClick={() => setSettingsOpen(true)}>
              <SlidersHorizontal size={18} />
            </IconButton>}
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
            <div className="canvas-bottom">
              <span>
                <span className={`status-dot ${image ? "loaded" : ""}`} />
                {image ? <>
                  <span className="image-name" title={image.name}>{image.name}</span>
                  <span className="image-dimensions">· {image.width.toLocaleString(lang)} × {image.height.toLocaleString(lang)} px</span>
                </> : t.ready}
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
          {!narrow && <aside className="panel">{settingsPanel}</aside>}

        </section>
        <footer className="site-footer">
          <span>
            @pixban 2026 - Designed by {" "}
            <a href="https://juanaylola.com/" target="_blank" rel="noopener noreferrer">
              Juana y Lola
            </a>
          </span>
        </footer>
      </main>
      {narrow && <dialog className="settings-dialog" ref={settingsDialog}
        aria-label={t.settings} onCancel={() => setSettingsOpen(false)}
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
