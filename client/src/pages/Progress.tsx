/*
 * Progress — installation tracking for contractors.
 * Each cable moves through Run → Terminated → Tested → In position.
 * Tap a stage to record it (date and person are saved); tap again to undo.
 */
import { useMemo, useState } from "react";

function displayLength(stored: string, unit: "m" | "ft") {
  const metres = lengthInMetres(stored);
  if (metres === null) return "";
  const value = unit === "m" ? metres : metres * 3.28084;
  return String(Math.round(value * 10) / 10);
}
import * as XLSX from "xlsx";
import { CheckCircle2, ClipboardCheck, Download, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmAction } from "@/lib/confirmAction";
import { saveFile } from "@/lib/saveFile";
import { loadCurrentCableSchedule } from "@/lib/scheduleContext";
import { CABLE_CATEGORY_META, cableCategory } from "@/lib/cableCategory";
import { PROGRESS_STAGES, usePeopleNames, useProgress, type ProgressStage } from "@/lib/progressStore";
import type { CableRow } from "@/lib/cableTypes";
import ProgressDonut from "@/components/ProgressDonut";
import { CABLE_STORAGE_KEY } from "@/lib/scheduleStorage";
import { formatLength, lengthInMetres, toStoredLength, type LengthUnit } from "@/lib/cableLength";

type StageFilter = "all" | "not-run" | "run" | "terminated" | "tested" | "complete";

const STAGE_FILTERS: { value: StageFilter; label: string }[] = [
  { value: "all", label: "All cables" },
  { value: "not-run", label: "Not run yet" },
  { value: "run", label: "Run, not terminated" },
  { value: "terminated", label: "Terminated, not tested" },
  { value: "tested", label: "Tested, not in position" },
  { value: "complete", label: "Complete" },
];

