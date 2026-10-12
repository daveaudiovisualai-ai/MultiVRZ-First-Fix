import { confirmAction } from "@/lib/confirmAction";
import { newRouteId, ROUTE_TYPES, RouteModeBar, RouteOverlay, RoutePanel, type CableRoute, type PlanScale, type RouteMode } from "@/components/CableRoutes";
import { activeSite, isKarrinyup, updateSite } from "@/lib/sites";
import { reduceImage, storeSitePlan } from "@/lib/floorPlanStore";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  FileUp,
  Layers3,
  MapPin,
  Maximize2,
  Network,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PlanCanvas, { type PlacedMarker } from "@/components/PlanCanvas";
import { CABLE_CATEGORY_META, dominantCategory, type CableCategory } from "@/lib/cableCategory";
import { AREA_ORDER } from "@/lib/areas";
import { Link, useLocation } from "wouter";
import { requestFocus, takeFocus } from "@/lib/crossLink";
import { CABLE_STORAGE_KEY } from "@/lib/scheduleStorage";
import { defaultDrawingForSite, dropArea, dropBoxLabel as boxLabel, dropGopLabel as gopLabel, dropIdForCable, positionIdsForDrop, resolveDropPositions, type DropDevice } from "@/lib/destinationPlanner";
import { loadRackPlanFromSchedule, type RackPlan } from "@/lib/rackPlanner";

const RACK_MARKER_ID = "__connection-rack";

/** Summary of the connection rack, shown when its yellow square is tapped. */
function RackSummary({ plan, compact = false }: { plan: RackPlan; compact?: boolean }) {
  const connectionPanels = plan.panels.filter((panel) => panel.ports?.length);
  const networkPanels = connectionPanels.filter((panel) => panel.kind === "network");
  const networkUsed = networkPanels.reduce((n, panel) => n + panel.circuits.length, 0);
  const networkPorts = networkPanels.reduce((n, panel) => n + panel.capacity, 0);
  const others = connectionPanels.filter((panel) => panel.kind !== "network");
  return (
    <div className={compact ? "mt-2 space-y-2" : "space-y-3"}>
      {!compact && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Connection rack</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{plan.capacityU}U wall rack</h2>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-900">{plan.capacityU}U · {plan.usedU}U fitted</span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-cyan-800">{networkUsed} / {networkPorts} network ports</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-100 text-[11px] leading-4">
        <li className="flex justify-between gap-2 px-2 py-1.5"><span className="font-semibold text-slate-700">Cat6A keystone panels</span><span className="text-slate-500">{networkPanels.length} × 24-way</span></li>
        {others.map((panel) => (
          <li key={panel.id} className="flex justify-between gap-2 px-2 py-1.5">
            <span className="font-semibold text-slate-700">U{panel.unit} {panel.shortLabel}</span>
            <span className="text-slate-500">{panel.circuits.length} / {panel.ports?.filter((port) => port.connector !== "blank").length ?? panel.capacity} allocated</span>
          </li>
        ))}
      </ul>
      <Link href="/connection-rack" className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100">Open Connection Rack →</Link>
    </div>
  );
}
import {
  defaultDropPosition,
  loadDestinationPlannerStore,
  loadDestinationSchedule,
  saveDestinationPlannerStore,
  type DestinationDrop,
  type DestinationPlannerStore,
  type DrawingDocument,
} from "@/lib/destinationPlanner";

type DestinationSchedule = ReturnType<typeof loadDestinationSchedule>;

function gopStyle(drop: DestinationDrop) {
  if (drop.gopType === "Not required") return "border-slate-200 bg-slate-100 text-slate-700";
  if (drop.gopType === "Field plug") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (drop.gopType === "2-way GOP") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (drop.gopType === "4-way GOP") return "border-violet-200 bg-violet-50 text-violet-800";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function statusColour(status: DestinationDrop["status"][number]) {
  return {
    Pending: "bg-slate-400",
    Installed: "bg-blue-500",
    Tested: "bg-emerald-500",
    Fault: "bg-red-500",
  }[status];
}

function drawingIsPdf(drawing?: DrawingDocument) {
  return Boolean(drawing && (drawing.mimeType === "application/pdf" || drawing.fileName.toLowerCase().endsWith(".pdf")));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("File could not be read"));
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read"));
    reader.readAsDataURL(file);
  });
}

