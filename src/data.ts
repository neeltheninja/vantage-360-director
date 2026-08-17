import type { Shot } from "./types";

export const STARTER_SHOTS: Shot[] = [
  {
    id: "shot-room-master",
    name: "Room master",
    yaw: 0,
    pitch: -2,
    roll: 0,
    focal: 3,
    projection: "panini",
    note: "Deep coverage across the prompt-built room",
  },
  {
    id: "shot-projection-wall",
    name: "Projection wall",
    yaw: 0,
    pitch: -3,
    roll: 0,
    focal: 18,
    projection: "panini",
    note: "Mountain display and aperture mark",
  },
  {
    id: "shot-print-wall",
    name: "Print wall",
    yaw: -76,
    pitch: -3,
    roll: 0,
    focal: 24,
    projection: "panini",
    note: "Location frames and illuminated workbench",
  },
  {
    id: "shot-optics-bench",
    name: "Optics bench",
    yaw: 76,
    pitch: -5,
    roll: 0,
    focal: 24,
    projection: "panini",
    note: "Lens studies, instruments, and blueprint wall",
  },
];

export const PROJECTIONS = [
  { id: "rectilinear", label: "360 view" },
  { id: "flat", label: "Flat image" },
] as const;