function groupOf(cable: CableRow) {
  const match = cable.source.match(/^(.*?)\s+Port\b/i);
  return match ? match[1] : cable.source.trim() || "Other";
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function Progress() {
  const [schedule, setSchedule] = useState(() => loadCurrentCableSchedule());
  const cables = schedule.cables;
  const [unit, setUnit] = useState<LengthUnit>(() => {
    try { return (localStorage.getItem("multivrz_length_unit") as LengthUnit) || "m"; } catch { return "m"; }
  });
  const chooseUnit = (next: LengthUnit) => {
    setUnit(next);
    try { localStorage.setItem("multivrz_length_unit", next); } catch { /* ignore */ }
  };

  /** Save a cable length into the cable schedule (shared on the hosted page). */
  const saveLength = (cable: CableRow, text: string) => {
    const stored = toStoredLength(text, unit);
    if (stored === cable.length) return;
    const updated = cables.map((c) => (c.id === cable.id ? { ...c, length: stored } : c));
    setSchedule((current) => ({ ...current, cables: updated }));
    if (!schedule.isProjectSchedule) {
      try { localStorage.setItem(CABLE_STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
    }
  };
  const totalMetres = cables.reduce((sum, cable) => sum + (lengthInMetres(cable.length) ?? 0), 0);
  const measured = cables.filter((cable) => lengthInMetres(cable.length) !== null).length;
  const { recordFor, setStage, loaded, shared, readOnly } = useProgress();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => Array.from(new Set(cables.map(groupOf))), [cables]);

  const doneCount = (cable: CableRow) => PROGRESS_STAGES.filter((stage) => recordFor(cable.id)[stage.key]).length;

  const matchesStage = (cable: CableRow) => {
    const r = recordFor(cable.id);
    switch (stageFilter) {
      case "not-run": return !r.run;
      case "run": return Boolean(r.run) && !r.terminated;
      case "terminated": return Boolean(r.terminated) && !r.tested;
      case "tested": return Boolean(r.tested) && !r.positioned;
      case "complete": return doneCount(cable) === PROGRESS_STAGES.length;
      default: return true;
    }
  };

  const visible = cables.filter((cable) => {
    if (group !== "all" && groupOf(cable) !== group) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${cable.cableNumber} ${cable.destination} ${cable.source} ${cable.cableType}`.toLowerCase().includes(q)) return false;
    return matchesStage(cable);
  });

  const stageTotals = PROGRESS_STAGES.map((stage) => ({ ...stage, count: cables.filter((cable) => recordFor(cable.id)[stage.key]).length }));
  const totalMarks = stageTotals.reduce((n, s) => n + s.count, 0);
  const overall = cables.length ? Math.round((totalMarks / (cables.length * PROGRESS_STAGES.length)) * 100) : 0;
  const complete = cables.filter((cable) => doneCount(cable) === PROGRESS_STAGES.length).length;

  const stageReached = (cable: CableRow) => {
    const r = recordFor(cable.id);
    if (r.positioned) return "positioned";
    if (r.tested) return "tested";
    if (r.terminated) return "terminated";
    if (r.run) return "run";
    return "none";
  };
  // Ordered stages: one green ramp, light (early) to dark (complete); grey = not started.
  const donutSlices = [
    { key: "none", label: "Not started", colour: "#cbd5e1" },
    { key: "run", label: "Run", colour: "#a7f3d0" },
    { key: "terminated", label: "Terminated", colour: "#34d399" },
    { key: "tested", label: "Tested", colour: "#059669" },
    { key: "positioned", label: "In position (complete)", colour: "#065f46" },
  ].map((slice) => ({ ...slice, count: cables.filter((cable) => stageReached(cable) === slice.key).length }));

  const peopleIds = cables.flatMap((cable) => PROGRESS_STAGES.map((stage) => recordFor(cable.id)[stage.key]?.by ?? ""));
  const names = usePeopleNames(peopleIds);

  const toggle = async (cable: CableRow, stage: ProgressStage) => {
    if (readOnly) return;
    const current = recordFor(cable.id)[stage];
    if (current && !(await confirmAction(`Undo “${PROGRESS_STAGES.find((s) => s.key === stage)!.label}” for cable ${cable.cableNumber}?`, "Undo"))) return;
    try {
      await setStage([cable.id], stage, !current);
    } catch {
      toast.error("That change could not be saved. You may have view-only access.");
    }
  };

  const bulkMark = async (stage: ProgressStage) => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await setStage(Array.from(selected), stage, true);
      toast.success(`${selected.size} cable${selected.size === 1 ? "" : "s"} marked ${PROGRESS_STAGES.find((s) => s.key === stage)!.label.toLowerCase()}`);
      setSelected(new Set());
    } catch {
      toast.error("Some changes could not be saved. You may have view-only access.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportExcel = () => {
    const rows = [
      ["INSTALLATION PROGRESS"],
      ["Job:", schedule.site.jobNumber, "Client:", schedule.site.client, "Exported:", new Date().toLocaleString()],
      [],
      ["Cable", "Type", "Source", "Destination", "Length (m)", "Length (ft)", ...PROGRESS_STAGES.flatMap((s) => [s.label, `${s.label} by`])],
      ...cables.map((cable) => {
        const r = recordFor(cable.id);
        return [
          cable.cableNumber,
          cable.cableType,
          cable.source,
          cable.destination,
          lengthInMetres(cable.length) ?? "",
          lengthInMetres(cable.length) !== null ? Math.round(lengthInMetres(cable.length)! * 3.28084 * 10) / 10 : "",
          ...PROGRESS_STAGES.flatMap((s) => {
            const mark = r[s.key];
            return mark ? [new Date(mark.at).toLocaleDateString(), names[mark.by] || ""] : ["", ""];
          }),
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 7 }, { wch: 12 }, { wch: 24 }, { wch: 44 }, ...PROGRESS_STAGES.flatMap(() => [{ wch: 11 }, { wch: 16 }])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Progress");
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    void saveFile(`Installation_Progress_${schedule.site.jobNumber || "Project"}.xlsx`, new Blob([data]));
  };

  return (
    <div className="h-full overflow-y-auto bg-[#edf2f7]">
      <header className="border-b border-slate-700 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300"><ClipboardCheck className="h-3.5 w-3.5" /> MultiVRZ · Installation</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Progress</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">Record each cable as it is run, terminated, tested and in position. Tap a stage to mark it done.</p>
            </div>
            <Button onClick={exportExcel} className="h-9 bg-white text-slate-900 hover:bg-slate-200"><Download className="mr-2 h-3.5 w-3.5" /> Export Excel</Button>
          </div>
          <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Overall</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{overall}%</p>
              <p className="text-[11px] text-slate-400">{complete} of {cables.length} cables complete</p>
            </div>
            {stageTotals.map((stage) => (
              <div key={stage.key}>
                <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500"><span>{stage.label}</span><span className="tabular-nums text-slate-300">{stage.count}/{cables.length}</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${cables.length ? (stage.count / cables.length) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${shared ? (readOnly ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900") : "border-slate-200 bg-white text-slate-600"}`}>
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {shared
              ? readOnly
                ? "You can view progress but not change it. Ask the page owner for edit access."
                : "Progress is shared: updates appear for everyone with this page, with the date and who recorded them."
              : "Progress is saved on this device only in this view."}
          </span>
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-800">Where each cable is up to</h2>
            <p className="mt-0.5 text-xs text-slate-500">Each cable counted once, at the furthest stage it has reached.</p>
            <div className="mt-3"><ProgressDonut slices={donutSlices} total={cables.length} /></div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-slate-800">Cable lengths</h2>
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-semibold" role="group" aria-label="Length unit">
                {(["m", "ft"] as const).map((u) => (
                  <button key={u} type="button" onClick={() => chooseUnit(u)} aria-pressed={unit === u} className={`px-2.5 py-1 ${unit === u ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{u === "m" ? "Metres" : "Feet"}</button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{formatLength(totalMetres, unit)}</p>
            <p className="text-xs text-slate-500">{unit === "m" ? formatLength(totalMetres, "ft") : formatLength(totalMetres, "m")} · total of recorded lengths</p>
            <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-600"><span>Cables with a length</span><span className="tabular-nums">{measured} of {cables.length}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${cables.length ? (measured / cables.length) * 100 : 0}%` }} /></div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Enter each length in the list below. It is saved to the cable schedule, so the Length column there updates too.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative sm:w-64">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find cable or destination…" className="h-9 pl-8 text-xs" />
            </div>
            <select value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Source" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700">
              <option value="all">All sources</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as StageFilter)} aria-label="Stage" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700">
              {STAGE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <span className="text-xs text-slate-500 sm:ml-auto">{visible.length} shown</span>
          </div>

          {!readOnly && selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
              <span className="font-semibold text-emerald-900">{selected.size} selected. Mark as:</span>
              {PROGRESS_STAGES.map((stage) => (
                <Button key={stage.key} disabled={busy} onClick={() => bulkMark(stage.key)} className="h-7 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700">{stage.label}</Button>
              ))}
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto font-semibold text-emerald-800 underline">Clear</button>
            </div>
          )}

          {!loaded ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Loading progress…</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((cable) => {
                const record = recordFor(cable.id);
                const done = doneCount(cable);
                const colour = CABLE_CATEGORY_META[cableCategory(cable)].colour;
                return (
                  <li key={cable.id} className={`flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center ${done === PROGRESS_STAGES.length ? "bg-emerald-50/50" : ""}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {!readOnly && (
                        <input type="checkbox" checked={selected.has(cable.id)} onChange={() => toggleSelected(cable.id)} aria-label={`Select cable ${cable.cableNumber}`} className="h-4 w-4 shrink-0 accent-emerald-600" />
                      )}
                      <span className="shrink-0 rounded px-2 py-1 font-mono text-xs font-bold text-white" style={{ backgroundColor: colour }}>{cable.cableNumber}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-5 text-slate-800">{cable.destination || "Destination not recorded"}</p>
                        <p className="text-[11px] text-slate-500">{cable.source} · {cable.cableType}</p>
                      </div>
                      {done === PROGRESS_STAGES.length && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-600 lg:hidden" aria-label="Complete" />}
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500 lg:w-36 lg:flex-col lg:items-stretch lg:gap-0.5">
                      <span className="lg:sr-only">Length</span>
                      <span className="relative">
                        <input
                          key={`${cable.id}-${cable.length}-${unit}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={displayLength(cable.length, unit)}
                          onBlur={(event) => saveLength(cable, event.target.value)}
                          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
                          disabled={readOnly}
                          placeholder="—"
                          aria-label={`Length of cable ${cable.cableNumber} in ${unit === "m" ? "metres" : "feet"}`}
                          className="h-9 w-24 rounded-md border border-slate-300 bg-white py-1 pl-2 pr-7 text-right text-sm tabular-nums text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-50 lg:w-full"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{unit}</span>
                      </span>
                      {lengthInMetres(cable.length) !== null && <span className="text-[10px] font-medium tabular-nums text-slate-400 lg:text-right">{formatLength(lengthInMetres(cable.length)!, unit === "m" ? "ft" : "m")}</span>}
                    </label>
                    <div className="grid grid-cols-4 gap-1.5 lg:w-[30rem] lg:shrink-0">
                      {PROGRESS_STAGES.map((stage) => {
                        const mark = record[stage.key];
                        return (
                          <button
                            key={stage.key}
                            type="button"
                            disabled={readOnly}
                            onClick={() => toggle(cable, stage.key)}
                            aria-pressed={Boolean(mark)}
                            title={mark ? `${stage.label} ${new Date(mark.at).toLocaleString()}${names[mark.by] ? ` by ${names[mark.by]}` : ""}` : `Mark ${stage.label.toLowerCase()}`}
                            className={`flex min-h-[2.75rem] flex-col items-center justify-center rounded-md border px-1 py-1 text-center leading-tight transition ${mark ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-500 hover:border-emerald-400 hover:text-emerald-700"} disabled:cursor-default`}
                          >
                            <span className="text-[11px] font-bold">{mark ? "✓ " : ""}{stage.label}</span>
                            {mark && <span className="text-[9px] font-medium opacity-90">{shortDate(mark.at)}{names[mark.by] ? ` · ${names[mark.by]}` : ""}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
              {!visible.length && <li className="px-4 py-10 text-center text-sm text-slate-500">No cables match these filters.</li>}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