function DropMarker({
  drop,
  position,
  selected,
  onClick,
}: {
  drop: DestinationDrop;
  position: { x: number; y: number };
  selected: boolean;
  onClick: () => void;
}) {
  const markerClass = drop.gopType === "Field plug"
    ? "border-emerald-200 bg-emerald-600"
    : drop.gopType === "2-way GOP"
    ? "border-cyan-200 bg-cyan-500"
    : drop.gopType === "4-way GOP" || drop.gopType === "Multiple 4-way GOP"
      ? "border-violet-200 bg-violet-600"
      : "border-slate-200 bg-slate-500";

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${drop.label} · ${gopLabel(drop)} · ${drop.cableCount} cable${drop.cableCount === 1 ? "" : "s"}`}
      aria-label={`Select destination drop ${drop.label}`}
      className={`absolute z-20 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-[8px] font-bold text-white shadow-lg transition duration-150 hover:scale-125 focus:scale-125 ${markerClass} ${selected ? "h-8 w-8 ring-4 ring-white/70" : ""}`}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
    >
      {drop.networkCableCount || drop.cableCount}
    </button>
  );
}

const CAMERA_TYPES = ["Dome", "Turret", "Bullet", "PTZ", "Fisheye / 360°", "Box", "Other"];
const WAP_TYPES = ["Ceiling mount", "Wall mount", "Outdoor", "Other"];

function deviceNumber(label: string) {
  return label.match(/(\d+)\s*$/)?.[1];
}

/** Read-only device summary shown in the plan info box. */
function DeviceSummary({ device, kind }: { device?: DropDevice; kind: "cctv" | "wap" }) {
  const typeLabel = kind === "cctv" ? "Camera type" : "WAP type";
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] leading-4">
      <div><dt className="font-bold uppercase tracking-wide text-slate-400">{typeLabel}</dt><dd className="text-slate-800">{device?.type || "Not set"}</dd></div>
      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Make / model</dt><dd className="text-slate-800">{device?.model || "Not set"}</dd></div>
      {device?.notes && <div className="col-span-2"><dt className="font-bold uppercase tracking-wide text-slate-400">Notes</dt><dd className="text-slate-700">{device.notes}</dd></div>}
    </dl>
  );
}

/** Editable camera / WAP details in the side panel. */
function DeviceEditor({ device, kind, onChange }: { device?: DropDevice; kind: "cctv" | "wap"; onChange: (patch: DropDevice) => void }) {
  const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";
  const types = kind === "cctv" ? CAMERA_TYPES : WAP_TYPES;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900">{kind === "cctv" ? "Camera details" : "Access point details"}</h2>
      <div className="mt-3 grid gap-3 text-xs font-bold uppercase tracking-wide text-slate-500">
        <label htmlFor="device-type">{kind === "cctv" ? "Camera type" : "WAP type"}
          <select id="device-type" value={device?.type ?? ""} onChange={(event) => onChange({ type: event.target.value })} className={input}>
            <option value="">Not set</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label htmlFor="device-model">Make / model
          <input id="device-model" key={`model-${kind}`} value={device?.model ?? ""} onChange={(event) => onChange({ model: event.target.value })} placeholder={kind === "cctv" ? "e.g. Hikvision DS-2CD2386G2-IU" : "e.g. Ubiquiti U7 Pro"} className={input} />
        </label>
        <label htmlFor="device-notes">Notes
          <input id="device-notes" value={device?.notes ?? ""} onChange={(event) => onChange({ notes: event.target.value })} placeholder="e.g. Covers main entry, 3.1 m mounting height" className={input} />
        </label>
      </div>
    </section>
  );
}

function DropInfo({ drop, onShowOnRack, deviceEditor }: { drop: DestinationDrop; onShowOnRack: (cableId: string) => void; deviceEditor?: ReactNode }) {
  const [showCables, setShowCables] = useState(true);
  return (
    <aside className="space-y-4">
      {deviceEditor}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Selected destination drop</p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-slate-900">{drop.label}</h2>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${gopStyle(drop)}`}>{drop.gopType}</span>
        </div>
        {drop.outletId && (
          <p className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs leading-5 text-cyan-950">
            <span className="font-mono font-bold">{drop.outletId}</span>
            {drop.gopType === "Field plug"
              ? " · field plug, no GOP box"
              : ` · ${drop.networkCableCount} cable${drop.networkCableCount === 1 ? "" : "s"} (${drop.cables.map((cable) => cable.cableNumber).join(", ")}) in ${boxLabel(drop)}`}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cable drops</p><p className="mt-1 text-2xl font-bold text-slate-900">{drop.cableCount}</p></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">GOP allocation</p><p className="mt-1 text-2xl font-bold text-slate-900">{drop.gopQuantity || "—"}</p></div>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cable types</dt><dd className="mt-1 font-semibold text-slate-700">{drop.cableTypes.join(", ") || "To be confirmed"}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Signals</dt><dd className="mt-1 font-semibold text-slate-700">{drop.signalTypes.join(", ") || "To be confirmed"}</dd></div>
          <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Rack termination</dt><dd className="mt-1 font-semibold text-slate-700">{drop.rackLocations.join(", ") || "To be confirmed"}</dd></div>
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button type="button" onClick={() => setShowCables((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50">
          <span className="text-sm font-bold text-slate-800">Cable schedule at this drop</span>
          {showCables ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>
        {showCables && <div className="divide-y divide-slate-100 border-t border-slate-100">
          {drop.cables.map((cable) => <div key={cable.id} className="flex items-start gap-2 px-4 py-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusColour(cable.status)}`} /><div className="min-w-0"><p className="text-xs font-bold text-slate-800">Cable {cable.cableNumber} · {cable.cableType || cable.signalType || "Type TBC"}</p><p className="mt-0.5 text-xs text-slate-500">{cable.source || "Rack"} → {cable.destination || drop.label} · {cable.length || "Length TBC"}</p></div><button type="button" onClick={() => onShowOnRack(cable.id)} className="ml-auto shrink-0 self-center rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-cyan-500 hover:bg-cyan-50 hover:text-cyan-800">Patch position ›</button></div>)}
        </div>}
      </section>
    </aside>
  );
}

const SECURITY_CATEGORIES = new Set<CableCategory>(["cctv", "wap"]);

/** "av" = AV drops; "security" = CCTV cameras and wireless access points. */
export type DropsVariant = "av" | "security";

function dropsForVariant(drops: DestinationDrop[], variant: DropsVariant) {
  return drops.filter((drop) => SECURITY_CATEGORIES.has(dominantCategory(drop.cables)) === (variant === "security"));
}

export default function DestinationDrops({ variant = "av" }: { variant?: DropsVariant }) {
  const isSecurity = variant === "security";
  const [schedule, setSchedule] = useState<DestinationSchedule>(() => loadDestinationSchedule());
  const [store, setStore] = useState<DestinationPlannerStore>(() => loadDestinationPlannerStore(schedule.storageScope));
  // Arriving from the Connection Rack: select that drop and zoom to it.
  const [focusRequest] = useState(() => {
    const id = takeFocus("drop");
    return id ? { id, nonce: Date.now() } : undefined;
  });
  // ── Cable routes drawn on the plan ──
  const [routeMode, setRouteMode] = useState<RouteMode>({ kind: "idle" });
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(true);
  const [planAspect, setPlanAspect] = useState(775 / 1108);
  const routes = store.routes ?? [];
  // Karrinyup's plan is drawn at 1:100 — 5 m on the scale bar is 110 px of the 1108 px sheet.
  const planScale: PlanScale | undefined = store.scale ?? (isKarrinyup() && store.drawing?.id?.startsWith("karrinyup") ? { metresAcross: (1108 * 5) / 110 } : undefined);
  const updateRoutes = (update: (current: CableRoute[]) => CableRoute[]) => setStore((existing) => ({ ...existing, routes: update(existing.routes ?? []) }));
  const addRoutePoint = (x: number, y: number) => {
    setRouteMode((mode) => {
      if (mode.kind === "draw") return { ...mode, points: [...mode.points, { x, y }] };
      if (mode.kind === "scale" && mode.points.length < 2) return { ...mode, points: [...mode.points, { x, y }] };
      return mode;
    });
  };
  const finishRoute = () => {
    if (routeMode.kind !== "draw") return;
    // A double-tap adds the same point twice; drop the repeat.
    const pts = routeMode.points.filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.y - all[i - 1].y) > 0.2);
    if (pts.length < 2) return;
    const id = newRouteId();
    const count = routes.filter((r) => r.type === routeMode.type).length + 1;
    updateRoutes((current) => [...current, { id, name: `${ROUTE_TYPES[routeMode.type].label} ${count}`, type: routeMode.type, points: pts }]);
    setSelectedRouteId(id);
    setRouteMode({ kind: "idle" });
  };
  const confirmScale = (metres: number) => {
    if (routeMode.kind !== "scale" || routeMode.points.length !== 2) return;
    const [a, b] = routeMode.points;
    const fraction = Math.hypot((b.x - a.x) / 100, ((b.y - a.y) / 100) * planAspect);
    if (fraction > 0) setStore((existing) => ({ ...existing, scale: { metresAcross: metres / fraction } }));
    setRouteMode({ kind: "idle" });
  };
  const [selectedDropId, setSelectedDropId] = useState(() => focusRequest?.id ?? dropsForVariant(schedule.drops, variant)[0]?.id ?? "");
  const [, navigate] = useLocation();
  // Speaker links (rack position "none") jump to the rack cable that feeds them.
  const rackCableFor = (cableId: string) => {
    const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
    let cable = schedule.cables.find((c) => c.id === cableId);
    for (let hops = 0; cable && (cable.rackPort ?? "").toLowerCase() === "none" && hops < 8; hops += 1) {
      const source = norm(cable.source);
      cable = schedule.cables.find((c) => norm(c.destination) === source);
    }
    return cable;
  };
  const showOnRack = (cableId: string) => {
    const target = rackCableFor(cableId);
    if (!target) {
      toast.error("This cable is not terminated on the rack");
      return;
    }
    if (target.id !== cableId) toast.message(`Fed from cable ${target.cableNumber}`);
    requestFocus({ type: "cable", id: target.id });
    navigate("/connection-rack");
  };
  const [search, setSearch] = useState("");
  const [hiddenCategories, setHiddenCategories] = useState<Set<CableCategory>>(() => new Set());
  const [listFilter, setListFilter] = useState<"all" | "placed" | "unplaced">("all");
  const categoryCache = useMemo(() => new Map<string, CableCategory>(), [schedule]);
  const categoryOf = (drop: DestinationDrop): CableCategory => {
    let category = categoryCache.get(drop.id);
    if (!category) {
      category = dominantCategory(drop.cables);
      categoryCache.set(drop.id, category);
    }
    return category;
  };
  const toggleCategory = (category: CableCategory) =>
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  const [showAllMarkers, setShowAllMarkers] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const drops = useMemo(() => dropsForVariant(schedule.drops, variant), [schedule, variant]);
  // Drops grouped into a shared outlet keep the position placed for any of their cables.
  const positions = useMemo(() => resolveDropPositions(store.positions, drops), [store.positions, drops]);
  const rackPlan = useMemo(() => loadRackPlanFromSchedule(), [schedule]);
  // The connection rack is placed on the plan like a drop, but drawn as a yellow square.
  const rackItem: DestinationDrop = useMemo(() => ({
    id: RACK_MARKER_ID,
    label: "Connection Rack",
    cables: [],
    cableCount: 0,
    networkCableCount: 0,
    gopType: "Not required",
    gopQuantity: 0,
    cableTypes: [],
    signalTypes: [],
    status: [],
    rackLocations: [],
  }), []);
  const allItems = useMemo(() => [rackItem, ...drops], [rackItem, drops]);
  const selectedDrop = allItems.find((drop) => drop.id === selectedDropId) ?? drops[0];
  const rackSelected = selectedDrop?.id === RACK_MARKER_ID;
  // Area and cable-type filters apply to the plan, the picker and the list.
  const [areaFilter, setAreaFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | CableCategory>("all");
  const passesFilters = (drop: DestinationDrop) =>
    (areaFilter === "all" || dropArea(drop) === areaFilter) && (typeFilter === "all" || categoryOf(drop) === typeFilter);
  const areaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    drops.forEach((drop) => {
      if (typeFilter !== "all" && dominantCategory(drop.cables) !== typeFilter) return;
      const area = dropArea(drop);
      counts.set(area, (counts.get(area) ?? 0) + 1);
    });
    return AREA_ORDER.filter((area) => counts.has(area)).map((area) => [area, counts.get(area)!] as const);
  }, [drops, typeFilter]);
  const typeCounts = useMemo(() => {
    const counts = new Map<CableCategory, number>();
    drops.forEach((drop) => {
      if (areaFilter !== "all" && dropArea(drop) !== areaFilter) return;
      const category = dominantCategory(drop.cables);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return (Object.keys(CABLE_CATEGORY_META) as CableCategory[]).filter((c) => counts.has(c)).map((c) => [c, counts.get(c)!] as const);
  }, [drops, areaFilter]);
  const filtersOn = areaFilter !== "all" || typeFilter !== "all";
  // When a filter changes, move the selection to the first drop that matches.
  useEffect(() => {
    if (!filtersOn) return;
    const current = drops.find((drop) => drop.id === selectedDropId);
    if (current && passesFilters(current)) return;
    const first = drops.find(passesFilters);
    if (first) setSelectedDropId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFilter, typeFilter]);
  const searchMatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = drops.filter(passesFilters);
    return query ? filtered.filter((drop) => `${drop.label} ${drop.outletId ?? ""} ${drop.cables.map((c) => c.cableNumber).join(" ")} ${drop.cableTypes.join(" ")} ${drop.signalTypes.join(" ")}`.toLowerCase().includes(query)) : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drops, search, areaFilter, typeFilter]);
  const [placingDropId, setPlacingDropId] = useState<string | null>(null);
  const placingDrop = allItems.find((drop) => drop.id === placingDropId);
  const placedCount = drops.filter((drop) => positions[drop.id]).length;
  const listDrops = searchMatches.filter((drop) => listFilter === "all" || (listFilter === "placed") === Boolean(positions[drop.id]));
  const categoriesPresent = useMemo(() => {
    const counts = new Map<CableCategory, number>();
    drops.forEach((drop) => {
      const category = dominantCategory(drop.cables);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    // Always offer the four main types so the filter reads the same on every job.
    ((isSecurity ? ["cctv", "wap"] : ["network", "fibre", "dmx", "speaker"]) as CableCategory[]).forEach((category) => counts.set(category, counts.get(category) ?? 0));
    return (Object.keys(CABLE_CATEGORY_META) as CableCategory[]).filter((category) => counts.has(category)).map((category) => [category, counts.get(category)!] as const);
  }, [drops, isSecurity]);

  /** CCTV / WAP quick add: creates a schedule row, then starts placing it. */
  const quickAdd = (kind: "cctv" | "wap") => {
    if (schedule.isProjectSchedule) return;
    // Next cable number in the same series (e.g. N516 → N517); next device number from the names.
    const parse = (n: string) => n.match(/^([A-Za-z]*)(\d+)$/);
    const sameKind = drops.filter((d) => dominantCategory(d.cables) === kind);
    const kindNumbers = sameKind.flatMap((d) => d.cables.map((c) => parse(c.cableNumber))).filter(Boolean) as RegExpMatchArray[];
    const allNumbers = schedule.cables.map((c) => parse(c.cableNumber)).filter(Boolean) as RegExpMatchArray[];
    const series = kindNumbers.length ? kindNumbers : allNumbers;
    const prefix = series.length ? series[series.length - 1][1] : "";
    const width = series.length ? series[series.length - 1][2].length : 1;
    const taken = new Set(schedule.cables.map((c) => c.cableNumber));
    let n = series.filter((m) => m[1] === prefix).reduce((max, m) => Math.max(max, Number(m[2])), 0) + 1;
    while (taken.has(`${prefix}${String(n).padStart(width, "0")}`)) n += 1;
    const next = `${prefix}${String(n).padStart(width, "0")}`;
    const deviceNo = sameKind.reduce((max, d) => Math.max(max, Number(d.label.match(/(\d+)\s*$/)?.[1] ?? 0)), 0) + 1;
    const destination = kind === "cctv" ? `CCTV Camera ${deviceNo}` : `WAP ${deviceNo}`;
    const row = { id: `k-${next}-${Date.now().toString(36)}`, cableNumber: next, cableType: "Cat6A LSOH", signalType: "Network", source: "", destination, length: "", patchLocation: "Wall Mounted Connection Box", status: "Pending" as const, notes: "" };
    try {
      localStorage.setItem(CABLE_STORAGE_KEY, JSON.stringify([...schedule.cables, row]));
    } catch {
      toast.error("The cable could not be added in this browser");
      return;
    }
    const refreshed = loadDestinationSchedule();
    setSchedule(refreshed);
    const id = dropIdForCable(row);
    setSelectedDropId(id);
    setPlacingDropId(id);
    toast.success(`Cable ${next} added for ${destination}. Tap the plan to position it.`);
  };

  const positionFor = (drop: DestinationDrop) => {
    const stored = positions[drop.id];
    if (stored) return stored;
    if (drop.id === RACK_MARKER_ID) return { dropId: drop.id, x: 50, y: 50 };
    const index = drops.findIndex((candidate) => candidate.id === drop.id);
    return { ...defaultDropPosition(index, drops.length), dropId: drop.id };
  };

  // Placed drops always show; unplaced ones show when selected or when "Show all" is on.
  // Cable-type chips hide or show whole categories on the plan.
  const canvasMarkers: PlacedMarker[] = searchMatches
    .filter((drop) => showAllMarkers || positions[drop.id] || drop.id === selectedDrop?.id)
    .filter((drop) => !hiddenCategories.has(categoryOf(drop)) || drop.id === selectedDrop?.id)
    .map((drop) => {
      const position = positionFor(drop);
      // Cameras and WAPs show their own number on the marker (CCTV Camera 12 → 12, WAP 3 → 3).
      const category = categoryOf(drop);
      const isDevice = isSecurity && (category === "cctv" || category === "wap");
      return {
        drop,
        x: position.x,
        y: position.y,
        placed: Boolean(positions[drop.id]),
        colour: CABLE_CATEGORY_META[category].colour,
        badge: isDevice ? deviceNumber(drop.label) : undefined,
        kindLabel: isDevice ? (category === "cctv" ? "CCTV camera" : "Wireless access point") : undefined,
        popupExtra: isDevice ? <DeviceSummary device={store.devices?.[drop.id]} kind={category as "cctv" | "wap"} /> : undefined,
      };
    });
  if (showAllMarkers || positions[RACK_MARKER_ID] || rackSelected) {
    const position = positionFor(rackItem);
    canvasMarkers.push({
      drop: rackItem,
      x: position.x,
      y: position.y,
      placed: Boolean(positions[RACK_MARKER_ID]),
      variant: "rack",
      popupBody: <RackSummary plan={rackPlan} compact />,
    });
  }

  const startPlacing = (dropId: string) => {
    setSelectedDropId(dropId);
    setPlacingDropId(dropId);
  };

  const placeSelected = (x: number, y: number) => {
    if (!placingDrop) return;
    setStore((existing) => ({ ...existing, positions: { ...existing.positions, [placingDrop.id]: { dropId: placingDrop.id, x, y } } }));
    toast.success(`${placingDrop.label} placed on the plan`);
    setPlacingDropId(null);
  };

  const selectedPlaced = Boolean(selectedDrop && positions[selectedDrop.id]);

  const updateDevice = (dropId: string, patch: DropDevice) =>
    setStore((existing) => ({ ...existing, devices: { ...(existing.devices ?? {}), [dropId]: { ...(existing.devices?.[dropId] ?? {}), ...patch } } }));

  const moveMarker = (dropId: string, x: number, y: number) => {
    setStore((existing) => ({ ...existing, positions: { ...existing.positions, [dropId]: { dropId, x, y } } }));
  };

  const nudge = (dx: number, dy: number) => {
    if (!selectedDrop) return;
    const current = positionFor(selectedDrop);
    moveMarker(selectedDrop.id, Math.min(99, Math.max(1, current.x + dx)), Math.min(99, Math.max(1, current.y + dy)));
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const selectFromList = (dropId: string) => {
    setSelectedDropId(dropId);
    // Bring the plan into view so the drop can be placed straight away.
    requestAnimationFrame(() => canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const removePlacement = (dropId: string) => {
    setStore((existing) => {
      const next = { ...existing.positions };
      const drop = drops.find((candidate) => candidate.id === dropId);
      (drop ? positionIdsForDrop(drop) : [dropId]).forEach((id) => delete next[id]);
      return { ...existing, positions: next };
    });
  };

  useEffect(() => {
    saveDestinationPlannerStore(schedule.storageScope, store);
  }, [schedule.storageScope, store]);

  const refreshSchedule = () => {
    const refreshed = loadDestinationSchedule();
    setSchedule(refreshed);
    setStore(loadDestinationPlannerStore(refreshed.storageScope));
    setSelectedDropId(dropsForVariant(refreshed.drops, variant)[0]?.id ?? "");
    toast.success(isSecurity ? "CCTV and WAP positions refreshed from the cable schedule" : "AV drops refreshed from the cable schedule");
  };

  const updatePosition = (axis: "x" | "y", value: number) => {
    if (!selectedDrop) return;
    const current = positionFor(selectedDrop);
    setStore((existing) => ({ ...existing, positions: { ...existing.positions, [selectedDrop.id]: { ...current, [axis]: value } } }));
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
    const isDwg = file.name.toLowerCase().endsWith(".dwg") || file.name.toLowerCase().endsWith(".dxf");
    if (!isPdf && !isImage && !isDwg) {
      toast.error("Upload the plan as a PNG, JPG or PDF");
      return;
    }
    if (isImage && !isKarrinyup()) {
      try {
        const site = activeSite();
        const dataUrl = await reduceImage(file);
        const floorPlan = await storeSitePlan(site.id, dataUrl, file.name);
        updateSite(site.id, { floorPlan });
        setStore((existing) => ({ ...existing, drawing: defaultDrawingForSite(), hideDefaultDrawing: false }));
        toast.success("Floor plan saved for this site");
      } catch {
        toast.error("The floor plan could not be saved");
      }
      return;
    }
    if (file.size > 3_500_000) {
      toast.error("For browser-only storage, use a drawing under 3.5 MB or export a reduced PDF");
      return;
    }
    try {
      const drawing: DrawingDocument = { id: `drawing-${Date.now()}`, fileName: file.name, mimeType: file.type, source: await readFileAsDataUrl(file), uploadedAt: new Date().toISOString() };
      setStore((existing) => ({ ...existing, drawing, hideDefaultDrawing: false }));
      toast.success(isDwg ? "DWG/DXF saved, but it can't be displayed. Upload a PNG, JPG or PDF instead." : "Plan uploaded");
    } catch {
      toast.error("The drawing could not be read in this browser");
    }
  };

  const clearDrawing = () => {
    setStore((existing) => ({ ...existing, drawing: undefined, hideDefaultDrawing: true }));
    if (inputRef.current) inputRef.current.value = "";
    toast.success("Drawing cleared from this project workspace");
  };

  const gopSummary = useMemo(() => ({
    twoWay: drops.filter((drop) => drop.gopType === "2-way GOP").reduce((sum, drop) => sum + drop.gopQuantity, 0),
    fourWay: drops.filter((drop) => drop.gopType === "4-way GOP" || drop.gopType === "Multiple 4-way GOP").reduce((sum, drop) => sum + drop.gopQuantity, 0),
  }), [drops]);

  return (
    <div className="h-full overflow-y-auto bg-[#edf2f7]">
      <header className="border-b border-slate-700 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300"><MapPin className="h-3.5 w-3.5" /> MultiVRZ · First Fix Planning</p><h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{isSecurity ? "CCTV & Wireless Access Points" : "AV Drop Planner"}</h1><p className="mt-1 max-w-2xl text-sm text-slate-300">{isSecurity ? "Position each camera and wireless access point on the floor plan. Tap a marker to see its cable and jump to its switch port." : "Place schedule-derived cable drops on the floor plan, zoom in, and tap any marker to see what the drop is."}</p></div>
            <div className="flex flex-wrap gap-2 print:hidden"><Button variant="outline" onClick={refreshSchedule} className="h-9 border-slate-600 bg-slate-900/50 text-slate-100 hover:bg-slate-800 hover:text-white"><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh schedule</Button><Button onClick={() => inputRef.current?.click()} className="h-9 bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Upload className="mr-2 h-3.5 w-3.5" /> Upload drawing</Button><input ref={inputRef} onChange={(event) => handleFile(event.target.files?.[0])} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.dwg,.dxf,image/*,application/pdf" className="sr-only" aria-label="Upload destination drawing" /></div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/10 pt-4 sm:grid-cols-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Schedule source</p><p className="mt-1 text-sm font-semibold text-white">{schedule.isProjectSchedule ? "Project schedule draft" : "Current Cable Schedule"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Destination points</p><p className="mt-1 text-sm font-semibold text-white">{isSecurity ? `${drops.filter((d) => dominantCategory(d.cables) === "cctv").length} cameras · ${drops.filter((d) => dominantCategory(d.cables) === "wap").length} WAPs` : `${drops.length} locations`}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">2-way GOP</p><p className="mt-1 text-sm font-semibold text-white">{gopSummary.twoWay} calculated</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">4-way GOP</p><p className="mt-1 text-sm font-semibold text-white">{gopSummary.fourWay} calculated</p></div></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {schedule.isProjectSchedule && !schedule.cables.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-bold">No project cable rows are available yet.</p><p className="mt-1 text-amber-900">Create or import the project cable schedule first. Its destination names will then appear here as placeable drops.</p></div></div></div> : <>
          <section className="grid gap-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="font-bold text-cyan-950">Automatic GOP sizing</h2><p className="mt-1 text-sm leading-6 text-cyan-900">Cables that share an outlet (the Outlet / GOP column in the cable schedule) are terminated in one box, so two cables make one 2-way GOP rather than two. Other cables are combined by destination. One or two network cables produce a 2-way GOP; three or four produce a 4-way GOP; larger drops calculate multiple 4-way GOPs. FP- outlets are field plugs and need no GOP. Non-network routes stay at the same drop without adding a GOP.</p></div></div><span className="rounded-full border border-cyan-300 bg-white px-3 py-1.5 text-xs font-bold text-cyan-800">{schedule.site.siteName || schedule.site.jobNumber || "Current project"}</span></section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div ref={canvasRef} className="scroll-mt-2 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white sm:flex-row sm:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Interactive plan canvas</p><h2 className="mt-0.5 text-base font-bold">{store.drawing?.fileName || "Destination cable-drop view"}</h2></div><div className="flex flex-wrap items-center gap-2 text-xs"><button onClick={() => setShowAllMarkers((value) => !value)} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold ${showAllMarkers ? "border-cyan-400 bg-cyan-400 text-slate-950" : "border-slate-700 bg-slate-800 text-slate-300 hover:text-white"}`}><CircleDot className="h-3.5 w-3.5" />{showAllMarkers ? "Showing all drops" : "Show unplaced drops"}</button>{isSecurity && !schedule.isProjectSchedule && <><button onClick={() => quickAdd("cctv")} className="inline-flex items-center gap-1 rounded-md border border-blue-400 bg-blue-600 px-2 py-1 font-semibold text-white hover:bg-blue-500"><span className="h-2.5 w-2.5 rounded-full bg-white/90" />Add camera</button><button onClick={() => quickAdd("wap")} className="inline-flex items-center gap-1 rounded-md border border-lime-500 bg-lime-600 px-2 py-1 font-semibold text-white hover:bg-lime-500"><span className="h-2.5 w-2.5 rounded-full bg-white/90" />Add WAP</button></>}<button onClick={() => startPlacing(RACK_MARKER_ID)} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-400 px-2 py-1 font-semibold text-amber-950 hover:bg-amber-300"><span className="h-2.5 w-2.5 rounded-[2px] border border-amber-900/40 bg-amber-200" />{positions[RACK_MARKER_ID] ? "Move rack" : "Add rack"}</button>{store.drawing && <button onClick={clearDrawing} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"><Trash2 className="h-3.5 w-3.5" /> Clear</button>}</div></div>
              <div className="p-3 sm:p-4">
                <PlanCanvas
                  drawing={store.drawing}
                  markers={canvasMarkers}
                  selectedDropId={selectedDrop?.id}
                  placingDropLabel={placingDrop?.label}
                  onMarkerClick={setSelectedDropId}
                  onStartPlacing={startPlacing}
                  onCancelPlacing={() => setPlacingDropId(null)}
                  onPlace={placeSelected}
                  onMoveMarker={moveMarker}
                  focusRequest={focusRequest}
                  onCableAction={showOnRack}
                  cableActionLabel="Patch position"
                  drawMode={routeMode.kind !== "idle"}
                  onCanvasPoint={addRoutePoint}
                  onDrawFinish={finishRoute}
                  onAspect={setPlanAspect}
                  modeBar={<RouteModeBar mode={routeMode} onUndo={() => setRouteMode((m) => (m.kind === "idle" ? m : { ...m, points: m.points.slice(0, -1) }) as RouteMode)} onFinish={finishRoute} onCancel={() => setRouteMode({ kind: "idle" })} onScaleConfirm={confirmScale} />}
                  overlay={
                    <RouteOverlay
                      routes={routes}
                      mode={routeMode}
                      selectedId={selectedRouteId}
                      onSelect={setSelectedRouteId}
                      onMovePoint={(routeId, index, point) => updateRoutes((current) => current.map((r) => (r.id === routeId ? { ...r, points: r.points.map((p, i) => (i === index ? point : p)) } : r)))}
                      scale={planScale}
                      aspect={planAspect}
                      visible={showRoutes}
                    />
                  }
                  toolbar={selectedDrop && (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Filter</span>
                      <label className="sr-only" htmlFor="area-filter">Area</label>
                      <select id="area-filter" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)} className={`h-8 min-w-0 flex-1 basis-40 rounded-md border px-2 text-xs font-semibold ${areaFilter !== "all" ? "border-cyan-500 bg-cyan-50 text-cyan-900" : "border-slate-300 bg-white text-slate-800"}`}>
                        <option value="all">All areas</option>
                        {areaCounts.map(([area, count]) => <option key={area} value={area}>{area} ({count})</option>)}
                      </select>
                      <label className="sr-only" htmlFor="type-filter">Cable type</label>
                      <select id="type-filter" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | CableCategory)} className={`h-8 min-w-0 flex-1 basis-40 rounded-md border px-2 text-xs font-semibold ${typeFilter !== "all" ? "border-cyan-500 bg-cyan-50 text-cyan-900" : "border-slate-300 bg-white text-slate-800"}`}>
                        <option value="all">All cable types</option>
                        {typeCounts.map(([category, count]) => <option key={category} value={category}>{CABLE_CATEGORY_META[category].label} ({count})</option>)}
                      </select>
                      {filtersOn && <button type="button" onClick={() => { setAreaFilter("all"); setTypeFilter("all"); }} className="h-8 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">Clear filters</button>}
                      {filtersOn && <span className="text-[11px] font-semibold text-slate-500">{searchMatches.length} of {drops.length} drops</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor="drop-picker">Cable drop</label>
                      <select
                        id="drop-picker"
                        value={selectedDrop.id}
                        onChange={(event) => setSelectedDropId(event.target.value)}
                        className="h-8 min-w-0 flex-1 basis-48 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800"
                      >
                        <option value={RACK_MARKER_ID}>{positions[RACK_MARKER_ID] ? "■ " : "□ "}Connection Rack</option>
                        {drops.filter((drop) => passesFilters(drop) || drop.id === selectedDrop.id).map((drop) => (
                          <option key={drop.id} value={drop.id}>
                            {positions[drop.id] ? "● " : "○ "}{drop.label}
                          </option>
                        ))}
                      </select>
                      <Button onClick={() => startPlacing(selectedDrop.id)} className={`h-8 px-3 text-xs ${rackSelected ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : "bg-cyan-600 text-white hover:bg-cyan-700"}`}>
                        <MapPin className="mr-1.5 h-3.5 w-3.5" />{selectedPlaced ? "Move on plan" : "Place on plan"}
                      </Button>
                      {selectedPlaced && (
                        <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white" aria-label="Nudge marker">
                          {([["←", -0.4, 0, "left"], ["↑", 0, -0.4, "up"], ["↓", 0, 0.4, "down"], ["→", 0.4, 0, "right"]] as const).map(([label, dx, dy, name]) => (
                            <button key={name} type="button" onClick={() => nudge(dx, dy)} aria-label={`Nudge ${name}`} className="h-8 w-8 border-r border-slate-200 text-sm font-bold text-slate-700 last:border-r-0 hover:bg-slate-100">{label}</button>
                          ))}
                        </div>
                      )}
                      {selectedPlaced && <Button variant="outline" onClick={() => removePlacement(selectedDrop.id)} className="h-8 px-3 text-xs">Remove</Button>}
                    </div>
                    </div>
                  )}
                />
                <div className="mt-3">
                  <RoutePanel
                    routes={routes}
                    selectedId={selectedRouteId}
                    onSelect={setSelectedRouteId}
                    onStartDraw={(type) => { setSelectedRouteId(null); setPlacingDropId(null); setRouteMode({ kind: "draw", type, points: [] }); }}
                    onStartScale={() => { setSelectedRouteId(null); setRouteMode({ kind: "scale", points: [] }); }}
                    onUpdate={(id, patch) => updateRoutes((current) => current.map((r) => (r.id === id ? { ...r, ...patch } : r)))}
                    onDelete={async (id) => {
                      if (!(await confirmAction("Delete this cable route?", "Delete"))) return;
                      updateRoutes((current) => current.filter((r) => r.id !== id));
                      setSelectedRouteId(null);
                    }}
                    scale={planScale}
                    aspect={planAspect}
                    visible={showRoutes}
                    onToggleVisible={() => setShowRoutes((v) => !v)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Show cable types on the plan">
                  <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Show on plan</span>
                  {categoriesPresent.map(([category, count]) => {
                    const hidden = hiddenCategories.has(category);
                    return (
                      <button key={category} type="button" onClick={() => toggleCategory(category)} aria-pressed={!hidden} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${hidden ? "border-slate-200 bg-white text-slate-400 line-through" : "border-slate-300 bg-white text-slate-700 shadow-sm"}`}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: hidden ? "#cbd5e1" : CABLE_CATEGORY_META[category].colour }} />
                        {CABLE_CATEGORY_META[category].label} <span className="text-slate-400">{count}</span>
                      </button>
                    );
                  })}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900"><span className="h-2.5 w-2.5 rounded-[2px] bg-amber-400" />Connection rack</span>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>Drops positioned on the plan</span><span className="tabular-nums">{placedCount} of {drops.length}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${drops.length ? (placedCount / drops.length) * 100 : 0}%` }} /></div>
                </div>
                <p className="mt-3 flex items-center gap-2 text-xs leading-5 text-slate-500"><Maximize2 className="h-3.5 w-3.5 shrink-0" /> Tap a marker to see what the cable drop is. To add one, pick the drop above the plan, press “Place on plan” and tap its position. Drag a placed marker, or use the arrows, to move it. Solid markers are positioned; dashed ones are not placed yet.</p>
              </div>
            </div>
            {isSecurity && !drops.length && !rackSelected ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-600"><p className="font-semibold text-slate-800">No cameras or access points in the schedule yet.</p><p className="mt-1">Use <strong>Add camera</strong> or <strong>Add WAP</strong> above the plan. Each one adds a Cat6A cable to the cable schedule (next cable number) for you to edit, then you tap its position. Cables whose destination mentions CCTV, camera, WAP or access point appear here automatically.</p></div> : rackSelected ? <aside className="space-y-4"><section className="rounded-xl border border-amber-300 bg-white p-4 shadow-sm"><RackSummary plan={rackPlan} /></section></aside> : selectedDrop ? <DropInfo drop={selectedDrop} onShowOnRack={showOnRack} deviceEditor={isSecurity && (categoryOf(selectedDrop) === "cctv" || categoryOf(selectedDrop) === "wap") ? <DeviceEditor device={store.devices?.[selectedDrop.id]} kind={categoryOf(selectedDrop) as "cctv" | "wap"} onChange={(patch) => updateDevice(selectedDrop.id, patch)} /> : undefined} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">No destination points found.</div>}
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Network className="h-4 w-4 text-cyan-700" /><h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-800">{isSecurity ? "Cameras and access points" : "AV destinations"}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{listDrops.length} shown</span></div><div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-semibold">{([["all", `All ${drops.length}`], ["placed", `On plan ${placedCount}`], ["unplaced", `Not placed ${drops.length - placedCount}`]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setListFilter(value)} aria-pressed={listFilter === value} className={`border-r border-slate-200 px-2.5 py-1.5 last:border-r-0 ${listFilter === value ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}</div><div className="relative sm:ml-auto sm:w-72"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find destination or cable type…" className="h-9 pl-8 text-xs" /></div></div><div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">{listDrops.map((drop) => { const placed = Boolean(positions[drop.id]); return <button key={drop.id} onClick={() => selectFromList(drop.id)} className={`flex items-center gap-3 border-l-4 px-4 py-3 text-left transition hover:bg-slate-50 ${placed ? "border-l-emerald-500" : "border-l-transparent"} ${drop.id === selectedDrop?.id ? "bg-cyan-50/70" : placed ? "bg-emerald-50/40" : "bg-white"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: CABLE_CATEGORY_META[categoryOf(drop)].colour, opacity: placed ? 1 : 0.55 }}>{isSecurity ? deviceNumber(drop.label) ?? drop.cableCount : drop.cableCount}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-800">{drop.label}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{isSecurity ? [store.devices?.[drop.id]?.type, store.devices?.[drop.id]?.model].filter(Boolean).join(" · ") || `Cable ${drop.cables.map((c) => c.cableNumber).join(", ")} · model not set` : drop.cableTypes.join(", ") || "Cable type TBC"}</span></span>{placed ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800"><CheckCircle2 className="h-3 w-3" />On plan</span> : <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500">Not placed</span>}<span className={`hidden shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold sm:inline ${gopStyle(drop)}`}>{gopLabel(drop)}</span></button>; })}</div></section>
        </>}
      </main>
    </div>
  );
}
