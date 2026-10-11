import { confirmAction } from "@/lib/confirmAction";
import { saveFile } from "@/lib/saveFile";
import { dropIdForDestination, loadDestinationPlannerStore } from "@/lib/destinationPlanner";
import { isKarrinyup } from "@/lib/sites";
import type { CableRow } from "@/lib/cableTypes";
import * as XLSX from "xlsx";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Download,
  ExternalLink,
  FileText,
  Layers3,
  MapPin,
  PackagePlus,
  RefreshCw,
  Route,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { loadCurrentCableSchedule, type LoadedCableSchedule } from "@/lib/scheduleContext";
import { FIBRE_PROVISION } from "@/lib/fibreProvision";
import {
  buildConsumablesPlan,
  drumsFor,
  createManualMaterial,
  MATERIAL_CATEGORIES,
  type EndpointDrop,
  type MaterialCategory,
  type MaterialItem,
  type MaterialStatus,
} from "@/lib/consumablesPlanner";

const STATUSES: MaterialStatus[] = ["Specified", "Ordered", "Delivered", "Installed", "Surplus"];

const STATUS_STYLE: Record<MaterialStatus, string> = {
  Specified: "border-slate-300 bg-slate-100 text-slate-700",
  Ordered: "border-amber-200 bg-amber-50 text-amber-800",
  Delivered: "border-blue-200 bg-blue-50 text-blue-800",
  Installed: "border-emerald-200 bg-emerald-50 text-emerald-800",
  Surplus: "border-violet-200 bg-violet-50 text-violet-800",
};

const CATEGORY_STYLE: Record<MaterialCategory, { line: string; pill: string }> = {
  Rack: { line: "bg-slate-700", pill: "bg-slate-100 text-slate-700" },
  "Patch Panel": { line: "bg-cyan-500", pill: "bg-cyan-50 text-cyan-800" },
  Keystone: { line: "bg-sky-500", pill: "bg-sky-50 text-sky-800" },
  "Network Cable": { line: "bg-blue-500", pill: "bg-blue-50 text-blue-800" },
  "GOP Box": { line: "bg-indigo-500", pill: "bg-indigo-50 text-indigo-800" },
  "Patch Lead": { line: "bg-yellow-400", pill: "bg-yellow-50 text-yellow-800" },
  "AV Lead": { line: "bg-pink-500", pill: "bg-pink-50 text-pink-800" },
  Containment: { line: "bg-stone-500", pill: "bg-stone-100 text-stone-700" },
  "Speaker Connector": { line: "bg-orange-500", pill: "bg-orange-50 text-orange-800" },
  "DMX Connector": { line: "bg-purple-500", pill: "bg-purple-50 text-purple-800" },
  "Speaker Cable": { line: "bg-amber-500", pill: "bg-amber-50 text-amber-800" },
  "DMX Cable": { line: "bg-violet-500", pill: "bg-violet-50 text-violet-800" },
  Fibre: { line: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800" },
  Labelling: { line: "bg-teal-500", pill: "bg-teal-50 text-teal-800" },
  Other: { line: "bg-slate-400", pill: "bg-slate-100 text-slate-700" },
};

interface ConsumablesStore {
  overrides: Record<string, Partial<MaterialItem>>;
  manual: MaterialItem[];
}

function storageKey(scope: string) {
  return `multivrz_consumables_${scope}_v3`;
}

function readStore(key: string): ConsumablesStore {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { overrides: {}, manual: [] };
    const parsed = JSON.parse(raw) as Partial<ConsumablesStore>;
    return {
      overrides: parsed.overrides ?? {},
      manual: Array.isArray(parsed.manual) ? parsed.manual : [],
    };
  } catch {
    return { overrides: {}, manual: [] };
  }
}

function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  void saveFile(filename, blob);
}

function matchesText(value: string, query: string) {
  return !query || value.toLowerCase().includes(query.toLowerCase());
}

