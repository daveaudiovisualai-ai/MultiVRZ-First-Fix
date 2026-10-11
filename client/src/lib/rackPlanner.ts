import { activeSite, isKarrinyup } from "./sites";
import { defaultCablesForSite, defaultSiteDetailsForSite } from "./siteDefaults";
import { readStoredCables } from "./scheduleStorage";
import { getUrlParams } from "@/lib/urlParams";
import type { CableRow, SiteDetails } from "./cableTypes";
import { O2_CABLES, O2_SEED_SITE } from "./seedDataO2";
import {
  readCableScheduleProjectContext,
  siteDetailsForProject,
  storageKeyForProject,
} from "./cableScheduleHandoff";
import { FIBRE_PROVISION } from "./fibreProvision";

export type RackConnectionKind = "network" | "speaker" | "dmx" | "fibre";
export type RackPanelKind = RackConnectionKind | "management" | "entry" | "lighting" | "spare";
export type RackConnector = "rj45" | "speakon" | "xlr5" | "xlrBlank" | "blank" | "fibre";

export interface RackCircuit extends CableRow {
  kind: RackConnectionKind;
  /** True when the port is allocated on the rack but the cable is not yet in the schedule. */
  planned?: boolean;
  /** Panel and connector this circuit terminates on, e.g. "DMX 01 · Connector 1". */
  portRef?: string;
}

interface PortDesignation {
  destination: string;
  cableType: string;
  signalType: string;
}

/** Fixed connector allocations, left to right. Index 0 = connector 1. */
export const PORT_DESIGNATIONS: Record<string, PortDesignation[]> = {
  "audio-01": [
    "Vortex Front Left",
    "Vortex Centre Front",
    "Vortex Front Right",
    "Vortex Centre Left",
    "Vortex Centre Right",
    "Vortex Rear Left",
    "Vortex Rear Right",
    "Sub",
  ].map((destination) => ({ destination, cableType: "Speaker cable (type TBC)", signalType: "Speakon" })),
  "dmx-01": [
    "Reception",
    "Vortex",
    "Foyer 1",
    "Foyer 2",
    "Check in 1",
    "Check in 2",
    "Check in 3",
    "Briefing Room 1",
    "Briefing Room 2",
    "Briefing Room 3",
  ].map((destination) => ({ destination, cableType: "5 core screened", signalType: "DMX" })),
  "fibre-vortex": [
    "Vortex entry doors",
    "Vortex exit doors",
  ].map((destination) => ({ destination, cableType: "LC–LC OM4 fibre", signalType: "Fibre" })),
};

function normaliseName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Take the schedule circuit whose destination matches a designated connector,
 * removing it from the pool so it is not placed twice.
 */
function takeMatching(pool: RackCircuit[], destination: string): RackCircuit | undefined {
  const target = normaliseName(destination);
  const index = pool.findIndex((circuit) => normaliseName(circuit.destination) === target);
  return index === -1 ? undefined : pool.splice(index, 1)[0];
}

/**
 * Build a panel's ports: designated connectors take the matching schedule cable
 * (or show as planned); undesignated connectors take remaining cables in order.
 */
/** Cables pinned to a specific panel and port, keyed by panel id then port index. */
type ExplicitPorts = Map<string, Map<number, RackCircuit>>;
let explicitPorts: ExplicitPorts = new Map();

function parseRackPort(value?: string): { panelId: string; index: number } | null {
  const match = value?.trim().match(/^([a-z0-9-]+):(\d+)$/i);
  return match ? { panelId: match[1].toLowerCase(), index: Number(match[2]) - 1 } : null;
}

function pinned(panelId: string, index: number) {
  return explicitPorts.get(panelId)?.get(index);
}

