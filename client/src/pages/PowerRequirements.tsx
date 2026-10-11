/*
 * PowerRequirements — power points marked up on the floor plan.
 * Pick a power type, press "Add power point", tap the plan, then fill in the details.
 */
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Plug, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import PlanCanvas, { type PlacedMarker } from "@/components/PlanCanvas";
import { confirmAction } from "@/lib/confirmAction";
import { saveFile } from "@/lib/saveFile";
import { loadDestinationPlannerStore, type DestinationDrop } from "@/lib/destinationPlanner";
import { loadCurrentCableSchedule } from "@/lib/scheduleContext";
import {
  MOUNTING_OPTIONS,
  POWER_TYPES,
  loadPowerStore,
  newPowerPointId,
  savePowerStore,
  type PowerPoint,
  type PowerStore,
  type PowerType,
} from "@/lib/powerPlanner";

const NEW_POINT = "__new-power-point";

function asMarkerItem(id: string, label: string): DestinationDrop {
  return {
    id,
    label,
    cables: [],
    cableCount: 0,
    networkCableCount: 0,
    gopType: "Not required",
    gopQuantity: 0,
    cableTypes: [],
    signalTypes: [],
    status: [],
    rackLocations: [],
  };
}

function pointRef(index: number) {
  return `P${String(index + 1).padStart(2, "0")}`;
}

function pointTitle(point: PowerPoint, index: number) {
  return `${pointRef(index)} · ${POWER_TYPES[point.type].label}${point.quantity > 1 ? ` × ${point.quantity}` : ""}`;
}

function PointDetails({ point }: { point: PowerPoint }) {
  return (
    <dl className="mt-2 space-y-1.5 text-[11px] leading-4">
      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Location</dt><dd className="text-slate-700">{point.location || "Not recorded"}</dd></div>
      <div><dt className="font-bold uppercase tracking-wide text-slate-400">Powers</dt><dd className="text-slate-700">{point.serves || "Not recorded"}</dd></div>
      {point.mounting && <div><dt className="font-bold uppercase tracking-wide text-slate-400">Mounting</dt><dd className="text-slate-700">{point.mounting}</dd></div>}
      {point.notes && <div><dt className="font-bold uppercase tracking-wide text-slate-400">Notes</dt><dd className="text-slate-700">{point.notes}</dd></div>}
    </dl>
  );
}

