/**
 * Power requirements marked up on the floor plan.
 * Stored in localStorage (and shared through sharedSync on the hosted page).
 */

export type PowerType =
  | "double"
  | "single"
  | "fused-spur"
  | "switched-spur"
  | "commando-16"
  | "commando-32"
  | "dedicated"
  | "lighting-16"
  | "dedicated-32-led"
  | "floor-box"
  | "usb"
  | "other";

export const POWER_TYPES: Record<PowerType, { label: string; code: string; colour: string }> = {
  double: { label: "Double socket", code: "DS", colour: "#dc2626" },
  single: { label: "Single socket", code: "SS", colour: "#f97316" },
  "fused-spur": { label: "Fused spur", code: "FS", colour: "#ca8a04" },
  "switched-spur": { label: "Switched fused spur", code: "SFS", colour: "#a16207" },
  "commando-16": { label: "16A commando", code: "16A", colour: "#2563eb" },
  "commando-32": { label: "32A commando", code: "32A", colour: "#1e3a8a" },
  dedicated: { label: "Dedicated circuit", code: "DC", colour: "#7c3aed" },
  "lighting-16": { label: "Lighting circuit 16A (TBD)", code: "L16", colour: "#0891b2" },
  "dedicated-32-led": { label: "Dedicated 32A circuit (LED) – 32A double socket", code: "32D", colour: "#be123c" },
  "floor-box": { label: "Floor box", code: "FB", colour: "#0f766e" },
  usb: { label: "USB socket", code: "USB", colour: "#db2777" },
  other: { label: "Other", code: "?", colour: "#475569" },
};

export const MOUNTING_OPTIONS = ["", "Low level (300 mm)", "Desk / worktop", "High level (behind display)", "Ceiling", "In floor box", "In joinery / credenza"];

export interface PowerPoint {
  id: string;
  type: PowerType;
  /** Where it is, e.g. "Check-in Zone 1 – lectern wall". */
  location: string;
  /** What it powers, e.g. "Hive A player + QM43T". */
  serves: string;
  mounting: string;
  quantity: number;
  notes: string;
  x: number;
  y: number;
  createdAt: string;
}

export interface PowerStore {
  points: PowerPoint[];
}

export const POWER_STORAGE_KEY = "multivrz_power_points_o2_v1";

export function loadPowerStore(): PowerStore {
  try {
    const raw = localStorage.getItem(POWER_STORAGE_KEY);
    if (!raw) return { points: [] };
    const parsed = JSON.parse(raw) as Partial<PowerStore>;
    const points = Array.isArray(parsed.points) ? parsed.points : [];
    // KAR-AV P2: the lighting button panels were removed; lighting is run from the ChamSys touch panel at reception.
    const fixed = points.map((point) => {
      const notes = (point.notes ?? "").replace(/(switched from |controlled via )?chamsys (wall mounted )?button (panel|controller)/i, "Controlled from the ChamSys touch panel at reception");
      return notes === point.notes ? point : { ...point, notes };
    });
    if (fixed.some((point, i) => point !== points[i])) savePowerStore({ points: fixed });
    return { points: fixed };
  } catch {
    return { points: [] };
  }
}

export function savePowerStore(store: PowerStore) {
  try {
    localStorage.setItem(POWER_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked */
  }
}

export function newPowerPointId() {
  return `pwr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