function allocatePorts(
  panelId: string,
  panelName: string,
  kind: RackConnectionKind,
  count: number,
  pool: RackCircuit[],
  undesignatedPool: RackCircuit[] = pool
): (RackCircuit | undefined)[] {
  const custom = activeSite().connectorNames;
  const designations = (custom ? custom[panelId] : isKarrinyup() ? PORT_DESIGNATIONS[panelId] : undefined) ?? [];
  const result: (RackCircuit | undefined)[] = [];
  for (let index = 0; index < count; index += 1) {
    const portRef = `${panelName} · Connector ${index + 1}`;
    const designation = designations[index];
    const fixed = pinned(panelId, index);
    if (fixed) {
      result.push({ ...fixed, portRef });
    } else if (designation) {
      const matched = takeMatching(pool, designation.destination);
      result.push(
        matched
          ? { ...matched, portRef }
          : {
              id: `planned-${panelId}-${index + 1}`,
              cableNumber: "TBC",
              cableType: designation.cableType,
              signalType: designation.signalType,
              source: `Rack · ${portRef}`,
              destination: designation.destination,
              length: "",
              patchLocation: "",
              status: "Pending",
              notes: "Allocated on the rack. Not yet in the cable schedule.",
              kind,
              planned: true,
              portRef,
            }
      );
    } else {
      const next = undesignatedPool.shift();
      result.push(next ? { ...next, portRef } : undefined);
    }
  }
  return result;
}

export interface RackPort {
  connector: RackConnector;
  circuit?: RackCircuit;
  label: string;
  note?: string;
}

export interface RackPanel {
  id: string;
  unit: number;
  kind: RackPanelKind;
  label: string;
  shortLabel: string;
  capacity: number;
  circuits: RackCircuit[];
  ports?: RackPort[];
  provisionedPorts?: number;
  note: string;
}

export interface RackPart {
  category: "Rack" | "Network" | "Speaker" | "DMX" | "Lighting" | "Fibre" | "Labelling";
  item: string;
  specification: string;
  quantity: number;
  unit: string;
  required: boolean;
}

export interface RackPlan {
  site: SiteDetails;
  cables: CableRow[];
  panels: RackPanel[];
  overflowPanels: RackPanel[];
  parts: RackPart[];
  counts: Record<RackConnectionKind, number>;
  representedAtU3: { speaker: number; dmx: number; fibre: number };
  usedU: number;
  capacityU: number;
  isProjectSchedule: boolean;
}

interface SavedSchedule {
  site: SiteDetails;
  cables: CableRow[];
}

const DEFAULT_CABLE_STORAGE_KEY = "multivrz_o2_cable_schedule_v4";
/** Rack layout, top to bottom. U2–U1 are left free for expansion. */
export const RACK_UNITS = {
  capacity: 15,
  network: [15, 14, 13, 12, 11],
  management: 10,
  entry: 9,
  audio: [8, 7],
  dmx: [6, 5],
  fibre: 4,
  lighting: 3,
} as const;
/** Keystone panels always fitted, even before every port has a cable (panel 05 is for CCTV, WAPs, touch panels, Auri units etc.). */
export const MIN_NETWORK_PANELS = 5;
const RACK_CAPACITY_U = RACK_UNITS.capacity;
const NETWORK_PANEL_UNITS: readonly number[] = RACK_UNITS.network;

function safelyRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function stringIncludes(value: string, terms: string[]) {
  const normalised = value.toLowerCase();
  return terms.some((term) => normalised.includes(term));
}

export function classifyRackConnection(cable: CableRow): RackConnectionKind | null {
  const type = cable.cableType || "";
  const signal = cable.signalType || "";

  if (stringIncludes(type, ["fibre", "fiber"]) || stringIncludes(signal, ["fibre", "fiber"])) return "fibre";
  if (stringIncludes(type, ["xlr 5", "5-pin", "5 pin"]) || stringIncludes(signal, ["dmx", "dali"])) return "dmx";
  if (stringIncludes(type, ["cat5", "cat6", "cat7", "cat8"]) || stringIncludes(signal, ["network", "cat", "rj45", "dante", "aoip"])) return "network";
  if (stringIncludes(type, ["speaker", "xlr 3", "3-pin", "3 pin"]) || stringIncludes(signal, ["audio", "xlr", "speakon"])) return "speaker";
  return null;
}

