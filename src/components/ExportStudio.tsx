import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  CircleNotch,
  DownloadSimple,
  FrameCorners,
  ImageSquare,
  ImagesSquare,
  MagicWand,
  PencilSimple,
  SlidersHorizontal,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";
import { getBudget, horizontalFov } from "../lib/camera";
import {
  renderExportBlob,
  type ExportScope,
  type ExportTreatment,
  type LineArtSettings,
} from "../lib/exportPipeline";
import type { ExportFormat, SamplingMode } from "../lib/extract";
import type { LensProjection, PanoramaSource, Shot } from "../types";

export type ExportRequest = {
  scope: ExportScope;
  treatment: ExportTreatment;
  projection: LensProjection;
  format: ExportFormat;
  width: number;
  height: number;
  quality: number;
  sampling: SamplingMode;
  supersample: boolean;
  seamFix: boolean;
  lineArt: LineArtSettings;
};

type ViewState = Pick<Shot, "yaw" | "pitch" | "roll" | "focal"> & { projection: LensProjection };

type ExportStudioProps = {
  source: PanoramaSource;
  shots: Shot[];
  currentView: ViewState;
  horizontalPxPerDegree: number;
  verticalPxPerDegree: number;
  exporting: boolean;
  progress: number;
  onClose: () => void;
  onExport: (request: ExportRequest) => Promise<void>;
};

const ANGLE_SIZES = [
  { id: "quick", label: "Quick", width: 1280, height: 720 },
  { id: "hd", label: "Full HD", width: 1920, height: 1080 },
  { id: "uhd", label: "4K", width: 3840, height: 2160 },
  { id: "sixk", label: "6K canvas", width: 6144, height: 3456 },
] as const;

type SizeOption = { id: string; label: string; width: number; height: number };

function uniqueSizes(sizes: SizeOption[]) {
  const dimensions = new Set<string>();
  return sizes.filter((size) => {
    const key = `${size.width}x${size.height}`;
    if (dimensions.has(key)) return false;
    dimensions.add(key);
    return true;
  });
}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2);
}

function formatMegapixels(width: number, height: number) {
  return `${((width * height) / 1_000_000).toFixed(width * height >= 1_000_000 ? 1 : 2)} MP`;
}

function formatScale(value: number) {
  return `${value.toFixed(value >= 10 ? 1 : 2)}×`;
}