export default function PowerRequirements() {
  const drawing = useMemo(() => loadDestinationPlannerStore(loadCurrentCableSchedule().storageScope).drawing, []);
  const [store, setStore] = useState<PowerStore>(() => loadPowerStore());
  const [selectedId, setSelectedId] = useState<string | null>(() => loadPowerStore().points[0]?.id ?? null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [newType, setNewType] = useState<PowerType>("double");
  const [hiddenTypes, setHiddenTypes] = useState<Set<PowerType>>(() => new Set());

  useEffect(() => savePowerStore(store), [store]);

  const points = store.points;
  const selectedIndex = points.findIndex((point) => point.id === selectedId);
  const selected = selectedIndex >= 0 ? points[selectedIndex] : undefined;

  const updatePoint = (id: string, patch: Partial<PowerPoint>) =>
    setStore((current) => ({ points: current.points.map((point) => (point.id === id ? { ...point, ...patch } : point)) }));

  const markers: PlacedMarker[] = points
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => !hiddenTypes.has(point.type) || point.id === selectedId)
    .map(({ point, index }) => ({
      drop: asMarkerItem(point.id, pointTitle(point, index)),
      x: point.x,
      y: point.y,
      placed: true,
      colour: POWER_TYPES[point.type].colour,
      badge: POWER_TYPES[point.type].code,
      kindLabel: "Power point",
      popupBody: <PointDetails point={point} />,
    }));

  const placingLabel = placingId === NEW_POINT ? `new ${POWER_TYPES[newType].label.toLowerCase()}` : placingId ? pointTitle(points.find((p) => p.id === placingId)!, points.findIndex((p) => p.id === placingId)) : undefined;

  const onPlace = (x: number, y: number) => {
    if (placingId === NEW_POINT) {
      const point: PowerPoint = { id: newPowerPointId(), type: newType, location: "", serves: "", mounting: "", quantity: 1, notes: "", x, y, createdAt: new Date().toISOString() };
      setStore((current) => ({ points: [...current.points, point] }));
      setSelectedId(point.id);
      toast.success(`${POWER_TYPES[newType].label} added. Fill in its details below the plan.`);
    } else if (placingId) {
      updatePoint(placingId, { x, y });
    }
    setPlacingId(null);
  };

  const deletePoint = async (point: PowerPoint, index: number) => {
    if (!(await confirmAction(`Delete ${pointTitle(point, index)}?`, "Delete"))) return;
    setStore((current) => ({ points: current.points.filter((p) => p.id !== point.id) }));
    setSelectedId(null);
  };

  const totals = useMemo(() => {
    const counts = new Map<PowerType, number>();
    points.forEach((point) => counts.set(point.type, (counts.get(point.type) ?? 0) + (point.quantity || 1)));
    return (Object.keys(POWER_TYPES) as PowerType[]).filter((type) => counts.has(type)).map((type) => [type, counts.get(type)!] as const);
  }, [points]);

  const exportExcel = () => {
    const site = loadCurrentCableSchedule().site;
    const rows = [
      ["POWER REQUIREMENTS"],
      ["Job:", site.jobNumber, "Client:", site.client, "Date:", site.date],
      [],
      ["Ref", "Type", "Qty", "Location", "Powers", "Mounting", "Notes"],
      ...points.map((point, index) => [pointRef(index), POWER_TYPES[point.type].label, point.quantity || 1, point.location, point.serves, point.mounting, point.notes]),
      [],
      ["Totals"],
      ...totals.map(([type, count]) => ["", POWER_TYPES[type].label, count]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 5 }, { wch: 34 }, { wch: 34 }, { wch: 24 }, { wch: 36 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Power");
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    void saveFile(`Power_Requirements_${site.jobNumber || "Project"}.xlsx`, new Blob([data]));
  };

  const toggleType = (type: PowerType) =>
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20";

  return (
    <div className="h-full overflow-y-auto bg-[#edf2f7]">
      <header className="border-b border-slate-700 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300"><Zap className="h-3.5 w-3.5" /> MultiVRZ · First Fix Planning</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Power Requirements</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">Mark where power is needed on the floor plan and what type: double socket, fused spur, commando and so on.</p>
            </div>
            <Button onClick={exportExcel} disabled={!points.length} className="h-9 bg-white text-slate-900 hover:bg-slate-200"><Download className="mr-2 h-3.5 w-3.5" /> Export Excel</Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-4 text-sm">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Power points</p><p className="mt-1 font-semibold">{points.length}</p></div>
            {totals.map(([type, count]) => (
              <div key={type}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{POWER_TYPES[type].label}</p><p className="mt-1 font-semibold">{count}</p></div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-300">Power mark-up</p>
              <h2 className="mt-0.5 text-base font-bold">{drawing?.fileName || "Floor plan"}</h2>
            </div>
            <div className="p-3 sm:p-4">
              <PlanCanvas
                drawing={drawing}
                markers={markers}
                selectedDropId={selectedId ?? undefined}
                placingDropLabel={placingLabel}
                onMarkerClick={setSelectedId}
                onStartPlacing={(id) => { setSelectedId(id); setPlacingId(id); }}
                onCancelPlacing={() => setPlacingId(null)}
                onPlace={onPlace}
                onMoveMarker={(id, x, y) => updatePoint(id, { x, y })}
                toolbar={
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
                    <label className="sr-only" htmlFor="power-type">Power type</label>
                    <select id="power-type" value={newType} onChange={(event) => setNewType(event.target.value as PowerType)} className="h-8 min-w-0 flex-1 basis-40 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800">
                      {(Object.keys(POWER_TYPES) as PowerType[]).map((type) => (
                        <option key={type} value={type}>{POWER_TYPES[type].code} · {POWER_TYPES[type].label}</option>
                      ))}
                    </select>
                    <Button onClick={() => setPlacingId(NEW_POINT)} className="h-8 bg-red-600 px-3 text-xs text-white hover:bg-red-700"><Plus className="mr-1 h-3.5 w-3.5" /> Add power point</Button>
                  </div>
                }
              />
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Show on plan</span>
                {(Object.keys(POWER_TYPES) as PowerType[]).map((type) => {
                  const count = points.filter((point) => point.type === type).length;
                  if (!count) return null;
                  const hidden = hiddenTypes.has(type);
                  return (
                    <button key={type} type="button" onClick={() => toggleType(type)} aria-pressed={!hidden} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${hidden ? "border-slate-200 bg-white text-slate-400 line-through" : "border-slate-300 bg-white text-slate-700 shadow-sm"}`}>
                      <span className="rounded px-1 text-[9px] font-bold text-white" style={{ backgroundColor: hidden ? "#cbd5e1" : POWER_TYPES[type].colour }}>{POWER_TYPES[type].code}</span>
                      {POWER_TYPES[type].label} <span className="text-slate-400">{count}</span>
                    </button>
                  );
                })}
                {!points.length && <span className="text-xs text-slate-500">Choose a type, press “Add power point”, then tap the plan.</span>}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            {selected ? (
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Selected power point</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{pointTitle(selected, selectedIndex)}</h2>
                  </div>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: POWER_TYPES[selected.type].colour }}>{POWER_TYPES[selected.type].code}</span>
                </div>
                <div className="mt-3 grid gap-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <label htmlFor="pp-type">Type
                    <select id="pp-type" value={selected.type} onChange={(event) => updatePoint(selected.id, { type: event.target.value as PowerType })} className={input}>
                      {(Object.keys(POWER_TYPES) as PowerType[]).map((type) => <option key={type} value={type}>{POWER_TYPES[type].label}</option>)}
                    </select>
                  </label>
                  <label htmlFor="pp-location">Location
                    <input id="pp-location" value={selected.location} onChange={(event) => updatePoint(selected.id, { location: event.target.value })} placeholder="e.g. Check-in Zone 1, lectern wall" className={input} />
                  </label>
                  <label htmlFor="pp-serves">What it powers
                    <input id="pp-serves" value={selected.serves} onChange={(event) => updatePoint(selected.id, { serves: event.target.value })} placeholder="e.g. Hive A player and QM43T" className={input} />
                  </label>
                  <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
                    <label htmlFor="pp-mounting">Mounting
                      <select id="pp-mounting" value={selected.mounting} onChange={(event) => updatePoint(selected.id, { mounting: event.target.value })} className={input}>
                        {MOUNTING_OPTIONS.map((option) => <option key={option} value={option}>{option || "Not specified"}</option>)}
                      </select>
                    </label>
                    <label htmlFor="pp-qty">Qty
                      <input id="pp-qty" type="number" min={1} value={selected.quantity} onChange={(event) => updatePoint(selected.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} className={input} />
                    </label>
                  </div>
                  <label htmlFor="pp-notes">Notes
                    <textarea id="pp-notes" rows={2} value={selected.notes} onChange={(event) => updatePoint(selected.id, { notes: event.target.value })} placeholder="e.g. On UPS, switched from reception" className={`${input} resize-y`} />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setPlacingId(selected.id)} className="h-8 text-xs">Move on plan</Button>
                  <Button variant="outline" onClick={() => deletePoint(selected, selectedIndex)} className="h-8 border-red-200 text-xs text-red-700 hover:bg-red-50"><Trash2 className="mr-1 h-3.5 w-3.5" /> Delete</Button>
                </div>
              </section>
            ) : (
              <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                <Plug className="mb-2 h-5 w-5 text-slate-400" />
                Choose a power type above the plan, press <strong>Add power point</strong> and tap where it is needed. Tap a marker to edit it.
              </section>
            )}
          </aside>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
            <Zap className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-800">Power schedule</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{points.length} points</span>
          </div>
          {points.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  <tr><th className="px-4 py-2">Ref</th><th className="px-4 py-2">Type</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2">Location</th><th className="px-4 py-2">Powers</th><th className="px-4 py-2">Mounting</th></tr>
                </thead>
                <tbody>
                  {points.map((point, index) => (
                    <tr key={point.id} onClick={() => setSelectedId(point.id)} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${point.id === selectedId ? "bg-red-50/60" : ""}`}>
                      <td className="px-4 py-2 font-mono text-xs font-bold text-slate-700">{pointRef(index)}</td>
                      <td className="px-4 py-2"><span className="mr-2 rounded px-1 text-[9px] font-bold text-white" style={{ backgroundColor: POWER_TYPES[point.type].colour }}>{POWER_TYPES[point.type].code}</span>{POWER_TYPES[point.type].label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{point.quantity || 1}</td>
                      <td className="px-4 py-2 text-slate-700">{point.location || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-2 text-slate-700">{point.serves || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-2 text-slate-500">{point.mounting || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No power points yet. They will be listed here as you add them to the plan.</p>
          )}
        </section>
      </main>
    </div>
  );
}