function networkPanels(cables: RackCircuit[]): RackPanel[] {
  // Pinned cables take their own port; the rest fill free ports in schedule order.
  let pinnedCount = 0;
  let maxPinnedPanel = 0;
  explicitPorts.forEach((ports, panelId) => {
    const m = panelId.match(/^network-(\d+)$/);
    if (m) {
      pinnedCount += ports.size;
      maxPinnedPanel = Math.max(maxPinnedPanel, Number(m[1]));
    }
  });
  const panelCount = Math.max(MIN_NETWORK_PANELS, maxPinnedPanel, Math.ceil((cables.length + pinnedCount) / 24));
  const slots: (RackCircuit | undefined)[][] = Array.from({ length: panelCount }, (_, p) =>
    Array.from({ length: 24 }, (_, i) => pinned(`network-${p + 1}`, i))
  );
  const queue = [...cables];
  for (const panel of slots) for (let i = 0; i < 24 && queue.length; i += 1) if (!panel[i]) panel[i] = queue.shift();
  while (queue.length) slots.push(Array.from({ length: 24 }, () => queue.shift()));
  return slots.map((panelSlots, index) => {
    const circuits = panelSlots.filter((c): c is RackCircuit => Boolean(c));
    const number = index + 1;
    return {
      id: `network-${number}`,
      unit: NETWORK_PANEL_UNITS[index] ?? 0,
      kind: "network",
      label: `24-way Cat6A Keystone Patch Panel ${String(number).padStart(2, "0")}`,
      shortLabel: `CAT6A / RJ45 ${String(number).padStart(2, "0")}`,
      capacity: 24,
      circuits,
      ports: Array.from({ length: 24 }, (_, portIndex) => ({
        connector: "rj45",
        circuit: panelSlots[portIndex] && { ...panelSlots[portIndex]!, portRef: `Cat6A / RJ45 ${String(number).padStart(2, "0")} · Port ${portIndex + 1}` },
        label: String(portIndex + 1),
      })),
      note: "Unloaded 24-way panel fitted with Cat6A shielded keystone jacks.",
    };
  });
}

function audioPanel(number: number, unit: number, pool: RackCircuit[]): RackPanel {
  const id = String(number).padStart(2, "0");
  const slots = allocatePorts(`audio-${id}`, `Audio ${id}`, "speaker", 12, pool);
  return {
    id: `audio-${id}`,
    unit,
    kind: "speaker",
    label: `12-way SpeakON Audio Panel ${id}`,
    shortLabel: `AUDIO ${id}`,
    capacity: 12,
    circuits: slots.filter((c): c is RackCircuit => Boolean(c)),
    ports: slots.map((circuit, index) => ({
      connector: "speakon" as const,
      circuit,
      label: String(index + 1),
      note: circuit ? circuit.destination : "SpeakON spare",
    })),
    note: "1U D-series panel fitted with 12 × SpeakON chassis connectors.",
  };
}

function dmxPanel(number: number, unit: number, pool: RackCircuit[]): RackPanel {
  const id = String(number).padStart(2, "0");
  const slots = allocatePorts(`dmx-${id}`, `DMX ${id}`, "dmx", 12, pool);
  return {
    id: `dmx-${id}`,
    unit,
    kind: "dmx",
    label: `12-way 5-pin XLR DMX Panel ${id}`,
    shortLabel: `DMX ${id}`,
    capacity: 12,
    circuits: slots.filter((c): c is RackCircuit => Boolean(c)),
    ports: slots.map((circuit, index) => ({
      connector: "xlr5" as const,
      circuit,
      label: String(index + 1),
      note: circuit ? circuit.destination : "5-pin XLR spare",
    })),
    note: "1U D-series panel fitted with 12 × 5-pin XLR chassis connectors.",
  };
}

