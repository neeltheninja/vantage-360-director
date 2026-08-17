import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zipSync } from "fflate";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Aperture,
  ArrowCounterClockwise,
  Check,
  CircleNotch,
  CornersOut,
  Export,
  Eye,
  FileZip,
  FolderOpen,
  FrameCorners,
  Gauge,
  GridFour,
  ImagesSquare,
  ImageSquare,
  ListBullets,
  MapTrifold,
  Minus,
  Plus,
  Question,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import { STARTER_SHOTS, PROJECTIONS } from "./data";
import { DEFAULT_FOCAL, MAX_FOCAL, MIN_FOCAL, MIN_RECTILINEAR_FOCAL, formatBearing, getBudget, horizontalFov, wrapDegrees } from "./lib/camera";
import { renderExportBlob } from "./lib/exportPipeline";
import { downloadBlob } from "./lib/extract";
import { createId } from "./lib/id";
import { getPanoramaContract } from "./lib/panorama";
import { filesFromDrop, sourcesFromFiles } from "./lib/sources";
import type { Guide, LensProjection, PanoramaSource, Projection, Shot } from "./types";
import { PlanView } from "./components/PlanView";
import { BearingReadout, BudgetReadout, PitchReadout } from "./components/Readouts";
import { ExportStudio, type ExportRequest } from "./components/ExportStudio";

const SAMPLE_SOURCE: PanoramaSource = {
  id: "sample-studio",
  name: "The Color Suite",
  url: "/vantage-studio-pano.png",
  width: 1774,
  height: 887,
};

const PanoramaViewer = lazy(() =>
  import("./components/PanoramaViewer").then((module) => ({ default: module.PanoramaViewer })),
);

type LibraryTab = "images" | "shots";
type Toast = { id: string; message: string; tone: "success" | "warning" | "error" };

function clampFocal(value: number, minimum = MIN_FOCAL) {
  return Math.round(Math.max(minimum, Math.min(MAX_FOCAL, value)) * 10) / 10;
}

function focalLabel(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function IconButton({ label, active = false, onClick, children, className = "" }: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button className={`icon-button ${active ? "is-active" : ""} ${className}`} type="button" onClick={onClick} aria-label={label} aria-pressed={active} title={label}>
      {children}
    </button>
  );
}

function StripFootprint({ yaw, fov }: { yaw: MotionValue<number>; fov: number }) {
  const left = useTransform(yaw, (value) => `${((wrapDegrees(value) + 180) / 360) * 100}%`);
  return <motion.div className="strip-footprint" style={{ left, width: `${(fov / 360) * 100}%` }}><i className="grip left" /><i className="grip right" /></motion.div>;
}

function ShotThumb({ shot, sourceUrl }: { shot: Shot; sourceUrl: string }) {
  const position = `${((wrapDegrees(shot.yaw) + 180) / 360) * 100}% ${50 - shot.pitch * 0.35}%`;
  return <div className="shot-thumb" style={{ backgroundImage: `url(${sourceUrl})`, backgroundPosition: position }} />;
}

function GuideOverlay({ guide }: { guide: Guide }) {
  if (guide === "off") return null;
  return (
    <div className={`guide-overlay guide-${guide}`} aria-hidden="true">
      {guide === "thirds" && <><i /><i /><i /><i /></>}
      {guide === "centre" && <><i /><i /></>}
      {guide === "safe" && <><div className="safe-action" /><div className="safe-title" /></>}
    </div>
  );
}

function safeFilename(value: string) {
  return value.trim().replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "vantage-frame";
}

