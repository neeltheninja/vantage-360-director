import type { Shot } from "./types";

export const STARTER_SHOTS: Shot[] = [
  {
    id: "shot-master",
    name: "Suite master",
    yaw: 0,
    pitch: -2.2,
    roll: 0,
    focal: 18,
    projection: "panini",
    note: "Full console and projection wall",
  },
  {
    id: "shot-console",
    name: "Color console",
    yaw: 4.8,
    pitch: -9.5,
    roll: 0,
    focal: 35,
    projection: "panini",
    note: "Operator position and control surface",
  },
  {
    id: "shot-left-bay",
    name: "Client bay",
    yaw: -76.4,
    pitch: -4.2,
    roll: 0,
    focal: 28,
    projection: "panini",
    note: "Sofa, desk and side practical",
  },
  {
    id: "shot-reverse",
    name: "Seam audit",
    yaw: 178.6,
    pitch: 0,
    roll: 0,
    focal: 24,
    projection: "panini",
    note: "Structural column at the wrap seam",
  },
];

export const PROJECTIONS = [
  { id: "rectilinear", label: "360 view" },
  { id: "flat", label: "Flat image" },
] as const;