function fibreVortexPanel(unit: number, pool: RackCircuit[]): RackPanel {
  // Fibre connectors only take designated or destination-matched routes.
  const slots = allocatePorts("fibre-vortex", "Fibre / Vortex", "fibre", FIBRE_PROVISION.quantity, pool, []).map((circuit) =>
    circuit?.planned ? { ...circuit, length: `${FIBRE_PROVISION.lengthMetres}m`, notes: `${FIBRE_PROVISION.lengthMetres} m LC–LC OM4 BIMMF pre-terminated link. ${circuit.notes}` } : circuit
  );
  const ports: RackPort[] = [
    ...slots.map((circuit, index) => ({
      connector: "fibre" as const,
      circuit,
      label: `LC${index + 1}`,
      note: circuit ? circuit.destination : `${FIBRE_PROVISION.lengthMetres} m LC–LC OM4 fibre link ${index + 1}`,
    })),
    ...Array.from({ length: 12 - FIBRE_PROVISION.quantity }, (_, index) => ({
      connector: "blank" as const,
      label: "",
      note: `Blank position ${FIBRE_PROVISION.quantity + index + 1}`,
    })),
  ];
  return {
    id: "fibre-vortex",
    unit,
    kind: "fibre",
    label: "Fibre / Vortex D-Series Panel",
    shortLabel: "FIBRE / VORTEX",
    capacity: 12,
    circuits: slots.filter((c): c is RackCircuit => Boolean(c)),
    provisionedPorts: FIBRE_PROVISION.quantity,
    ports,
    note: `${FIBRE_PROVISION.quantity} × ${FIBRE_PROVISION.lengthMetres} m LC–LC OM4 fibre feedthroughs for the Vortex Snow Box; remaining positions blanked.`,
  };
}

function lightingPanel(unit: number): RackPanel {
  return {
    id: "lighting",
    unit,
    kind: "lighting",
    label: "Lighting Provision Panel — Blank XLR Positions",
    shortLabel: "LIGHTING / SPARE",
    capacity: 12,
    circuits: [],
    ports: Array.from({ length: 12 }, (_, index) => ({
      connector: "xlrBlank",
      label: `LIGHT ${index + 1}`,
      note: "Empty XLR D-series lighting provision",
    })),
    note: "Lighting provision: 12 empty XLR D-series positions retained for future lighting connections.",
  };
}

/** Fixed panels below the keystone panels (units from RACK_UNITS). */
function fixedInfrastructure(speaker: RackCircuit[], dmx: RackCircuit[], fibre: RackCircuit[]): RackPanel[] {
  // Pools are consumed as connectors are allocated, top panel first.
  const speakerPool = [...speaker];
  const dmxPool = [...dmx];
  const fibrePool = [...fibre];
  return [
    {
      id: "management",
      unit: RACK_UNITS.management,
      kind: "management",
      label: "Horizontal Cable Manager",
      shortLabel: "CABLE MANAGEMENT",
      capacity: 0,
      circuits: [],
      note: "Cable dressing and strain-relief zone.",
    },
    {
      id: "entry",
      unit: RACK_UNITS.entry,
      kind: "entry",
      label: "Brush Cable Entry Panel",
      shortLabel: "CABLE ENTRY",
      capacity: 0,
      circuits: [],
      note: "Cable entry and service-loop transition.",
    },
    audioPanel(1, RACK_UNITS.audio[0], speakerPool),
    audioPanel(2, RACK_UNITS.audio[1], speakerPool),
    dmxPanel(1, RACK_UNITS.dmx[0], dmxPool),
    dmxPanel(2, RACK_UNITS.dmx[1], dmxPool),
    fibreVortexPanel(RACK_UNITS.fibre, fibrePool),
    lightingPanel(RACK_UNITS.lighting),
  ];
}

