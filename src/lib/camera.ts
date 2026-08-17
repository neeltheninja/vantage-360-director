import type { Budget, LensProjection } from "../types";

export const MIN_FOCAL = 3;
export const MIN_RECTILINEAR_FOCAL = 10;
export const MAX_FOCAL = 135;
export const DEFAULT_FOCAL = MIN_FOCAL;

export function wrapDegrees(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function horizontalFov(focal: number) {
  return (2 * Math.atan(36 / (2 * focal)) * 180) / Math.PI;
}

export function verticalFov(focal: number, aspect = 16 / 9) {
  const horizontal = horizontalFov(focal) * Math.PI / 180;
  return (2 * Math.atan(Math.tan(horizontal / 2) / aspect) * 180) / Math.PI;
}

export function projectionEdgeStretch(hFov: number, projection: LensProjection) {
  const halfAngle = Math.min(89.5, hFov / 2) * Math.PI / 180;
  if (projection === "panini") return 2 / Math.max(0.001, 1 + Math.cos(halfAngle));
  const cosine = Math.cos(halfAngle);
  return 1 / Math.max(0.001, cosine * cosine);
}

export function getBudget(
  focal: number,
  pitch: number,
  horizontalPxPerDegree = 12,
  verticalPxPerDegree = horizontalPxPerDegree,
  outputWidth = 1920,
  outputHeight = 1080,
  projection: LensProjection = "rectilinear",
): Budget {
  const hFov = horizontalFov(focal);
  const halfHFov = Math.min(89.5, hFov / 2) * Math.PI / 180;
  const projectionHalfWidth = projection === "panini"
    ? 2 * Math.tan(halfHFov / 2)
    : Math.tan(halfHFov);
  const vFov = projection === "panini"
    ? 2 * Math.atan(projectionHalfWidth / (outputWidth / outputHeight)) * 180 / Math.PI
    : verticalFov(focal, outputWidth / outputHeight);
  const cosine = Math.max(0.01, Math.cos((Math.abs(pitch) * Math.PI) / 180));
  const geometricHorizontalDensity = horizontalPxPerDegree / cosine;
  const effectivePxPerDegree =
    Math.min(horizontalPxPerDegree, verticalPxPerDegree) * Math.max(0.35, Math.min(1, Math.sqrt(cosine)));
  const sourceW = hFov * geometricHorizontalDensity;
  const sourceH = vFov * verticalPxPerDegree;
  const halfAngle = halfHFov;
  const projectionDistance = projectionHalfWidth;
  const projectionDerivative = projection === "panini"
    ? 2 / Math.max(0.001, 1 + Math.cos(halfAngle))
    : 1 / Math.max(0.001, Math.cos(halfAngle) ** 2);
  const edgeOutputPxPerDegree = (outputWidth / 2) * projectionDerivative / Math.max(0.001, projectionDistance) * Math.PI / 180;
  const horizontalSourcePerOutput = geometricHorizontalDensity / edgeOutputPxPerDegree;
  const verticalSourcePerOutput = sourceH / outputHeight;
  const upscale = 1 / Math.min(horizontalSourcePerOutput, verticalSourcePerOutput);
  const edgeStretch = projectionEdgeStretch(hFov, projection);
  let badge: Budget["badge"] = "NATIVE";
  if (upscale > 4) badge = "POOR";
  else if (upscale > 2) badge = "SOFT";
  else if (upscale > 1) badge = "OK";
  const level = Math.max(7, Math.min(100, 100 / upscale));
  return { hFov, vFov, sourceW, sourceH, upscale, effectivePxPerDegree, edgeStretch, badge, level };
}

export function crossesSeam(yaw: number, hFov: number) {
  const centreFromSeam = Math.abs(wrapDegrees(yaw - 180));
  return centreFromSeam < hFov / 2;
}

export function formatBearing(value: number) {
  const normalized = ((value % 360) + 360) % 360;
  return `${normalized.toFixed(1)}°`;
}
