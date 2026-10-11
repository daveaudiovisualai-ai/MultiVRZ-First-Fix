/**
 * Rough cable routes drawn on the floor plan: containment, network, speaker,
 * DMX, power and fibre runs. Points are stored as % of the plan, so routes
 * stay in place at any zoom; a per-site scale turns them into metres.
 */
import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Eye, EyeOff, PenLine, Ruler, Trash2, Undo2, X } from "lucide-react";

export type RouteType = "containment" | "network" | "speaker" | "dmx" | "fibre" | "power" | "other";

export interface RoutePoint {
  x: number;
  y: number;
}

export interface CableRoute {
  id: string;
  name: string;
  type: RouteType;
  points: RoutePoint[];
  notes?: string;
}

export interface PlanScale {
  /** Real-world width of the whole plan image, in metres. */
  metresAcross: number;
}

export const ROUTE_TYPES: Record<RouteType, { label: string; colour: string; dash?: string; width: number }> = {
  containment: { label: "Containment / tray", colour: "#111827", dash: "7 4", width: 5 },
  network: { label: "Network", colour: "#0891b2", width: 3 },
  speaker: { label: "Speaker", colour: "#d97706", width: 3 },
  dmx: { label: "DMX", colour: "#7c3aed", width: 3 },
  fibre: { label: "Fibre", colour: "#059669", width: 3 },
  power: { label: "Power", colour: "#dc2626", dash: "2 3", width: 3 },
  other: { label: "Other", colour: "#334155", width: 3 },
};

export function routeLengthMetres(points: RoutePoint[], scale: PlanScale | undefined, aspect: number) {
  if (!scale || points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = (points[i].x - points[i - 1].x) / 100;
    const dy = ((points[i].y - points[i - 1].y) / 100) * aspect;
    total += Math.hypot(dx, dy) * scale.metresAcross;
  }
  return total;
}

export function formatMetres(value: number | null) {
  return value === null ? "—" : `${value < 10 ? value.toFixed(1) : Math.round(value)} m`;
}

export type RouteMode = { kind: "idle" } | { kind: "draw"; type: RouteType; points: RoutePoint[] } | { kind: "scale"; points: RoutePoint[] };