function planParts(counts: Record<RackConnectionKind, number>, fittedU: number): RackPart[] {
  const networkPanelCount = Math.max(MIN_NETWORK_PANELS, Math.ceil(counts.network / 24));
  const parts: RackPart[] = [
    {
      category: "Rack",
      item: `${RACK_UNITS.capacity}U shallow wall-mount equipment rack`,
      specification: "Shallow-depth wall rack, lockable front door, suitable for first-fix cable termination.",
      quantity: 1,
      unit: "rack",
      required: true,
    },
    {
      category: "Rack",
      item: "1U horizontal cable manager",
      specification: "Front cable dressing for terminated panels.",
      quantity: 1,
      unit: "each",
      required: true,
    },
    {
      category: "Rack",
      item: "1U brush cable-entry panel",
      specification: "Protected cable entry and service-loop support.",
      quantity: 1,
      unit: "each",
      required: true,
    },
    {
      category: "Speaker",
      item: `12-way D-series SpeakON audio panel (Audio 01–02, U${RACK_UNITS.audio[0]}–U${RACK_UNITS.audio[1]})`,
      specification: "1U 12-position D-series panel labelled Audio.",
      quantity: 2,
      unit: "panels",
      required: true,
    },
    {
      category: "Speaker",
      item: "SpeakON D-series chassis connector",
      specification: "12 per audio panel.",
      quantity: 24,
      unit: "connectors",
      required: true,
    },
    {
      category: "DMX",
      item: `12-way D-series DMX panel (DMX 01–02, U${RACK_UNITS.dmx[0]}–U${RACK_UNITS.dmx[1]})`,
      specification: "1U 12-position D-series panel labelled DMX.",
      quantity: 2,
      unit: "panels",
      required: true,
    },
    {
      category: "DMX",
      item: "5-pin XLR D-series chassis connector",
      specification: "12 per DMX panel.",
      quantity: 24,
      unit: "connectors",
      required: true,
    },
    {
      category: "Fibre",
      item: `12-way D-series Fibre / Vortex panel (U${RACK_UNITS.fibre})`,
      specification: `1U 12-position D-series panel labelled Fibre / Vortex; LC duplex feedthroughs at positions 1–${FIBRE_PROVISION.quantity}.`,
      quantity: 1,
      unit: "panel",
      required: true,
    },
    {
      category: "Fibre",
      item: `Pre-terminated OM4 BIMMF LC–LC fibre assembly — ${FIBRE_PROVISION.lengthMetres} m`,
      specification: `${FIBRE_PROVISION.quantity} × ${FIBRE_PROVISION.lengthMetres} m LC–LC OM4 bend-insensitive multimode fibre links for the Samsung AAE Snow Box; AAE supports OM3 or OM4 BIMMF up to 100 m.`,
      quantity: FIBRE_PROVISION.quantity,
      unit: "links",
      required: true,
    },
    {
      category: "Fibre",
      item: "LC duplex D-series fibre feedthrough / bulkhead adapter",
      specification: `${FIBRE_PROVISION.quantity} adapters on the U${RACK_UNITS.fibre} Fibre / Vortex panel, positions 1–${FIBRE_PROVISION.quantity}.`,
      quantity: FIBRE_PROVISION.quantity,
      unit: "adapters",
      required: true,
    },
    {
      category: "Lighting",
      item: `12-way lighting provision panel (U${RACK_UNITS.lighting})`,
      specification: "1U D-series panel labelled Lighting; 12 empty XLR positions for future lighting connections.",
      quantity: 1,
      unit: "panel",
      required: true,
    },
    {
      category: "Labelling",
      item: "D-series blanking plates",
      specification: `12 blank lighting positions at U${RACK_UNITS.lighting} and ${12 - FIBRE_PROVISION.quantity} unused positions on the Fibre / Vortex panel.`,
      quantity: 12 + 12 - FIBRE_PROVISION.quantity,
      unit: "blanks",
      required: true,
    },
    {
      category: "Labelling",
      item: "M6 cage nuts and rack screws",
      specification: "Allow four fixing points for each fitted rack unit.",
      quantity: fittedU * 4,
      unit: "sets",
      required: true,
    },
    {
      category: "Labelling",
      item: "Heat-shrink / wrap-around cable labels",
      specification: "One identifier for every scheduled circuit terminated in the rack.",
      quantity: counts.network + counts.speaker + counts.dmx + counts.fibre,
      unit: "labels",
      required: true,
    },
  ];

  if (networkPanelCount) {
    parts.push(
      {
        category: "Network",
        item: "24-way unloaded keystone patch panel",
        specification: `1U, labelled 1–24; Cat6A-compatible screened panel. Includes panel 05 for CCTV, wireless access points, touch panels and Auri hearing units.`,
        quantity: networkPanelCount,
        unit: "panels",
        required: true,
      },
      {
        category: "Network",
        item: "Cat6A shielded keystone jack",
        specification: "Field-terminable, colour-coded to suit the selected structured-cabling standard.",
        quantity: counts.network,
        unit: "jacks",
        required: true,
      }
    );
  }

  if (counts.fibre) {
    parts.push({
      category: "Fibre",
      item: "Schedule-detected fibre route review",
      specification: `Compare any cable-schedule fibre routes with the two planned ${FIBRE_PROVISION.lengthMetres} m AAE-compatible OM4 LC–LC links on the Fibre / Vortex panel. Reconfirm controller, route count and final connector format before ordering additional fibre.`,
      quantity: counts.fibre,
      unit: "routes",
      required: false,
    });
  }

  return parts;
}