function MaterialCard({
  item,
  onChange,
  onDelete,
}: {
  item: MaterialItem;
  onChange: (id: string, changes: Partial<MaterialItem>) => void;
  onDelete?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const category = CATEGORY_STYLE[item.category];

  return (
    <article className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${item.status === "Surplus" ? "opacity-70" : "border-slate-200"}`}>
      <div className={`h-1 ${category.line}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${category.pill}`}>
            <Box className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${category.pill}`}>{item.category}</span>
                  {item.partNumber && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.partNumber}</span>}
                </div>
                <h2 className="mt-1.5 text-sm font-bold leading-5 text-slate-900">{item.description || "New material"}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.specification || "Add specification"}</p>
              </div>
              <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
                <p className="text-lg font-bold leading-5 text-slate-900">{item.qty}</p>
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{item.unit}</p>
                {item.metres !== undefined && <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{Math.round(item.metres * (1 + (item.wastagePercent ?? 20) / 100))} m incl. {item.wastagePercent ?? 20}%</p>}
              </div>
            </div>

            {item.notes && <p className="mt-3 border-l-2 border-slate-200 pl-2.5 text-xs leading-5 text-slate-500">{item.notes}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => onChange(item.id, { status })}
                  className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${
                    item.status === status ? STATUS_STYLE[status] : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                  }`}
                >
                  {status}
                </button>
              ))}
              <span className="flex-1" />
              {item.productLink && (
                <a
                  href={item.productLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50"
                >
                  Official product <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                {expanded ? "Close" : "Details"}
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          {[
            { label: "Description", key: "description" as const, full: true },
            { label: "Part number", key: "partNumber" as const, full: false },
            { label: "Supplier", key: "supplier" as const, full: false },
            { label: "Specification", key: "specification" as const, full: true },
            { label: "Product link", key: "productLink" as const, full: true },
            { label: "Notes", key: "notes" as const, full: true },
          ].map((field) => (
            <label key={field.key} className={field.full ? "sm:col-span-2" : ""}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{field.label}</span>
              <input
                value={item[field.key]}
                onChange={(event) => onChange(item.id, { [field.key]: event.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          ))}
          {item.metres !== undefined && (
            <>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Drum length (m)</span>
                <input
                  type="number"
                  min={1}
                  value={item.drumLength ?? ""}
                  onChange={(event) => onChange(item.id, { drumLength: Math.max(1, Number(event.target.value) || 1) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
              <label>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Wastage %</span>
                <input
                  type="number"
                  min={0}
                  value={item.wastagePercent ?? 20}
                  onChange={(event) => onChange(item.id, { wastagePercent: Math.max(0, Number(event.target.value) || 0) })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            </>
          )}
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Quantity</span>
            <input
              type="number"
              min="0"
              value={item.qty}
              onChange={(event) => onChange(item.id, { qty: Number(event.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Unit</span>
            <input
              value={item.unit}
              onChange={(event) => onChange(item.id, { unit: event.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          {item.source === "manual" && (
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Category</span>
              <select
                value={item.category}
                onChange={(event) => onChange(item.id, { category: event.target.value as MaterialCategory })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              >
                {MATERIAL_CATEGORIES.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
              </select>
            </label>
          )}
          {onDelete && (
            <div className="sm:col-span-2">
              <button onClick={() => onDelete(item.id)} className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-800">
                <Trash2 className="h-3.5 w-3.5" /> Remove manual material
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function EndpointStatus({ status }: { status: EndpointDrop["status"] }) {
  const style: Record<EndpointDrop["status"], string> = {
    Pending: "border-slate-200 bg-slate-100 text-slate-700",
    Installed: "border-blue-200 bg-blue-50 text-blue-800",
    Tested: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Fault: "border-red-200 bg-red-50 text-red-800",
  };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${style[status]}`}>{status}</span>;
}

