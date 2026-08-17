import { encodeCanvas, releaseProjectionCanvas, renderProjection, type ExportFormat, type SamplingMode } from "./extract";
import {
  releaseLineArtCanvas,
  renderLineArtAdaptive,
  type LineArtBackground,
  type LineArtProfile,
} from "./lineart";
import type { LensProjection } from "../types";

export type ExportScope = "current" | "panorama" | "batch";
export type ExportTreatment = "image" | "lineart";

export type ExportView = {
  yaw: number;
  pitch: number;
  roll: number;
  focal: number;
};

export type LineArtSettings = {
  profile: LineArtProfile;
  detail: number;
  stroke: number;
  background: LineArtBackground;
};

export type RenderExportOptions = {
  sourceUrl: string;
  scope: ExportScope;
  treatment: ExportTreatment;
  projection: LensProjection;
  view: ExportView;
  width: number;
  height: number;
  format: ExportFormat;
  quality: number;
  sampling: SamplingMode;
  supersample: boolean;
  seamFix: boolean;
  lineArt: LineArtSettings;
};

function stageForTracing(source: HTMLCanvasElement) {
  const staged = document.createElement("canvas");
  staged.width = source.width;
  staged.height = source.height;
  const context = staged.getContext("2d", { alpha: true });
  if (!context) throw new Error("The browser could not stage the projected image for line extraction.");
  context.drawImage(source, 0, 0);
  return staged;
}

export async function renderExportBlob(options: RenderExportOptions) {
  const projected = await renderProjection({
    sourceUrl: options.sourceUrl,
    yaw: options.view.yaw,
    pitch: options.view.pitch,
    roll: options.view.roll,
    focal: options.view.focal,
    width: options.width,
    height: options.height,
    format: options.format,
    quality: options.quality,
    seamBlend: options.seamFix ? 1 : 0,
    supersample: options.supersample,
    sampling: options.sampling,
    projection: options.scope === "panorama" ? "equirectangular" : options.projection,
  });

  try {
    if (options.treatment === "lineart") {
      const tracingSource = stageForTracing(projected);
      releaseProjectionCanvas(projected);
      try {
        const lineArt = await renderLineArtAdaptive(tracingSource, {
          ...options.lineArt,
          wrapX: options.scope === "panorama",
        });
        try {
          return await encodeCanvas(lineArt, "png", 1);
        } finally {
          releaseLineArtCanvas(lineArt);
          if (lineArt !== tracingSource) {
            lineArt.width = 1;
            lineArt.height = 1;
          }
        }
      } finally {
        tracingSource.width = 1;
        tracingSource.height = 1;
      }
    }

    return await encodeCanvas(projected, options.format, options.quality);
  } finally {
    releaseProjectionCanvas(projected);
  }
}