export function buildRackPlan(cables: CableRow[], site: SiteDetails, isProjectSchedule = false): RackPlan {
  const grouped: Record<RackConnectionKind, RackCircuit[]> = { network: [], speaker: [], dmx: [], fibre: [] };
  explicitPorts = new Map();
  cables.forEach((cable) => {
    if ((cable.rackPort ?? "").trim().toLowerCase() === "none") return; // not terminated on the rack
    const kind = classifyRackConnection(cable);
    if (!kind) return;
    const fixed = parseRackPort(cable.rackPort);
    if (fixed) {
      const ports = explicitPorts.get(fixed.panelId) ?? new Map<number, RackCircuit>();
      if (!ports.has(fixed.index)) {
        ports.set(fixed.index, { ...cable, kind });
        explicitPorts.set(fixed.panelId, ports);
        return;
      }
    }
    grouped[kind].push({ ...cable, kind });
  });

  const pinnedOf = (kind: RackConnectionKind) => {
    let n = 0;
    explicitPorts.forEach((ports) => ports.forEach((c) => { if (c.kind === kind) n += 1; }));
    return n;
  };
  const counts: Record<RackConnectionKind, number> = {
    network: grouped.network.length + pinnedOf("network"),
    speaker: grouped.speaker.length + pinnedOf("speaker"),
    dmx: grouped.dmx.length + pinnedOf("dmx"),
    fibre: grouped.fibre.length + pinnedOf("fibre"),
  };

  const allNetworkPanels = networkPanels(grouped.network);
  const visibleNetworkPanels = allNetworkPanels.slice(0, NETWORK_PANEL_UNITS.length);
  const overflowPanels = allNetworkPanels.slice(NETWORK_PANEL_UNITS.length);
  const staticPanels = fixedInfrastructure(grouped.speaker, grouped.dmx, grouped.fibre);
  const panels = [...visibleNetworkPanels, ...staticPanels].sort((a, b) => b.unit - a.unit);
  const usedU = panels.filter((panel) => panel.kind !== "spare").length + overflowPanels.length;
  const onPanels = (kind: RackConnector) =>
    staticPanels.reduce((n, panel) => n + (panel.ports?.filter((port) => port.connector === kind && (kind === "fibre" || Boolean(port.circuit && !port.circuit.planned))).length ?? 0), 0);

  return {
    site,
    cables,
    panels,
    overflowPanels,
    parts: planParts(counts, usedU),
    counts,
    representedAtU3: {
      speaker: onPanels("speakon"),
      dmx: onPanels("xlr5"),
      fibre: onPanels("fibre"),
    },
    usedU,
    capacityU: RACK_CAPACITY_U,
    isProjectSchedule,
  };
}

export function loadRackPlanFromSchedule(): RackPlan {
  const params = getUrlParams();
  const hasProjectId = Boolean(params.get("projectId") || params.get("project_id") || params.get("id"));

  if (hasProjectId) {
    const project = readCableScheduleProjectContext();
    const saved = safelyRead<SavedSchedule>(storageKeyForProject(project));
    return buildRackPlan(saved?.cables ?? [], saved?.site ?? siteDetailsForProject(project), true);
  }

  const storedCables = readStoredCables();
  const storedSite = safelyRead<SiteDetails>("multivrz_o2_cable_schedule_site_v2");
  return buildRackPlan(storedCables ?? defaultCablesForSite(), storedSite ?? defaultSiteDetailsForSite(), false);
}

export const RACK_KIND_META: Record<RackConnectionKind, { label: string; colour: string; accent: string }> = {
  network: { label: "Network", colour: "#22d3ee", accent: "cyan" },
  speaker: { label: "Speaker", colour: "#fbbf24", accent: "amber" },
  dmx: { label: "DMX / DALI", colour: "#c084fc", accent: "violet" },
  fibre: { label: "Fibre", colour: "#4ade80", accent: "emerald" },
};