/** SVG + handles drawn on top of the plan (inside PlanCanvas's stage). */
export function RouteOverlay({
  routes,
  mode,
  selectedId,
  onSelect,
  onMovePoint,
  scale,
  aspect,
  visible,
}: {
  routes: CableRoute[];
  mode: RouteMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMovePoint: (routeId: string, index: number, point: RoutePoint) => void;
  scale?: PlanScale;
  aspect: number;
  visible: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ routeId: string; index: number; pointerId: number } | null>(null);
  const drawing = mode.kind !== "idle";
  const toPercent = (clientX: number, clientY: number) => {
    const rect = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };
  const shown = visible ? routes : [];
  const draft = mode.kind === "draw" ? mode.points : mode.kind === "scale" ? mode.points : [];
  const draftColour = mode.kind === "draw" ? ROUTE_TYPES[mode.type].colour : "#e11d48";
  const pointsAttr = (pts: RoutePoint[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const selected = shown.find((r) => r.id === selectedId);

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10" aria-label="Cable routes">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {shown.map((route) => {
          const meta = ROUTE_TYPES[route.type];
          const isSel = route.id === selectedId;
          return (
            <g key={route.id}>
              {/* wide invisible stroke so routes are easy to tap */}
              <polyline
                points={pointsAttr(route.points)}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: drawing ? "none" : "stroke", cursor: "pointer" }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(isSel ? null : route.id);
                }}
                onMouseDown={(event) => event.stopPropagation()}
              />
              <polyline points={pointsAttr(route.points)} fill="none" stroke="#ffffff" strokeOpacity={0.9} strokeWidth={meta.width + 3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {isSel && (
                <polyline points={pointsAttr(route.points)} fill="none" stroke="#fde047" strokeOpacity={0.85} strokeWidth={meta.width + 6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
              <polyline
                points={pointsAttr(route.points)}
                fill="none"
                stroke={meta.colour}
                strokeWidth={meta.width}
                strokeDasharray={meta.dash}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={selectedId && !isSel ? 0.55 : 0.95}
              />
            </g>
          );
        })}
        {draft.length > 0 && (
          <polyline points={pointsAttr(draft)} fill="none" stroke={draftColour} strokeWidth={3} strokeDasharray="4 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* Route labels: name and length at the middle point */}
      {shown.map((route) => {
        if (route.points.length < 2) return null;
        const mid = route.points[Math.floor((route.points.length - 1) / 2)];
        const next = route.points[Math.floor((route.points.length - 1) / 2) + 1] ?? mid;
        const len = routeLengthMetres(route.points, scale, aspect);
        return (
          <span
            key={`label-${route.id}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1 py-px text-[9px] font-bold leading-tight text-white shadow"
            style={{ left: `${(mid.x + next.x) / 2}%`, top: `${(mid.y + next.y) / 2}%`, background: ROUTE_TYPES[route.type].colour, opacity: selectedId && route.id !== selectedId ? 0.6 : 1 }}
          >
            {route.name || ROUTE_TYPES[route.type].label}
            {len !== null ? ` · ${formatMetres(len)}` : ""}
          </span>
        );
      })}

      {/* Draggable points on the selected route */}
      {selected &&
        !drawing &&
        selected.points.map((point, index) => (
          <span
            key={`${selected.id}-${index}`}
            role="button"
            aria-label={`Route point ${index + 1}`}
            className="pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 cursor-move touch-none rounded-full border-2 border-white shadow"
            style={{ left: `${point.x}%`, top: `${point.y}%`, background: ROUTE_TYPES[selected.type].colour }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.stopPropagation();
              drag.current = { routeId: selected.id, index, pointerId: event.pointerId };
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const d = drag.current;
              if (!d || d.pointerId !== event.pointerId) return;
              onMovePoint(d.routeId, d.index, toPercent(event.clientX, event.clientY));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          />
        ))}

      {/* Points of the route being drawn */}
      {draft.map((point, index) => (
        <span
          key={`draft-${index}`}
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${point.x}%`, top: `${point.y}%`, background: draftColour }}
        />
      ))}
    </div>
  );
}

/** Controls above the plan while drawing or setting the scale. */
export function RouteModeBar({
  mode,
  onUndo,
  onFinish,
  onCancel,
  onScaleConfirm,
}: {
  mode: RouteMode;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onScaleConfirm: (metres: number) => void;
}) {
  const [metres, setMetres] = useState("");
  if (mode.kind === "idle") return null;
  if (mode.kind === "scale") {
    const ready = mode.points.length === 2;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-950">
        <Ruler className="h-4 w-4 text-rose-700" />
        <span className="font-semibold">{ready ? "Real distance between the two points:" : `Tap ${mode.points.length ? "the second" : "two"} point${mode.points.length ? "" : "s"} a known distance apart (e.g. both ends of a dimension line).`}</span>
        {ready && (
          <>
            <input
              autoFocus
              inputMode="decimal"
              value={metres}
              onChange={(event) => setMetres(event.target.value)}
              placeholder="e.g. 9.345"
              className="h-7 w-24 rounded border border-rose-300 bg-white px-2 font-mono text-xs"
            />
            <span>m</span>
            <button
              type="button"
              disabled={!(parseFloat(metres) > 0)}
              onClick={() => onScaleConfirm(parseFloat(metres))}
              className="inline-flex items-center gap-1 rounded border border-rose-400 bg-rose-600 px-2 py-0.5 font-semibold text-white disabled:opacity-40"
            >
              <Check className="h-3 w-3" /> Set scale
            </button>
          </>
        )}
        <button type="button" onClick={onCancel} className="ml-auto rounded border border-rose-300 bg-white px-2 py-0.5 font-semibold text-rose-800 hover:bg-rose-100">Cancel</button>
      </div>
    );
  }
  const meta = ROUTE_TYPES[mode.type];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: meta.colour, background: `${meta.colour}12` }}>
      <PenLine className="h-4 w-4" style={{ color: meta.colour }} />
      <span className="font-semibold text-slate-800">
        Drawing a {meta.label.toLowerCase()} route — tap the plan to add points ({mode.points.length} so far). Tap a drop or the rack to snap to it. Double-tap or Finish when done.
      </span>
      <div className="ml-auto flex gap-1.5">
        <button type="button" onClick={onUndo} disabled={!mode.points.length} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 disabled:opacity-40"><Undo2 className="h-3 w-3" /> Undo</button>
        <button type="button" onClick={onFinish} disabled={mode.points.length < 2} className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold text-white disabled:opacity-40" style={{ background: meta.colour }}><Check className="h-3 w-3" /> Finish</button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700">Cancel</button>
      </div>
    </div>
  );
}