function EndpointTable({ endpoints, search }: { endpoints: EndpointDrop[]; search: string }) {
  const filtered = endpoints.filter((endpoint) => matchesText(`${endpoint.cableNumber} ${endpoint.endpointType} ${endpoint.location} ${endpoint.cableType} ${endpoint.signalType} ${endpoint.boxRequirement}`, search));

  if (!filtered.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No endpoint or cable-drop records match this view.</p>;
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Cable</th>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Remote end / location</th>
              <th className="px-4 py-3">Cable type</th>
              <th className="px-4 py-3">Rack</th>
              <th className="px-4 py-3">GOP box</th>
              <th className="px-4 py-3">Length</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((endpoint, index) => (
              <tr key={endpoint.id} className={`border-b border-slate-100 ${index % 2 ? "bg-slate-50/50" : "bg-white"}`}>
                <td className="px-4 py-3 font-bold text-slate-800">{endpoint.cableNumber}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">{endpoint.endpointType}</span></td>
                <td className="max-w-xs px-4 py-3 text-sm font-medium text-slate-700">{endpoint.location}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{endpoint.cableType || "—"}<br /><span className="text-slate-400">{endpoint.signalType || "—"}</span></td>
                <td className="px-4 py-3 text-xs text-slate-500">{endpoint.rackLocation || "—"}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{endpoint.boxRequirement}</td>
                <td className="px-4 py-3 text-xs font-semibold text-slate-600">{endpoint.length || "—"}</td>
                <td className="px-4 py-3"><EndpointStatus status={endpoint.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-3 md:hidden">
        {filtered.map((endpoint) => (
          <article key={endpoint.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-cyan-700">CABLE {endpoint.cableNumber}</p>
                <p className="mt-1 text-sm font-bold text-slate-900">{endpoint.location}</p>
                <p className="mt-1 text-xs text-slate-500">{endpoint.endpointType} · {endpoint.cableType || endpoint.signalType || "Cable type TBC"}</p>
              </div>
              <EndpointStatus status={endpoint.status} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
              <div><p className="font-bold uppercase tracking-wide text-slate-400">GOP box</p><p className="mt-1 font-semibold text-slate-700">{endpoint.boxRequirement}</p></div>
              <div><p className="font-bold uppercase tracking-wide text-slate-400">Length</p><p className="mt-1 font-semibold text-slate-700">{endpoint.length || "—"}</p></div>
              <div className="col-span-2"><p className="font-bold uppercase tracking-wide text-slate-400">Rack termination</p><p className="mt-1 font-semibold text-slate-700">{endpoint.rackLocation || "—"}</p></div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value, accent, detail }: { label: string; value: string | number; accent: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

export default function Consumables() {
  const [schedule, setSchedule] = useState<LoadedCableSchedule>(() => loadCurrentCableSchedule());
  const [store, setStore] = useState<ConsumablesStore>(() => readStore(storageKey(schedule.storageScope)));
  const [tab, setTab] = useState("materials");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | "All">("All");
  // Runs without a length are measured from the floor plan (rack marker → drop marker).
  const estimator = useMemo(() => {
    const drops = loadDestinationPlannerStore(schedule.storageScope);
    const scale = drops.scale?.metresAcross ?? (isKarrinyup() ? (1108 * 5) / 110 : undefined);
    const aspect = isKarrinyup() ? 775 / 1108 : 0.7;
    const rack = drops.positions["__connection-rack"];
    if (!scale) return undefined;
    const at = (name: string) => drops.positions[dropIdForDestination(name)];
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      (Math.abs(a.x - b.x) / 100) * scale + (Math.abs(a.y - b.y) / 100) * aspect * scale;
    return (cable: CableRow) => {
      const dest = at(cable.destination);
      if (!dest) return null;
      if (cable.rackPort === "none") {
        const src = at(cable.source);
        return src ? dist(src, dest) * 1.1 + 4 : null;
      }
      return rack ? dist(rack, dest) * 1.1 + 7 : null;
    };
  }, [schedule.storageScope, schedule.cables]);
  const plan = useMemo(() => buildConsumablesPlan(schedule.cables, estimator), [schedule.cables, estimator]);

  useEffect(() => {
    localStorage.setItem(storageKey(schedule.storageScope), JSON.stringify(store));
  }, [schedule.storageScope, store]);

  const materials = useMemo(() => {
    const calculated = plan.materials.map((item) => {
      const merged = { ...item, ...(store.overrides[item.id] ?? {}), source: "calculated" as const };
      // Cable on drums: quantity always follows metres, drum length and wastage.
      if (item.metres !== undefined) {
        merged.metres = item.metres;
        merged.qty = drumsFor(merged);
        merged.unit = `${merged.drumLength} m drums`;
      }
      return merged;
    });
    return [...calculated, ...store.manual];
  }, [plan.materials, store]);

  const filteredMaterials = useMemo(() => materials.filter((item) => {
    const matchesCategory = categoryFilter === "All" || item.category === categoryFilter;
    const joined = `${item.description} ${item.partNumber} ${item.specification} ${item.supplier} ${item.notes}`;
    return matchesCategory && matchesText(joined, search);
  }), [materials, categoryFilter, search]);

  const handleRefresh = () => {
    const refreshed = loadCurrentCableSchedule();
    setSchedule(refreshed);
    setStore(readStore(storageKey(refreshed.storageScope)));
    toast.success("Materials and endpoints refreshed from the cable schedule");
  };

  const handleMaterialChange = (id: string, changes: Partial<MaterialItem>) => {
    setStore((current) => {
      const manualIndex = current.manual.findIndex((item) => item.id === id);
      if (manualIndex >= 0) {
        const manual = [...current.manual];
        manual[manualIndex] = { ...manual[manualIndex], ...changes };
        return { ...current, manual };
      }
      return { ...current, overrides: { ...current.overrides, [id]: { ...(current.overrides[id] ?? {}), ...changes } } };
    });
  };

  const addManualMaterial = () => {
    setStore((current) => ({ ...current, manual: [...current.manual, createManualMaterial()] }));
    toast.success("Manual material added");
  };

  const deleteManualMaterial = (id: string) => {
    setStore((current) => ({ ...current, manual: current.manual.filter((item) => item.id !== id) }));
    toast.success("Manual material removed");
  };

  const resetRegister = async () => {
    if (!await confirmAction("Reset material statuses, notes and manual additions for this project?")) return;
    setStore({ overrides: {}, manual: [] });
    toast.success("Consumables reset to the current schedule calculation");
  };

  const exportCurrent = () => {
    const safeName = (schedule.site.jobNumber || schedule.site.siteName || "Cable_Schedule").replace(/[^a-z0-9]+/gi, "_");
    const title = `${schedule.site.siteName || safeName} – materials list (${new Date().toLocaleDateString()})`;
    const materialHeaders = ["Category", "Description", "Part number", "Qty", "Unit", "Metres incl. wastage", "Supplier", "Status", "Required", "Specification", "Notes", "Product link", "Source"];
    const materialRows = materials.map((item) => [item.category, item.description, item.partNumber, item.qty, item.unit, item.metres !== undefined ? Math.round(item.metres * (1 + (item.wastagePercent ?? 20) / 100)) : "", item.supplier, item.status, item.required ? "Yes" : "Optional", item.specification, item.notes, item.productLink, item.source]);
    const endpointHeaders = ["Cable", "Endpoint", "Remote end / location", "Cable type", "Signal", "Rack location", "GOP box", "Length", "Status", "Notes"];
    const endpointRows = plan.endpoints.map((e) => [e.cableNumber, e.endpointType, e.location, e.cableType, e.signalType, e.rackLocation, e.boxRequirement, e.length, e.status, e.notes]);
    const sheet = (heading: string, headers: string[], rows: Array<Array<string | number>>, widths: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet([[heading], [], headers, ...rows]);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 2, c: 0 }, e: { r: 2 + rows.length, c: headers.length - 1 } }) };
      return ws;
    };
    const wb = XLSX.utils.book_new();
    const materialsSheet = sheet(title, materialHeaders, materialRows, [18, 58, 16, 8, 12, 10, 22, 12, 10, 60, 70, 40, 11]);
    const endpointsSheet = sheet(`${schedule.site.siteName || safeName} – endpoint drops`, endpointHeaders, endpointRows, [9, 13, 48, 24, 12, 26, 12, 9, 10, 40]);
    if (tab === "endpoints") {
      XLSX.utils.book_append_sheet(wb, endpointsSheet, "Endpoint Drops");
      XLSX.utils.book_append_sheet(wb, materialsSheet, "Materials");
    } else {
      XLSX.utils.book_append_sheet(wb, materialsSheet, "Materials");
      XLSX.utils.book_append_sheet(wb, endpointsSheet, "Endpoint Drops");
    }
    const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    void saveFile(`${safeName}_${tab === "endpoints" ? "Endpoint_Drops" : "Materials"}.xlsx`, new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  const selectedNetworkMaterial = materials.find((item) => item.id === "excel-cat6a-cable");

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#eef3f7]">
      <header className="shrink-0 border-b border-slate-700 bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-cyan-300"><Layers3 className="h-3.5 w-3.5" /> MultiVRZ · First Fix Procurement</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Consumables & Endpoint Register</h1>
              <p className="mt-0.5 text-sm text-slate-400">Schedule-derived materials, official product references and remote cable drops.</p>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button variant="outline" onClick={handleRefresh} className="h-9 border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800 hover:text-white"><RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh schedule</Button>
              <Button onClick={exportCurrent} className="h-9 bg-cyan-400 text-slate-950 hover:bg-cyan-300"><Download className="mr-2 h-3.5 w-3.5" /> {tab === "endpoints" ? "Export endpoints" : "Export materials"}</Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/10 pt-3 sm:grid-cols-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Schedule source</p><p className="mt-1 text-sm font-semibold text-white">{schedule.isProjectSchedule ? "Project schedule draft" : "Current Cable Schedule"}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Project / job</p><p className="mt-1 truncate text-sm font-semibold text-white">{schedule.site.siteName || schedule.site.jobNumber || "Unassigned project"}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Engineer</p><p className="mt-1 text-sm font-semibold text-white">{schedule.site.engineer || "To be assigned"}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Revision</p><p className="mt-1 text-sm font-semibold text-white">{schedule.site.revision || "Rev A"}</p></div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          {schedule.isProjectSchedule && !schedule.cables.length ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
              <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-bold">No project cable rows are available yet.</h2><p className="mt-1 text-sm text-amber-900">Build or import a schedule in the DAVE Cable Schedule Builder, then use Refresh schedule here to calculate materials and endpoints.</p></div></div>
            </div>
          ) : (
            <>
              {(plan.summary.missingLengths.network + plan.summary.missingLengths.speaker + plan.summary.missingLengths.dmx) > 0 && (
                <div className="mb-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" /><span><strong>Cable lengths needed:</strong> {plan.summary.missingLengths.network} network, {plan.summary.missingLengths.speaker} speaker and {plan.summary.missingLengths.dmx} DMX runs have no length in the Cable Schedule and no position on the plan, so cable drums are short until they're filled in.</span></div>
              )}
              {plan.summary.estimatedRuns > 0 && (
                <div className="mb-3 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><Cable className="h-4 w-4 shrink-0 text-sky-700" /><span><strong>Estimated from the plan:</strong> {plan.summary.estimatedRuns} runs have no length in the Cable Schedule, so their length is measured from the floor plan (rack marker to drop marker, right-angle route +10%, plus 7 m for rise, drop and termination). Cable drums include 20% wastage. Enter real lengths in the schedule to replace the estimates.</span></div>
              )}
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Network drops" value={plan.summary.networkLocations} accent="text-cyan-300" detail={`${plan.summary.networkDrops} cables · ${plan.summary.gopBoxes} GOP boxes · ${plan.summary.networkLength} m`} />
                <Stat label="Speaker drops" value={plan.summary.speakerPoints} accent="text-amber-300" detail={`${plan.summary.speakerDrops} runs · ${plan.summary.speakerLength} m`} />
                <Stat label="DMX drops" value={plan.summary.dmxPoints} accent="text-violet-300" detail={`${plan.summary.dmxDrops} runs · ${plan.summary.dmxLength} m`} />
                <Stat label="Patch leads" value={plan.summary.patchLeads} accent="text-yellow-300" detail="47U → 12U, colour set" />
              </section>

              <section className="mt-5 rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-700" /><div><h2 className="font-bold text-cyan-950">Verified Excel Networking material set</h2><p className="mt-1 text-sm leading-6 text-cyan-900">The materials register is based on the official Excel Networking products supplied: the WR390 wall rack (now 15U, part number to confirm), unloaded 24-port panel frame, Cat6A screened keystone jack, GOP boxes and Cat6/Cat6A cable. Quantities are recalculated from the current schedule.</p></div></div>
              </section>

              <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><h2 className="font-bold text-emerald-950">Specified Samsung AAE fibre provision</h2><p className="mt-1 text-sm leading-6 text-emerald-900">The rack includes <strong>{FIBRE_PROVISION.quantity} × {FIBRE_PROVISION.lengthMetres} m</strong> pre-terminated LC–LC OM4 bend-insensitive multimode links and matching LC duplex feedthroughs on the U4 Fibre / Vortex panel. These are valid for an AAE Snow Box up to 100 m and are listed in Calculated Materials.</p><p className="mt-1 text-xs leading-5 text-amber-900"><strong>Controller check:</strong> CS4B uses different LR4/OS2 or SR4/MPO Type B link requirements, so the final controller must be confirmed before ordering.</p><a href={FIBRE_PROVISION.sourceDocumentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-emerald-800 underline underline-offset-2">View Samsung fibre crib sheet</a></div></div>
              </section>

              <Tabs value={tab} onValueChange={setTab} className="mt-5">
                <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 sm:w-auto sm:inline-grid">
                  <TabsTrigger value="materials" className="gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm"><Box className="h-3.5 w-3.5" /><span className="hidden sm:inline">Calculated </span>Materials</TabsTrigger>
                  <TabsTrigger value="manual" className="gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm"><PackagePlus className="h-3.5 w-3.5" />Extras</TabsTrigger>
                  <TabsTrigger value="endpoints" className="gap-1.5 rounded-lg px-3 py-2 text-xs sm:text-sm"><MapPin className="h-3.5 w-3.5" /><span className="hidden sm:inline">Endpoint </span>Drops</TabsTrigger>
                </TabsList>

                <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center">
                  <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "endpoints" ? "Search cable, endpoint or location…" : "Search materials, part number or specification…"} className="h-10 border-slate-200 pl-9" /></div>
                  {tab !== "endpoints" && <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as MaterialCategory | "All")} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-cyan-500"><option>All</option>{MATERIAL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>}
                  <Button variant="outline" onClick={resetRegister} className="h-10 border-amber-300 text-amber-800 hover:bg-amber-50"><Settings2 className="mr-2 h-3.5 w-3.5" /> Reset</Button>
                </div>

                <TabsContent value="materials" className="mt-4 space-y-4">
                  {selectedNetworkMaterial && <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center"><Cable className="h-5 w-5 shrink-0 text-blue-700" /><p><strong>Installed network cable:</strong> {selectedNetworkMaterial.description}. Drums are worked out from the schedule lengths, or the floor plan where a length is missing, plus wastage.</p></div>}
                  <div className="grid gap-3 xl:grid-cols-2">{filteredMaterials.filter((item) => item.source === "calculated").map((item) => <MaterialCard key={item.id} item={item} onChange={handleMaterialChange} />)}</div>
                  {!filteredMaterials.filter((item) => item.source === "calculated").length && <p className="py-12 text-center text-sm text-slate-500">No calculated materials match this filter.</p>}
                </TabsContent>

                <TabsContent value="manual" className="mt-4">
                  <section className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex gap-3"><PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" /><div><h2 className="font-bold text-violet-950">Manual additions and site extras</h2><p className="mt-1 text-sm text-violet-900">Use this tab for supplier-selected items, site variations or additions not produced by the schedule calculation.</p></div></div><Button onClick={addManualMaterial} className="bg-violet-700 hover:bg-violet-800"><PackagePlus className="mr-2 h-4 w-4" /> Add material</Button></div>
                  </section>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">{filteredMaterials.filter((item) => item.source === "manual").map((item) => <MaterialCard key={item.id} item={item} onChange={handleMaterialChange} onDelete={deleteManualMaterial} />)}</div>
                  {!filteredMaterials.filter((item) => item.source === "manual").length && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center"><PackagePlus className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">No manual materials added</p><p className="mt-1 text-xs text-slate-400">Add anything that is not driven from the cable schedule.</p></div>}
                </TabsContent>

                <TabsContent value="endpoints" className="mt-4">
                  <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 bg-slate-900 px-4 py-3 text-white"><div className="flex items-center gap-2"><Route className="h-4 w-4 text-cyan-300" /><h2 className="text-sm font-bold uppercase tracking-[0.1em]">Remote endpoints & cable drops</h2></div><p className="mt-1 text-xs text-slate-400">Every scheduled network drop is allocated to a remote-end GOP box. The default is a 2-way GOP; add a “GOP 4” note to the related schedule row where an endpoint needs a four-way box.</p></div>
                    <EndpointTable endpoints={plan.endpoints} search={search} />
                  </section>
                  <section className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4"><MapPin className="h-5 w-5 text-indigo-600" /><h2 className="mt-2 font-bold text-slate-900">GOP boxes at remote end</h2><p className="mt-1 text-sm leading-6 text-slate-500">Remote GOP requirements are separated from the connection rack and calculated in 10-pack quantities where a box is indicated.</p></div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4"><Cable className="h-5 w-5 text-amber-600" /><h2 className="mt-2 font-bold text-slate-900">Van Damme speaker cable</h2><p className="mt-1 text-sm leading-6 text-slate-500">Pendant-associated routes receive 1.5 mm² allocation; subwoofer-associated routes receive 2.5 mm² allocation. Any unclassified speaker route remains flagged for review.</p></div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><CircleHelp className="h-5 w-5 text-emerald-700" /><h2 className="mt-2 font-bold text-emerald-950">Specified Fibre / Vortex links</h2><p className="mt-1 text-sm leading-6 text-emerald-900">Two {FIBRE_PROVISION.lengthMetres} m AAE-compatible OM4 LC–LC links terminate at the rear of the U4 Fibre / Vortex panel. Once their remote Samsung LED locations are added to the schedule, this endpoint tab will list them alongside the standard cable drops.</p></div>
                  </section>
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