function App() {
  const yaw = useMotionValue(0);
  const pitch = useMotionValue(0);
  const roll = useMotionValue(0);
  const reduceMotion = useReducedMotion();
  const [focal, setFocal] = useState(DEFAULT_FOCAL);
  const [projection, setProjection] = useState<Projection>("rectilinear");
  const [lensProjection, setLensProjection] = useState<LensProjection>("panini");
  const [guide, setGuide] = useState<Guide>("off");
  const [sources, setSources] = useState<PanoramaSource[]>([SAMPLE_SOURCE]);
  const [activeSourceId, setActiveSourceId] = useState(SAMPLE_SOURCE.id);
  const [shotsBySource, setShotsBySource] = useState<Record<string, Shot[]>>({ [SAMPLE_SOURCE.id]: STARTER_SHOTS });
  const [selectedShot, setSelectedShot] = useState("");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("images");
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [stripDragging, setStripDragging] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const toastTimer = useRef<number | null>(null);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const sourcesRef = useRef(sources);

  const activeSource = sources.find((source) => source.id === activeSourceId) ?? sources[0];
  const shots = shotsBySource[activeSource.id] ?? [];
  const fov = horizontalFov(focal);
  const minimumFocal = lensProjection === "rectilinear" ? MIN_RECTILINEAR_FOCAL : MIN_FOCAL;
  const panorama = useMemo(() => getPanoramaContract(activeSource), [activeSource]);
  const budget = useMemo(
    () => getBudget(focal, pitch.get(), panorama.horizontalPxPerDegree, panorama.verticalPxPerDegree, 1920, 1080, lensProjection),
    [focal, lensProjection, panorama.horizontalPxPerDegree, panorama.verticalPxPerDegree, pitch],
  );
  useEffect(() => { sourcesRef.current = sources; }, [sources]);
  useEffect(() => () => {
    sourcesRef.current.forEach((source) => { if (source.objectUrl) URL.revokeObjectURL(source.url); });
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: createId("toast"), message, tone });
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      setToast(null);
    }, tone === "error" ? 5200 : 3000);
  }, []);

  const openExport = useCallback(() => {
    dismissToast();
    setExportOpen(true);
  }, [dismissToast]);

  const resetView = useCallback(() => {
    yaw.set(0); pitch.set(0); roll.set(0); setFocal(DEFAULT_FOCAL); setLensProjection("panini"); setInteracted(true);
  }, [pitch, roll, yaw]);

  const aimCamera = useCallback((nextYaw: number, nextPitch = 0, nextRoll = 0) => {
    yaw.set(nextYaw); pitch.set(nextPitch); roll.set(nextRoll); setInteracted(true);
  }, [pitch, roll, yaw]);

  const changeFocal = useCallback((direction: number) => {
    setFocal((current) => clampFocal(current * Math.pow(2, direction / 6), minimumFocal));
  }, [minimumFocal]);

  const changeFocalFromWheel = useCallback((deltaY: number) => {
    const limitedDelta = Math.max(-120, Math.min(120, deltaY));
    setFocal((current) => clampFocal(current * Math.exp(-limitedDelta * 0.0018), minimumFocal));
  }, [minimumFocal]);

  const selectSource = useCallback((source: PanoramaSource) => {
    setActiveSourceId(source.id);
    setSelectedShot("");
    setViewerReady(false);
    setProjection("rectilinear");
    setLensProjection("panini");
    resetView();
    if (window.innerWidth <= 820) setLeftOpen(false);
  }, [resetView]);

  const importFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setImporting(true);
    try {
      const result = await sourcesFromFiles(files);
      if (result.sources.length === 0) {
        const firstIssue = result.issues[0];
        showToast(firstIssue ? `${firstIssue.name}: ${firstIssue.reason}` : "No decodable images were found", "error");
        return;
      }
      setSources((current) => [...current, ...result.sources]);
      setActiveSourceId(result.sources[0].id);
      setShotsBySource((current) => ({ ...current, ...Object.fromEntries(result.sources.map((source) => [source.id, []])) }));
      setSelectedShot("");
      setLibraryTab("images");
      setLeftOpen(true);
      setRightOpen(false);
      setViewerReady(false);
      setProjection("rectilinear");
      setLensProjection("panini");
      resetView();
      const rejectedCopy = result.rejected ? ` ${result.rejected} other file${result.rejected === 1 ? "" : "s"} could not be decoded.` : "";
      showToast(`Loaded ${result.sources.length} image${result.sources.length === 1 ? "" : "s"}.${rejectedCopy}`, result.rejected ? "warning" : "success");
    } catch {
      showToast("The selected files could not be imported", "error");
    } finally {
      setImporting(false);
    }
  }, [resetView, showToast]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const directFiles = Array.from(clipboard.files);
      const files = directFiles.length > 0
        ? directFiles
        : Array.from(clipboard.items)
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      event.preventDefault();
      void importFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importFiles]);

  const selectShot = (shot: Shot) => {
    const shotProjection = shot.projection ?? "panini";
    setSelectedShot(shot.id); setFocal(clampFocal(shot.focal, shotProjection === "rectilinear" ? MIN_RECTILINEAR_FOCAL : MIN_FOCAL)); setLensProjection(shotProjection); aimCamera(shot.yaw, shot.pitch, shot.roll);
    if (window.innerWidth <= 820) setLeftOpen(false);
  };

  const captureShot = useCallback(() => {
    const currentShots = shotsBySource[activeSource.id] ?? [];
    const captured: Shot = {
      id: createId("shot"),
      name: `Frame ${String(currentShots.length + 1).padStart(2, "0")}`,
      yaw: yaw.get(), pitch: pitch.get(), roll: roll.get(), focal,
      projection: lensProjection,
      note: "Captured from current view",
    };
    setShotsBySource((current) => ({ ...current, [activeSource.id]: [...(current[activeSource.id] ?? []), captured] }));
    setSelectedShot(captured.id);
    showToast(`${captured.name} added to ${activeSource.name}`);
  }, [activeSource.id, activeSource.name, focal, lensProjection, pitch, roll, shotsBySource, showToast, yaw]);

  const cycleProjection = useCallback(() => {
    const index = PROJECTIONS.findIndex((item) => item.id === projection);
    setProjection(PROJECTIONS[(index + 1) % PROJECTIONS.length].id);
  }, [projection]);

  const cycleGuide = useCallback(() => {
    const guides: Guide[] = ["off", "thirds", "centre", "safe"];
    setGuide((current) => guides[(guides.indexOf(current) + 1) % guides.length]);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, select")) return;
      const modified = event.metaKey || event.ctrlKey || event.altKey;
      if (event.code === "Space") { event.preventDefault(); setChromeHidden(true); return; }
      if (!modified && event.key.toLowerCase() === "c") captureShot();
      if (!modified && event.key.toLowerCase() === "p") setPlanOpen((value) => !value);
      if (!modified && event.key.toLowerCase() === "g") cycleGuide();
      if (!modified && event.key.toLowerCase() === "v") cycleProjection();
      if (!modified && event.key.toLowerCase() === "r") resetView();
      if (!modified && event.key.toLowerCase() === "o") fileInput.current?.click();
      if (event.key === "?") setShortcutsOpen(true);
      if (event.key === "Escape") { setExportOpen(false); setDiagnosticsOpen(false); setShortcutsOpen(false); setPlanOpen(false); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "e") { event.preventDefault(); openExport(); }
      if (event.key === "+" || event.key === "=") changeFocal(1);
      if (event.key === "-") changeFocal(-1);
      if (event.key === "ArrowLeft") yaw.set(yaw.get() - 3);
      if (event.key === "ArrowRight") yaw.set(yaw.get() + 3);
      if (event.key === "ArrowUp") pitch.set(Math.min(89.5, pitch.get() + 3));
      if (event.key === "ArrowDown") pitch.set(Math.max(-89.5, pitch.get() - 3));
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") setChromeHidden(false); };
    const onWindowBlur = () => setChromeHidden(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [captureShot, changeFocal, cycleGuide, cycleProjection, openExport, pitch, resetView, yaw]);

  const handleStripPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    yaw.set(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 360 - 180);
  };

  const runExport = async (request: ExportRequest) => {
    const { scope, treatment, projection: outputProjection, width, height, format, quality, sampling, supersample, seamFix, lineArt } = request;
    setExporting(true); setExportProgress(0);
    try {
      const render = (view: Pick<Shot, "yaw" | "pitch" | "roll" | "focal">) => renderExportBlob({
        sourceUrl: activeSource.url,
        scope,
        treatment,
        projection: outputProjection,
        view,
        width,
        height,
        format,
        quality,
        sampling,
        supersample,
        seamFix,
        lineArt,
      });
      const extension = format === "jpeg" ? "jpg" : format;
      const treatmentSuffix = treatment === "lineart" ? "-line-art" : "";
      if (scope !== "batch") {
        const current = { yaw: yaw.get(), pitch: pitch.get(), roll: roll.get(), focal };
        const blob = await render(current);
        const viewSuffix = scope === "panorama" ? `${width}x${height}-panorama` : `${width}x${height}-${focal}mm-${outputProjection}`;
        downloadBlob(blob, `${safeFilename(activeSource.name)}-${viewSuffix}${treatmentSuffix}.${extension}`);
      } else {
        if (shots.length === 0) throw new Error("Capture at least one shot before batch export.");
        const archive: Record<string, Uint8Array> = {};
        for (let index = 0; index < shots.length; index += 1) {
          const shot = shots[index];
          const blob = await render(shot);
          archive[`${String(index + 1).padStart(2, "0")}-${safeFilename(shot.name)}${treatmentSuffix}.${extension}`] = new Uint8Array(await blob.arrayBuffer());
          setExportProgress(index + 1);
        }
        const zipped = zipSync(archive, { level: 0 });
        const copy = new Uint8Array(zipped.byteLength); copy.set(zipped);
        downloadBlob(new Blob([copy.buffer], { type: "application/zip" }), `${safeFilename(activeSource.name)}-${width}x${height}-${outputProjection}-shots${treatmentSuffix}.zip`);
      }
      setExportOpen(false);
      showToast(scope === "batch" ? `${shots.length} files downloaded as a ZIP` : treatment === "lineart" ? "Line art downloaded" : scope === "panorama" ? "Panorama downloaded" : "Angle downloaded");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Export failed", "error");
    } finally {
      setExporting(false); setExportProgress(0);
    }
  };

  return (
    <main
      className={`app-shell projection-${projection} lens-${lensProjection} ${chromeHidden ? "chrome-hidden" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDropActive(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDropActive(false); }}
      onDragEnd={() => { dragDepth.current = 0; setDropActive(false); }}
      onDrop={async (event) => { event.preventDefault(); dragDepth.current = 0; setDropActive(false); await importFiles(await filesFromDrop(event.dataTransfer)); }}
    >
      <div className="viewer-layer">
        <Suspense fallback={null}>
          <PanoramaViewer key={activeSource.id} yaw={yaw} pitch={pitch} roll={roll} focal={focal} projection={projection} lensProjection={lensProjection} sourceUrl={activeSource.url} sourceName={activeSource.name} onZoom={changeFocalFromWheel} onFirstInteract={() => setInteracted(true)} onReady={() => setViewerReady(true)} />
        </Suspense>
        <div className="viewer-vignette" />
        <GuideOverlay guide={guide} />
        {!interacted && viewerReady && <div className="interaction-hint glass-panel">Drag anywhere to look <i /> Scroll to zoom</div>}
        {!viewerReady && projection !== "flat" && <div className="viewer-loading" aria-live="polite"><CircleNotch size={20} className="spin" /><span>Loading panorama</span></div>}
      </div>

      <motion.div className="chrome-layer" animate={{ opacity: chromeHidden ? 0 : 1 }} transition={{ duration: reduceMotion ? 0 : 0.1 }} aria-hidden={chromeHidden}>
        <header className="topbar glass-panel">
          <button className="brand-block source-title-button" type="button" onClick={() => { setLibraryTab("images"); setLeftOpen(true); }}>
            <span className="brand-mark"><Aperture size={18} weight="bold" /></span>
            <span className="brand-copy">
              <span className="product-wordmark"><strong>VANTAGE</strong><em>by DASHVERSE</em></span>
              <span className="source-name">{activeSource.name}</span>
            </span>
          </button>
          <nav className="projection-switcher" aria-label="Projection mode">{PROJECTIONS.map((item) => <button key={item.id} className={projection === item.id ? "is-active" : ""} type="button" aria-pressed={projection === item.id} onClick={() => setProjection(item.id)}>{item.label}</button>)}</nav>
          <div className="top-actions"><button className="secondary-button open-button" type="button" aria-label="Add images" onClick={() => fileInput.current?.click()}><UploadSimple size={16} /><span>Add images</span></button><button className="primary-button" type="button" onClick={openExport}><Export size={16} weight="bold" />Export</button></div>
        </header>

        <AnimatePresence>
          {leftOpen ? (
            <motion.aside className="left-rail glass-panel" initial={{ x: -16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -16, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.12 }}>
              <header className="rail-tabs">
                <button className={libraryTab === "images" ? "is-active" : ""} type="button" onClick={() => setLibraryTab("images")}><ImagesSquare size={16} />Images <span>{sources.length}</span></button>
                <button className={libraryTab === "shots" ? "is-active" : ""} type="button" onClick={() => setLibraryTab("shots")}><ListBullets size={16} />Shots <span>{shots.length}</span></button>
                <button type="button" onClick={() => setPlanOpen(true)}><MapTrifold size={16} />Plan</button>
                <button className="rail-close" type="button" onClick={() => setLeftOpen(false)} aria-label="Close image library"><X size={15} /></button>
              </header>
              {libraryTab === "images" ? (
                <div className="source-library">
                  <div className="library-heading"><div><strong>Source library</strong><span>Images, folders, and ZIP archives</span></div>{importing && <CircleNotch size={15} className="spin" />}</div>
                  <div className="source-list">
                    {sources.map((source) => <button className={`source-row ${source.id === activeSource.id ? "is-selected" : ""}`} type="button" key={source.id} onClick={() => selectSource(source)}><span className="source-thumb" style={{ backgroundImage: `url(${source.url})` }} /><span className="source-copy"><strong>{source.name}</strong><small>{source.width} × {source.height}</small></span><Check size={13} className="source-valid" /></button>)}
                  </div>
                  <div className="source-actions"><button type="button" onClick={() => fileInput.current?.click()}><UploadSimple size={15} />Files or ZIP</button><button type="button" onClick={() => folderInput.current?.click()}><FolderOpen size={15} />Entire folder</button></div>
                  <div className="drop-note"><FileZip size={17} /><span>Drop a batch anywhere or paste directly from your clipboard.</span></div>
                </div>
              ) : (
                <div className="shots-panel">
                  <div className="library-heading"><div><strong>Shot list</strong><span>{activeSource.name}</span></div></div>
                  {shots.length ? <div className="shot-list">{shots.map((shot, index) => {
                    const itemBudget = getBudget(shot.focal, shot.pitch, panorama.horizontalPxPerDegree, panorama.verticalPxPerDegree, 1920, 1080, shot.projection ?? "panini");
                    return <button className={`shot-row ${selectedShot === shot.id ? "is-selected" : ""}`} type="button" key={shot.id} onClick={() => selectShot(shot)}><span className="shot-index">{String(index + 1).padStart(2, "0")}</span><ShotThumb shot={shot} sourceUrl={activeSource.url} /><span className="shot-copy"><strong>{shot.name}</strong><small>{formatBearing(shot.yaw)} <i /> {focalLabel(shot.focal)} mm</small></span><span className="mini-budget" data-badge={itemBudget.badge.toLowerCase()}>{itemBudget.badge}</span></button>;
                  })}</div> : <div className="empty-shots"><Aperture size={24} /><strong>No shots yet</strong><span>Frame the view and press Capture.</span></div>}
                  <button className="add-shot-button" type="button" onClick={captureShot}><Plus size={15} weight="bold" />Capture current view</button>
                </div>
              )}
            </motion.aside>
          ) : <motion.button className="rail-reveal left glass-panel" type="button" onClick={() => setLeftOpen(true)} aria-label="Open image library" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><ImagesSquare size={18} /></motion.button>}
        </AnimatePresence>

        <AnimatePresence>
          {rightOpen ? (
            <motion.aside className="right-rail glass-panel" initial={{ x: 16, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 16, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.12 }}>
              <header className="panel-heading inspector-heading"><div><span className="section-kicker">Inspector</span><h2>Virtual camera</h2></div><IconButton label="Close camera inspector" onClick={() => setRightOpen(false)}><X size={16} /></IconButton></header>
              <section className="inspector-section lens-section"><div className="focal-hero"><span>Coverage</span><div><strong>{budget.hFov.toFixed(0)}</strong><em>°</em></div><small>{focalLabel(focal)} mm equivalent</small></div><div className="lens-slider-row"><button type="button" onClick={() => changeFocal(-1)} aria-label="Zoom out"><Minus size={14} /></button><input aria-label="Focal length" type="range" min={minimumFocal} max={MAX_FOCAL} step="0.1" value={focal} onChange={(event) => setFocal(clampFocal(Number(event.target.value), minimumFocal))} /><button type="button" onClick={() => changeFocal(1)} aria-label="Zoom in"><Plus size={14} /></button></div><div className="lens-ticks">{(lensProjection === "panini" ? [3, 6, 12, 24, 50, 135] : [10, 12, 24, 50, 85, 135]).map((lens) => <span key={lens}>{lens}</span>)}</div></section>
              <section className="inspector-section projection-inspector"><div className="section-title"><span>Projection</span><strong>{lensProjection === "panini" ? "Natural wide" : "Perspective"}</strong></div><div className="lens-projection-switch"><button className={lensProjection === "panini" ? "is-active" : ""} type="button" aria-pressed={lensProjection === "panini"} onClick={() => setLensProjection("panini")}><strong>Natural wide</strong><small>Calmer wide edges</small></button><button className={lensProjection === "rectilinear" ? "is-active" : ""} type="button" aria-pressed={lensProjection === "rectilinear"} onClick={() => { setLensProjection("rectilinear"); setFocal((current) => clampFocal(current, MIN_RECTILINEAR_FOCAL)); }}><strong>Perspective</strong><small>Straight geometry</small></button></div></section>
              <section className="inspector-section camera-coordinates"><div><span>Yaw</span><strong><BearingReadout value={yaw} /></strong></div><div><span>Pitch</span><strong><PitchReadout value={pitch} /></strong></div><div><span>Roll</span><strong><PitchReadout value={roll} /></strong></div></section>
              <section className="inspector-section"><BudgetReadout focal={focal} pitch={pitch} horizontalPxPerDegree={panorama.horizontalPxPerDegree} verticalPxPerDegree={panorama.verticalPxPerDegree} projection={lensProjection} /></section>
              <section className="inspector-section frame-section"><div className="section-title"><span>Frame</span><strong>16:9</strong></div><div className="frame-specs"><div><FrameCorners size={15} /><span>{lensProjection === "panini" ? `${budget.hFov.toFixed(1)}° wide · ${budget.vFov.toFixed(1)}° centre` : `${budget.hFov.toFixed(1)}° × ${budget.vFov.toFixed(1)}°`}</span></div><div><ImageSquare size={15} /><span>{budget.edgeStretch.toFixed(2)}× edge</span></div></div></section>
              <section className="inspector-section source-details"><div className="section-title"><span>Source</span><strong>{panorama.limitingPxPerDegree.toFixed(1)} px/° min</strong></div><p>{activeSource.width} × {activeSource.height} pixels<br />H {panorama.horizontalPxPerDegree.toFixed(1)} · V {panorama.verticalPxPerDegree.toFixed(1)} px/°</p></section>
            </motion.aside>
          ) : <motion.button className="rail-reveal right glass-panel" type="button" onClick={() => setRightOpen(true)} aria-label="Open camera inspector" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Gauge size={18} /></motion.button>}
        </AnimatePresence>

        <div className="simple-controls glass-panel" aria-label="Viewer controls">
          <IconButton label="Zoom out" onClick={() => changeFocal(-1)}><Minus size={17} /></IconButton>
          <button className="focal-readout" type="button" onClick={() => setRightOpen(true)} aria-label={`Open camera inspector. Current lens ${focalLabel(focal)} millimeters`}>{focalLabel(focal)}<span>mm</span></button>
          <IconButton label="Zoom in" onClick={() => changeFocal(1)}><Plus size={17} /></IconButton>
          <span className="toolbar-rule" /><IconButton label="Reset view" onClick={resetView}><ArrowCounterClockwise size={17} /></IconButton><IconButton label="Cycle framing guide" active={guide !== "off"} onClick={cycleGuide}><GridFour size={17} /></IconButton><button className="capture-control" type="button" aria-label="Capture current view" title="Capture current view" onClick={captureShot}><Aperture size={17} weight="bold" /><span>Capture</span><kbd>C</kbd></button><IconButton label="Fullscreen" onClick={toggleFullscreen}><CornersOut size={17} /></IconButton><span className="toolbar-rule" /><IconButton label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)}><Question size={17} /></IconButton>
        </div>

        <section className="strip-rail glass-panel" aria-label="Equirectangular navigation strip">
          <header>
            <div><span>360° navigator</span><strong>{activeSource.width} × {activeSource.height}</strong></div>
            <div className="strip-meta">
              <span className="maker-credit">Made by <strong>Soumya Deepta Sarkar</strong></span>
              <div className="strip-legend"><i className="anchor-key" />Current frame <i className="seam-key" />Wrap seam</div>
            </div>
          </header>
          <div className={`strip-image ${stripDragging ? "is-dragging" : ""}`} style={{ backgroundImage: `url(${activeSource.url})` }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setStripDragging(true); handleStripPointer(event); }} onPointerMove={(event) => stripDragging && handleStripPointer(event)} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setStripDragging(false); }} onPointerCancel={() => setStripDragging(false)} onLostPointerCapture={() => setStripDragging(false)}><div className="strip-grid" /><div className="anchor-line"><span>0°</span></div><div className="seam-line left"><span>180°</span></div><div className="seam-line right" /><StripFootprint yaw={yaw} fov={fov} /></div>
        </section>
        <AnimatePresence>{planOpen && <PlanView yaw={yaw} fov={fov} shots={shots} onClose={() => setPlanOpen(false)} onAim={aimCamera} />}</AnimatePresence>
      </motion.div>

      <AnimatePresence>{dropActive && <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div><UploadSimple size={34} /><strong>Drop images to open</strong><span>Single files, folders, and ZIP archives are supported.</span></div></motion.div>}</AnimatePresence>
      <input ref={fileInput} className="file-input" aria-label="Panorama files" type="file" accept="image/*,.zip" multiple onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      <input ref={folderInput} className="file-input" aria-label="Panorama folder" type="file" accept="image/*" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => { void importFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
      <AnimatePresence>{toast && <motion.div key={toast.id} className="toast glass-panel" data-tone={toast.tone} role={toast.tone === "error" ? "alert" : "status"} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><span className="toast-icon">{toast.tone === "success" ? <Check size={16} weight="bold" /> : <Warning size={16} weight="fill" />}</span><span className="toast-message">{toast.message}</span><button className="toast-close" type="button" aria-label="Dismiss notification" onClick={dismissToast}><X size={14} /></button>{!reduceMotion && <motion.span className="toast-life" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: toast.tone === "error" ? 5.2 : 3, ease: "linear" }} />}</motion.div>}</AnimatePresence>

      <AnimatePresence>
        {exportOpen && <ExportStudio source={activeSource} shots={shots} currentView={{ yaw: yaw.get(), pitch: pitch.get(), roll: roll.get(), focal, projection: lensProjection }} horizontalPxPerDegree={panorama.horizontalPxPerDegree} verticalPxPerDegree={panorama.verticalPxPerDegree} exporting={exporting} progress={exportProgress} onClose={() => !exporting && setExportOpen(false)} onExport={runExport} />}
      </AnimatePresence>

      <AnimatePresence>
        {diagnosticsOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setDiagnosticsOpen(false)}>
            <motion.section className="modal diagnostics-modal" role="dialog" aria-modal="true" aria-labelledby="diagnostics-title" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.stopPropagation()}>
              <header className="modal-header"><div><span className="section-kicker">Source</span><h2 id="diagnostics-title">Panorama information</h2></div><IconButton label="Close information" onClick={() => setDiagnosticsOpen(false)}><X size={16} /></IconButton></header>
              <div className="health-score"><Gauge size={30} /><strong>360°</strong><span>{panorama.nativeAspect ? "Native 2:1 projection" : "Full-sphere edge-to-edge fit"}</span></div>
              <div className="diagnostic-grid"><article><span>Dimensions</span><strong>{activeSource.width} × {activeSource.height}</strong><small><Check size={12} />All source pixels preserved</small></article><article><span>Sampling</span><strong>{panorama.limitingPxPerDegree.toFixed(1)} px/° min</strong><small><Check size={12} />H {panorama.horizontalPxPerDegree.toFixed(1)} · V {panorama.verticalPxPerDegree.toFixed(1)}</small></article><article><span>Coverage</span><strong>360° × 180°</strong><small><Check size={12} />Edge-to-edge sphere</small></article><article><span>Wrap behavior</span><strong>Repeat</strong><small><Check size={12} />Seam-safe sampling</small></article></div>
              <footer className="modal-actions"><button className="secondary-button" type="button" onClick={() => setDiagnosticsOpen(false)}><Eye size={16} />Close</button></footer>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shortcutsOpen && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setShortcutsOpen(false)}>
            <motion.section className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => event.stopPropagation()}>
              <header className="modal-header"><div><span className="section-kicker">Keyboard</span><h2 id="shortcuts-title">Viewer shortcuts</h2></div><IconButton label="Close shortcuts" onClick={() => setShortcutsOpen(false)}><X size={16} /></IconButton></header>
              <div className="shortcut-grid">{[["Drag / arrows", "Look"], ["Scroll / double-click", "Zoom"], ["Cmd / Ctrl + V", "Paste image"], ["R", "Reset view"], ["O", "Open images"], ["C", "Capture shot"], ["P", "Toggle plan"], ["G", "Cycle guides"], ["V", "Toggle flat view"], ["Space", "Hide controls"], ["Cmd / Ctrl + E", "Export"], ["Esc", "Close panel"]].map(([key, action]) => <div key={key}><kbd>{key}</kbd><span>{action}</span></div>)}</div>
            </motion.section>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}

export default App;
