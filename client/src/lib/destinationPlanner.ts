import type { CableRoute, PlanScale } from "@/components/CableRoutes";
import { sitePlanUrl } from "./floorPlanStore";
import { activeSite, isKarrinyup } from "./sites";
import type { CableRow, CableStatus, SiteDetails } from "./cableTypes";
import { classifyRackConnection } from "./rackPlanner";
import { loadCurrentCableSchedule } from "./scheduleContext";
import { areaOf } from "./areas";
import { isFieldPlug, outletDefinition, outletIdFor } from "./outlets";

export type DropGopType = "2-way GOP" | "4-way GOP" | "Multiple 4-way GOP" | "Field plug" | "Not required";

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
  /** Outlet the cables share (e.g. "GOP-CI1-01"); unset when the drop is grouped by destination. */
  outletId?: string;
  /** Network ports across the drop's GOP boxes, so spare ports show as blanks. */
  gopPorts?: number;
  /** Site area, from the first cable's destination. */
  area?: string;
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

function dropIdForOutlet(outletId: string) {
  return `outlet-${makeId(outletId)}`;
}

/** The drop a cable belongs to: its shared outlet when it has one, otherwise its destination. */
export function dropIdForCable(cable: Pick<CableRow, "cableNumber" | "destination" | "outlet">) {
  const outletId = outletIdFor(cable);
  return outletId ? dropIdForOutlet(outletId) : dropIdForDestination(cable.destination);
}

/** A cable's drop position, falling back to one placed before its drop was grouped by outlet. */
export function dropPositionForCable(positions: Record<string, DropPosition>, cable: Pick<CableRow, "cableNumber" | "destination" | "outlet">) {
  return positions[dropIdForCable(cable)] ?? positions[dropIdForDestination(cable.destination)];
}

/** Every drop's position, using a member cable's destination position for an outlet drop not placed yet. */
export function resolveDropPositions(positions: Record<string, DropPosition>, drops: DestinationDrop[]) {
  const resolved = { ...positions };
  drops.forEach((drop) => {
    if (resolved[drop.id] || !drop.outletId) return;
    const legacy = drop.cables.map((cable) => positions[dropIdForDestination(cable.destination)]).find(Boolean);
    if (legacy) resolved[drop.id] = { ...legacy, dropId: drop.id };
  });
  return resolved;
}

/** Position ids to clear when a drop is removed from the plan, including pre-outlet ones. */
export function positionIdsForDrop(drop: DestinationDrop) {
  return [drop.id, ...(drop.outletId ? drop.cables.map((cable) => dropIdForDestination(cable.destination)) : [])];
}

export function dropArea(drop: DestinationDrop) {
  return drop.area ?? areaOf(drop.label);
}

function makeId(value: string) {
  return simplifyName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unassigned";
}

export function isNetworkDrop(cable: CableRow) {
  return classifyRackConnection(cable) === "network";
}

function calculateGop(networkCableCount: number, outletId = ""): Pick<DestinationDrop, "gopType" | "gopQuantity" | "gopPorts"> {
  if (!networkCableCount) return { gopType: "Not required", gopQuantity: 0, gopPorts: 0 };
  if (isFieldPlug(outletId)) return { gopType: "Field plug", gopQuantity: 0, gopPorts: 0 };
  if (networkCableCount <= 2) return { gopType: "2-way GOP", gopQuantity: 1, gopPorts: 2 };
  if (networkCableCount <= 4) return { gopType: "4-way GOP", gopQuantity: 1, gopPorts: 4 };
  const gopQuantity = Math.ceil(networkCableCount / 4);
  return { gopType: "Multiple 4-way GOP", gopQuantity, gopPorts: gopQuantity * 4 };
}

/** Name for a drop: the destination for a single cable, otherwise the outlet and what it serves. */
function outletLabel(outletId: string, cables: CableRow[]) {
  if (cables.length === 1) return cables[0].destination.trim() || outletId;
  const description = outletDefinition(outletId)?.description
    ?? Array.from(new Set(cables.map((cable) => cable.destination.trim()).filter(Boolean))).join(" + ");
  return description ? `${outletId} · ${description}` : outletId;
}

/**
 * Cable drops for the plan. Cables sharing an outlet (one GOP box for two or more
 * cables) form one drop; other cables are grouped by destination.
 */
export function buildDestinationDrops(cables: CableRow[]): DestinationDrop[] {
  const grouped = new Map<string, { id: string; label: string; outletId?: string; cables: DestinationCable[] }>();
  cables.forEach((cable) => {
    const outletId = outletIdFor(cable);
    const label = cable.destination.trim() || "Unassigned destination";
    const key = outletId ? `outlet:${outletId}` : simplifyName(label);
    const entry = grouped.get(key) ?? { id: outletId ? dropIdForOutlet(outletId) : makeId(key), label, outletId: outletId || undefined, cables: [] };
    entry.cables.push({ ...cable, isNetwork: isNetworkDrop(cable) });
    grouped.set(key, entry);
  });

  return Array.from(grouped.values()).map((entry) => {
    const networkCableCount = entry.cables.filter((cable) => cable.isNetwork).length;
    return {
      id: entry.id,
      label: entry.outletId ? outletLabel(entry.outletId, entry.cables) : entry.label,
      cables: entry.cables,
      cableCount: entry.cables.length,
      networkCableCount,
      outletId: entry.outletId,
      area: areaOf(entry.cables[0].destination || entry.label),
      ...calculateGop(networkCableCount, entry.outletId),
      cableTypes: Array.from(new Set(entry.cables.map((cable) => cable.cableType).filter(Boolean))),
      signalTypes: Array.from(new Set(entry.cables.map((cable) => cable.signalType).filter(Boolean))),
      status: Array.from(new Set(entry.cables.map((cable) => cable.status))),
      rackLocations: Array.from(new Set(entry.cables.map((cable) => cable.patchLocation).filter(Boolean))),
    };
  }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
}

/** e.g. "1 × 2-way GOP", "1 × 2-way GOP · 1 blank", "Field plug". */
export function dropBoxLabel(drop: DestinationDrop) {
  const box = drop.gopType === "Field plug" ? "Field plug" : drop.gopQuantity ? `${drop.gopQuantity} × ${drop.gopType}` : "No GOP";
  const blanks = (drop.gopPorts ?? 0) - drop.networkCableCount;
  return blanks > 0 ? `${box} · ${blanks} blank` : box;
}

/** Box label, led by the outlet id when the drop's name does not already show it. */
export function dropGopLabel(drop: DestinationDrop) {
  return drop.outletId && !drop.label.startsWith(drop.outletId) ? `${drop.outletId} · ${dropBoxLabel(drop)}` : dropBoxLabel(drop);
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