/** Route list, draw buttons, scale and totals (below the plan). */
export function RoutePanel({
  routes,
  selectedId,
  onSelect,
  onStartDraw,
  onStartScale,
  onUpdate,
  onDelete,
  scale,
  aspect,
  visible,
  onToggleVisible,
  readOnly,
}: {
  routes: CableRoute[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onStartDraw: (type: RouteType) => void;
  onStartScale: () => void;
  onUpdate: (id: string, patch: Partial<CableRoute>) => void;
  onDelete: (id: string) => void;
  scale?: PlanScale;
  aspect: number;
  visible: boolean;
  onToggleVisible: () => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [newType, setNewType] = useState<RouteType>("containment");
  const totals = new Map<RouteType, number>();
  routes.forEach((r) => {
    const len = routeLengthMetres(r.points, scale, aspect);
    if (len !== null) totals.set(r.type, (totals.get(r.type) ?? 0) + len);
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Cable routes <span className="font-semibold text-slate-400">({routes.length})</span>
        </button>
        <button type="button" onClick={onToggleVisible} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
          {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {visible ? "Shown" : "Hidden"}
        </button>
        <span className="text-[11px] text-slate-500">
          {scale ? `Scale: plan is ${formatMetres(scale.metresAcross)} across` : "No scale set — lengths need a scale"}
        </span>
        {!readOnly && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={onStartScale} className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-800 hover:bg-rose-100">
              <Ruler className="h-3 w-3" /> {scale ? "Re-set scale" : "Set scale"}
            </button>
            <select value={newType} onChange={(e) => setNewType(e.target.value as RouteType)} aria-label="Route type" className="h-7 rounded border border-slate-300 bg-white px-1.5 text-[11px] font-semibold">
              {(Object.keys(ROUTE_TYPES) as RouteType[]).map((t) => <option key={t} value={t}>{ROUTE_TYPES[t].label}</option>)}
            </select>
            <button type="button" onClick={() => onStartDraw(newType)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold text-white" style={{ background: ROUTE_TYPES[newType].colour }}>
              <PenLine className="h-3 w-3" /> Draw route
            </button>
          </div>
        )}
      </div>
      {open && (
        <div className="border-t border-slate-100">
          {totals.size > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
              <span className="font-semibold text-slate-500">Route totals:</span>
              {Array.from(totals.entries()).map(([type, len]) => (
                <span key={type} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full" style={{ background: ROUTE_TYPES[type].colour }} />
                  {ROUTE_TYPES[type].label} {formatMetres(len)}
                </span>
              ))}
            </div>
          )}
          {routes.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500">
              No routes yet. Pick a type and tap <strong>Draw route</strong>, then tap along the plan from the rack along corridors and ceiling voids. Set the scale once per site so each route shows its length.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {routes.map((route) => {
                const meta = ROUTE_TYPES[route.type];
                const isSel = route.id === selectedId;
                return (
                  <li key={route.id} className={`flex flex-wrap items-center gap-2 px-3 py-1.5 ${isSel ? "bg-yellow-50" : ""}`}>
                    <button type="button" onClick={() => onSelect(isSel ? null : route.id)} className="h-3.5 w-6 shrink-0 rounded-sm" style={{ background: meta.colour }} aria-label={`Select ${route.name || meta.label}`} />
                    <input
                      value={route.name}
                      disabled={readOnly}
                      onChange={(e) => onUpdate(route.id, { name: e.target.value })}
                      onFocus={() => onSelect(route.id)}
                      placeholder={meta.label}
                      className="h-7 min-w-0 flex-1 basis-40 rounded border border-transparent bg-transparent px-1 text-xs font-semibold text-slate-800 hover:border-slate-200 focus:border-cyan-400 focus:outline-none"
                    />
                    <select value={route.type} disabled={readOnly} onChange={(e) => onUpdate(route.id, { type: e.target.value as RouteType })} className="h-7 rounded border border-slate-200 bg-white px-1 text-[11px]">
                      {(Object.keys(ROUTE_TYPES) as RouteType[]).map((t) => <option key={t} value={t}>{ROUTE_TYPES[t].label}</option>)}
                    </select>
                    <span className="w-14 text-right font-mono text-xs font-semibold text-slate-700">{formatMetres(routeLengthMetres(route.points, scale, aspect))}</span>
                    {!readOnly && (
                      <button type="button" onClick={() => onDelete(route.id)} aria-label="Delete route" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isSel && <span className="basis-full text-[10px] text-slate-500">Drag the points on the plan to adjust this route.</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function newRouteId() {
  return `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export { X as RouteCloseIcon };
