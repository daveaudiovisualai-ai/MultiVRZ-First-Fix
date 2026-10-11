import type { CableRoute, PlanScale } from "@/components/CableRoutes";
import { sitePlanUrl } from "./floorPlanStore";
import { activeSite, isKarrinyup } from "./sites";
import type { CableRow, CableStatus, SiteDetails } from "./cableTypes";
import { classifyRackConnection } from "./rackPlanner";
import { loadCurrentCableSchedule } from "./scheduleContext";

export type DropGopType = "2-way GOP" | "4-way GOP" | "Multiple 4-way GOP" | "Not required";

export interface DestinationCable extends CableRow {
  isNetwork: boolean;
}

export interface DestinationDrop {
  id: string;
  label: string;
  cables: DestinationCable[];
  cableCount: number;
  networkCableCount: number;
  gopType: DropGopType;
  gopQuantity: number;
  cableTypes: string[];
  signalTypes: string[];
  status: CableStatus[];
  rackLocations: string[];
}

export interface DropPosition {
  dropId: string;
  x: number;
  y: number;
}

export interface DrawingDocument {
  id: string;
  fileName: string;
  mimeType: string;
  source: string;
  uploadedAt: string;
}

/** Device details for a drop (used for CCTV cameras and wireless access points). */
export interface DropDevice {
  type?: string;
  model?: string;
  notes?: string;
}

export interface DestinationPlannerStore {
  drawing?: DrawingDocument;
  hideDefaultDrawing?: boolean;
  positions: Record<string, DropPosition>;
  devices?: Record<string, DropDevice>;
  /** Rough cable routes drawn on the plan. */
  routes?: CableRoute[];
  /** Real width of the plan, for route lengths. */
  scale?: PlanScale;
}

// Default plan: Associated Projects floor layout, Multi VRZ Karrinyup WA (22 September 2026).
const KARRINYUP_CABLE_DROP_DRAWING: DrawingDocument = {
  id: "karrinyup-floor-plan-2026-09-22",
  fileName: "Multi VRZ Karrinyup WA floor plan",
  mimeType: "image/png",
  source: "assets/karrinyup-floor-plan.png",
  uploadedAt: "2026-09-28T00:00:00.000Z",
};

function simplifyName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The drop id a cable's destination maps to on the plan. */
export function dropIdForDestination(destination: string) {
  return makeId(destination.trim() || "Unassigned destination");
}

function makeId(value: string) {
  return simplifyName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unassigned";
}

export function isNetworkDrop(cable: CableRow) {
  return classifyRackConnection(cable) === "network";
}

function calculateGop(networkCableCount: number): Pick<DestinationDrop, "gopType" | "gopQuantity"> {
  if (!networkCableCount) return { gopType: "Not required", gopQuantity: 0 };
  if (networkCableCount <= 2) return { gopType: "2-way GOP", gopQuantity: 1 };
  if (networkCableCount <= 4) return { gopType: "4-way GOP", gopQuantity: 1 };
  return { gopType: "Multiple 4-way GOP", gopQuantity: Math.ceil(networkCableCount / 4) };
}

export function buildDestinationDrops(cables: CableRow[]): DestinationDrop[] {
  const grouped = new Map<string, { label: string; cables: DestinationCable[] }>();
  cables.forEach((cable) => {
    const label = cable.destination.trim() || "Unassigned destination";
    const key = simplifyName(label);
    const entry = grouped.get(key) ?? { label, cables: [] };
    entry.cables.push({ ...cable, isNetwork: isNetworkDrop(cable) });
    grouped.set(key, entry);
  });

  return Array.from(grouped.entries()).map(([key, entry]) => {
    const networkCableCount = entry.cables.filter((cable) => cable.isNetwork).length;
    return {
      id: makeId(key),
      label: entry.label,
      cables: entry.cables,
      cableCount: entry.cables.length,
      networkCableCount,
      ...calculateGop(networkCableCount),
      cableTypes: Array.from(new Set(entry.cables.map((cable) => cable.cableType).filter(Boolean))),
      signalTypes: Array.from(new Set(entry.cables.map((cable) => cable.signalType).filter(Boolean))),
      status: Array.from(new Set(entry.cables.map((cable) => cable.status))),
      rackLocations: Array.from(new Set(entry.cables.map((cable) => cable.patchLocation).filter(Boolean))),
    };
  }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

export function defaultDropPosition(index: number, count: number): DropPosition {
  const cols = Math.max(4, Math.ceil(Math.sqrt(Math.max(count, 1)) * 1.75));
  const col = index % cols;
  const row = Math.floor(index / cols);
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    dropId: "",
    x: 9 + (col / Math.max(1, cols - 1)) * 82,
    y: 12 + (row / Math.max(1, rows - 1)) * 75,
  };
}

export function destinationStorageKey(scope: string) {
  return `multivrz_destination_drops_${scope}_v1`;
}

const SITE_PLAN_DRAWING_ID = "site-floor-plan";

/** The open site's floor plan (Karrinyup's is built in; other sites upload theirs). */
export function defaultDrawingForSite(): DrawingDocument | undefined {
  if (isKarrinyup()) return KARRINYUP_CABLE_DROP_DRAWING;
  const site = activeSite();
  const source = sitePlanUrl(site);
  return site.floorPlan && source ? { id: SITE_PLAN_DRAWING_ID, fileName: site.floorPlan.fileName, mimeType: "image/jpeg", source, uploadedAt: site.createdAt } : undefined;
}

export function loadDestinationPlannerStore(scope: string): DestinationPlannerStore {
  try {
    const raw = localStorage.getItem(destinationStorageKey(scope));
    const siteDrawing = scope === "o2" ? defaultDrawingForSite() : undefined;
    if (!raw) return { drawing: siteDrawing, positions: {} };
    const parsed = JSON.parse(raw) as Partial<DestinationPlannerStore>;
    return {
      drawing: parsed.drawing ?? (!parsed.hideDefaultDrawing ? siteDrawing : undefined),
      hideDefaultDrawing: parsed.hideDefaultDrawing,
      positions: parsed.positions ?? {},
      devices: parsed.devices ?? {},
      routes: parsed.routes ?? [],
      scale: parsed.scale,
    };
  } catch {
    return { positions: {} };
  }
}

export function saveDestinationPlannerStore(scope: string, store: DestinationPlannerStore) {
  try {
    // The site's own plan is read from the site library, not saved with the drops.
    const toSave = store.drawing?.id === SITE_PLAN_DRAWING_ID ? { ...store, drawing: undefined } : store;
    localStorage.setItem(destinationStorageKey(scope), JSON.stringify(toSave));
  } catch {
    // File data can exceed a browser's localStorage quota; callers surface an actionable notice.
  }
}

export function loadDestinationSchedule() {
  const schedule = loadCurrentCableSchedule();
  return { ...schedule, drops: buildDestinationDrops(schedule.cables) };
}
