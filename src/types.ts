export type Projection = "rectilinear" | "flat";
export type LensProjection = "panini" | "rectilinear";

export type Guide = "thirds" | "centre" | "safe" | "off";

export type Shot = {
  id: string;
  name: string;
  yaw: number;
  pitch: number;
  roll: number;
  focal: number;
  projection?: LensProjection;
  note: string;
};

export type Budget = {
  hFov: number;
  vFov: number;
  sourceW: number;
  sourceH: number;
  upscale: number;
  effectivePxPerDegree: number;
  edgeStretch: number;
  badge: "NATIVE" | "OK" | "SOFT" | "POOR";
  level: number;
};

export type PanoramaSource = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  objectUrl?: boolean;
};