export function ExportStudio({
  source,
  shots,
  currentView,
  horizontalPxPerDegree,
  verticalPxPerDegree,
  exporting,
  progress,
  onClose,
  onExport,
}: ExportStudioProps) {
  const [scope, setScope] = useState<ExportScope>("current");
  const [treatment, setTreatment] = useState<ExportTreatment>("image");
  const [projection, setProjection] = useState<LensProjection>(currentView.projection);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [sizeByScope, setSizeByScope] = useState<Record<ExportScope, string>>({
    current: "hd",
    panorama: "source",
    batch: "hd",
  });
  const [quality, setQuality] = useState(94);
  const [sampling, setSampling] = useState<SamplingMode>("lanczos");
  const [supersample, setSupersample] = useState(false);
  const [seamFix, setSeamFix] = useState(false);
  const [lineArt, setLineArt] = useState<LineArtSettings>({
    profile: "detailed",
    detail: 0.68,
    stroke: 0.38,
    background: "white",
  });
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const previewUrlRef = useRef("");

  const previewView = scope === "batch" && shots.length > 0 ? shots[0] : currentView;
  const exportViews = scope === "batch" && shots.length > 0 ? shots : [currentView];
  const sourceWidthLimit = Math.min(...exportViews.map((view) => (
    getBudget(view.focal, view.pitch, horizontalPxPerDegree, verticalPxPerDegree, 1920, 1080, projection).sourceW
  )));
  const nativeWidth = even(Math.max(64, Math.min(8192, sourceWidthLimit)));
  const nativeHeight = even(nativeWidth * 9 / 16);
  const canonicalWidth = source.height * 2;
  const canonicalHeight = source.height;
  const sizes = useMemo(() => uniqueSizes(scope === "panorama"
    ? [
      { id: "source", label: "As loaded", width: source.width, height: source.height },
      { id: "canonical", label: "2:1 canvas", width: canonicalWidth, height: canonicalHeight },
      { id: "fourk-pano", label: "4K sphere", width: 4096, height: 2048 },
      { id: "eightk-pano", label: "8K canvas", width: 8192, height: 4096 },
    ]
    : [
      { id: "native", label: "Source match", width: nativeWidth, height: nativeHeight },
      ...ANGLE_SIZES,
    ]), [canonicalHeight, canonicalWidth, nativeHeight, nativeWidth, scope, source.height, source.width]);
  const selectedSize = sizes.find((size) => size.id === sizeByScope[scope]) ?? sizes[0];
  const selectSize = (id: string) => setSizeByScope((current) => ({ ...current, [scope]: id }));
  const angleBudget = exportViews
    .map((view) => getBudget(
      view.focal,
      view.pitch,
      horizontalPxPerDegree,
      verticalPxPerDegree,
      selectedSize.width,
      selectedSize.height,
      projection,
    ))
    .reduce((worst, candidate) => candidate.upscale > worst.upscale ? candidate : worst);
  const panoramaScale = Math.max(selectedSize.width / source.width, selectedSize.height / source.height);
  const wideRectilinear = scope !== "panorama" && projection === "rectilinear" && exportViews.some((view) => horizontalFov(view.focal) > 108);
  const wideCoverage = scope !== "panorama" && exportViews.some((view) => horizontalFov(view.focal) > 90);
  const isUpscale = scope === "panorama" ? panoramaScale > 1 : angleBudget.upscale > 1;

  useEffect(() => {
    let disposed = false;
    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError("");
      const previewScale = Math.min(960 / selectedSize.width, 540 / selectedSize.height);
      const width = Math.max(64, Math.round(selectedSize.width * previewScale));
      const height = Math.max(64, Math.round(selectedSize.height * previewScale));
      void renderExportBlob({
        sourceUrl: source.url,
        scope,
        treatment,
        projection,
        view: previewView,
        width,
        height,
        format: treatment === "lineart" ? "png" : "webp",
        quality: 0.88,
        sampling,
        supersample: false,
        seamFix,
        lineArt,
      }).then((blob) => {
        if (disposed) return;
        const nextUrl = URL.createObjectURL(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = nextUrl;
        setPreviewUrl(nextUrl);
      }).catch((cause) => {
        if (!disposed) setPreviewError(cause instanceof Error ? cause.message : "Preview unavailable");
      }).finally(() => {
        if (!disposed) setPreviewLoading(false);
      });
    }, 120);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [lineArt, previewView, projection, sampling, scope, seamFix, selectedSize.height, selectedSize.width, source.url, treatment]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const outputFormat: ExportFormat = treatment === "lineart" ? "png" : format;
  const request: ExportRequest = {
    scope,
    treatment,
    projection,
    format: outputFormat,
    width: selectedSize.width,
    height: selectedSize.height,
    quality: quality / 100,
    sampling,
    supersample,
    seamFix,
    lineArt,
  };
  const itemCount = scope === "batch" ? shots.length : 1;
  const progressPercent = Math.max(0, Math.min(100, (progress / Math.max(1, shots.length)) * 100));
  const projectionName = scope === "panorama"
    ? "Equirectangular"
    : projection === "panini" ? "Natural wide" : "Perspective";

  return (
    <div className="modal-backdrop export-backdrop" role="presentation" onMouseDown={() => !exporting && onClose()}>
      <motion.section
        className="export-studio"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        initial={{ opacity: 0, scale: 0.975, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985, y: 8 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="export-studio-header">
          <div>
            <span className="section-kicker">Render studio</span>
            <h2 id="export-title">Build the deliverable</h2>
            <p>{source.name}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close export" disabled={exporting} onClick={onClose}><X size={18} /></button>
        </header>

        <div className="export-studio-body">
          <section className="export-visual-column">
            <div className="export-choice-row">
              <div className="export-choice-group">
                <span>Source</span>
                <div className="export-mode-switch export-scope-switch" aria-label="Export source">
                  <button className={scope === "current" ? "is-active" : ""} type="button" aria-pressed={scope === "current"} onClick={() => setScope("current")}><FrameCorners size={16} />Angle</button>
                  <button className={scope === "panorama" ? "is-active" : ""} type="button" aria-pressed={scope === "panorama"} onClick={() => setScope("panorama")}><ImageSquare size={16} />Full flat</button>
                  <button className={scope === "batch" ? "is-active" : ""} type="button" aria-pressed={scope === "batch"} onClick={() => setScope("batch")}><ImagesSquare size={16} />Shots <span>{shots.length}</span></button>
                </div>
              </div>
              <div className="export-choice-group">
                <span>Treatment</span>
                <div className="export-mode-switch" aria-label="Export treatment">
                  <button className={treatment === "image" ? "is-active" : ""} type="button" aria-pressed={treatment === "image"} onClick={() => setTreatment("image")}><ImageSquare size={16} />Image</button>
                  <button className={treatment === "lineart" ? "is-active" : ""} type="button" aria-pressed={treatment === "lineart"} onClick={() => setTreatment("lineart")}><PencilSimple size={16} />Line art</button>
                </div>
              </div>
            </div>

            <div className={`export-live-preview ${scope === "panorama" ? "is-panorama" : ""} ${treatment === "lineart" && lineArt.background === "transparent" ? "is-transparent" : ""}`}>
              {previewUrl && <img src={previewUrl} alt={`${projectionName} ${treatment === "lineart" ? "line-art" : "image"} preview`} />}
              {previewLoading && <div className="export-preview-state"><CircleNotch className="spin" size={22} /><span>Rendering live preview</span></div>}
              {previewError && <div className="export-preview-state is-error"><span>{previewError}</span></div>}
              <div className="preview-chrome"><span>{projectionName.toUpperCase()}</span><strong>{selectedSize.width} × {selectedSize.height}</strong></div>
              {scope !== "panorama" && <div className="preview-lens">{previewView.focal.toFixed(previewView.focal % 1 ? 1 : 0)} mm · {horizontalFov(previewView.focal).toFixed(0)}°</div>}
            </div>

            {scope === "batch" && (
              <div className="batch-filmstrip" aria-label={`${shots.length} shots queued`}>
                {shots.length ? shots.slice(0, 6).map((shot, index) => (
                  <div key={shot.id} className={index === 0 ? "is-previewed" : ""} style={{ backgroundImage: `url(${source.url})`, backgroundPosition: `${((shot.yaw + 180) / 360) * 100}% ${50 - shot.pitch * 0.35}%` }}><span>{String(index + 1).padStart(2, "0")}</span></div>
                )) : <p>Capture at least one shot to export a set.</p>}
                {shots.length > 6 && <strong>+{shots.length - 6}</strong>}
              </div>
            )}

            <div className="export-readout-grid">
              <article>
                <span>{scope === "panorama" ? "Source raster" : scope === "batch" ? "Lowest coverage" : "Source coverage"}</span>
                <strong>{scope === "panorama" ? `${source.width} × ${source.height} px` : `${Math.round(angleBudget.sourceW)} × ${Math.round(angleBudget.sourceH)} px`}</strong>
              </article>
              <article><span>Output canvas</span><strong>{formatMegapixels(selectedSize.width, selectedSize.height)}</strong></article>
              <article data-badge={scope === "panorama" ? (panoramaScale <= 1 ? "native" : panoramaScale <= 2 ? "ok" : "soft") : angleBudget.badge.toLowerCase()}>
                <span>{scope === "panorama" ? "Raster scale" : "Edge detail"}</span>
                <strong>{scope === "panorama" ? formatScale(panoramaScale) : `${angleBudget.badge} · ${formatScale(angleBudget.upscale)}`}</strong>
              </article>
            </div>

            {wideRectilinear && <div className="distortion-note"><Warning size={16} weight="fill" /><span>{scope === "batch" ? "One or more shots will stretch heavily at the edges in Perspective. Natural wide is calmer." : "Perspective is stretching the frame edges. Natural wide keeps this coverage much calmer."}</span></div>}
            <div className="export-trust-note"><Check size={16} weight="bold" /><span>{treatment === "lineart" ? "Edges are extracted after reprojection. Full-flat line art wraps across the seam and continues correctly over the poles." : "The live preview uses the final projection and sampler; download runs them at the selected resolution."}</span></div>
          </section>

          <section className="export-settings-column">
            {scope !== "panorama" && (
              <div className="export-setting-block">
                <div className="export-setting-heading"><div><strong>{scope === "batch" ? "Batch projection" : "Projection"}</strong><small>{scope === "batch" ? "Apply one projection consistently to every queued shot" : "Choose how the wide view is drawn"}</small></div></div>
                <div className="projection-options">
                  <button className={projection === "panini" ? "is-active" : ""} type="button" aria-pressed={projection === "panini"} onClick={() => setProjection("panini")}><span><strong>Natural wide</strong><small>Lower edge stretch for deep zoom-out views</small></span>{wideCoverage && <em>RECOMMENDED</em>}</button>
                  <button className={projection === "rectilinear" ? "is-active" : ""} type="button" aria-pressed={projection === "rectilinear"} onClick={() => setProjection("rectilinear")}><span><strong>Perspective</strong><small>Straight lines with conventional lens geometry</small></span></button>
                </div>
              </div>
            )}

            <div className="export-setting-block">
              <div className="export-setting-heading"><div><strong>Resolution</strong><small>{scope === "panorama" ? "Preserve the raster or fit it to a standard 2:1 canvas" : "Choose the delivery canvas"}</small></div></div>
              <div className="resolution-grid">
                {sizes.map((size) => (
                  <button key={size.id} className={selectedSize.id === size.id ? "is-active" : ""} type="button" aria-pressed={selectedSize.id === size.id} onClick={() => selectSize(size.id)}><span>{size.label}</span><strong>{size.width} × {size.height}</strong></button>
                ))}
              </div>
              {isUpscale && <p className="setting-footnote">This output exceeds the resolved source footprint. Lanczos keeps edges clean, but no new scene detail is invented.</p>}
            </div>

            {treatment === "image" ? (
              <div className="export-setting-block">
                <div className="export-setting-heading"><div><strong>Image file</strong><small>Lossless PNG is best for downstream image work</small></div></div>
                <div className="format-switch" aria-label="File format">
                  {(["png", "jpeg", "webp"] as ExportFormat[]).map((option) => <button key={option} className={format === option ? "is-active" : ""} type="button" aria-pressed={format === option} onClick={() => setFormat(option)}>{option === "jpeg" ? "JPG" : option.toUpperCase()}</button>)}
                </div>
                {format !== "png" && <label className="quality-slider"><span>Compression quality <strong>{quality}%</strong></span><input type="range" min="70" max="100" step="1" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label>}
              </div>
            ) : (
              <div className="export-setting-block lineart-settings">
                <div className="export-setting-heading"><div><strong>Line-art character</strong><small>Deterministic raster line extraction with no AI-added detail</small></div></div>
                <div className="lineart-profiles">
                  {([
                    ["structural", "Structural", "Silhouettes and major forms"],
                    ["detailed", "Detailed", "Forms, panels, and surfaces"],
                    ["maximum", "Maximum", "Dense texture and fine edges"],
                  ] as const).map(([id, label, description]) => (
                    <button key={id} className={lineArt.profile === id ? "is-active" : ""} type="button" aria-pressed={lineArt.profile === id} onClick={() => setLineArt((current) => ({ ...current, profile: id }))}><strong>{label}</strong><small>{description}</small></button>
                  ))}
                </div>
                <label className="lineart-slider"><span>Detail <strong>{Math.round(lineArt.detail * 100)}</strong></span><input type="range" min="0" max="1" step="0.01" value={lineArt.detail} onChange={(event) => setLineArt((current) => ({ ...current, detail: Number(event.target.value) }))} /></label>
                <label className="lineart-slider"><span>Stroke <strong>{Math.round(lineArt.stroke * 100)}</strong></span><input type="range" min="0" max="1" step="0.01" value={lineArt.stroke} onChange={(event) => setLineArt((current) => ({ ...current, stroke: Number(event.target.value) }))} /></label>
                <div className="format-switch lineart-background" aria-label="Line-art background">
                  {(["white", "transparent", "dark"] as LineArtSettings["background"][]).map((background) => <button key={background} className={lineArt.background === background ? "is-active" : ""} type="button" aria-pressed={lineArt.background === background} onClick={() => setLineArt((current) => ({ ...current, background }))}>{background}</button>)}
                </div>
              </div>
            )}

            <details className="export-advanced">
              <summary><SlidersHorizontal size={16} /><span><strong>Reconstruction</strong><small>Lanczos, supersampling, and seam cleanup</small></span></summary>
              <div className="export-advanced-body">
                <div className="sampling-options">
                  <button className={sampling === "lanczos" ? "is-active" : ""} type="button" aria-pressed={sampling === "lanczos"} onClick={() => setSampling("lanczos")}><Sparkle size={17} weight="fill" /><span><strong>Lanczos 3</strong><small>Sharper linear-light reconstruction</small></span><em>BEST</em></button>
                  <button className={sampling === "bicubic" ? "is-active" : ""} type="button" aria-pressed={sampling === "bicubic"} onClick={() => setSampling("bicubic")}><SlidersHorizontal size={17} /><span><strong>Bicubic</strong><small>Softer and a little faster</small></span></button>
                </div>
                <div className="export-toggle-list">
                  {scope !== "panorama" && <label><input type="checkbox" checked={supersample} onChange={(event) => setSupersample(event.target.checked)} /><span className="switch-track" aria-hidden="true"><i /></span><span><strong>4× edge supersampling</strong><small>Smoother diagonals with a slower render</small></span></label>}
                  <label><input type="checkbox" checked={seamFix} onChange={(event) => setSeamFix(event.target.checked)} /><span className="switch-track" aria-hidden="true"><i /></span><span><strong>Normalize tonal seam</strong><small>Optional exposure ramp for mismatched source edges</small></span></label>
                </div>
              </div>
            </details>
          </section>
        </div>

        <footer className="export-studio-footer">
          <div className="export-footer-summary"><MagicWand size={17} /><span><strong>{treatment === "lineart" ? "Line art PNG" : outputFormat.toUpperCase()}</strong>{itemCount} {itemCount === 1 ? "deliverable" : "deliverables"} · {projectionName}</span></div>
          {exporting && <div className={`export-progress ${scope === "batch" ? "" : "is-indeterminate"}`}><span style={scope === "batch" ? { width: `${progressPercent}%` } : undefined} /></div>}
          <button className="secondary-button" type="button" disabled={exporting} onClick={onClose}>Cancel</button>
          <button className="primary-button export-submit" type="button" disabled={exporting || (scope === "batch" && shots.length === 0)} onClick={() => void onExport(request)}>
            {exporting ? <CircleNotch size={17} className="spin" /> : <DownloadSimple size={17} weight="bold" />}
            {exporting ? (scope === "batch" ? `Rendering ${progress}/${shots.length}` : "Rendering") : scope === "batch" ? `Export ${shots.length} files` : treatment === "lineart" ? "Export line art" : scope === "panorama" ? "Export panorama" : "Export angle"}
          </button>
        </footer>
      </motion.section>
    </div>
  );
}
