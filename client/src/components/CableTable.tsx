import { leadKindOf, DEFAULT_PATCH_LEAD_LENGTH, hasPatchLead, patchColour, patchLeadSummary } from "@/lib/patchLeads";
import { confirmAction } from "@/lib/confirmAction";
/*
 * CableTable — full-width scrollable cable schedule table
 * Design: Clean Professional Dashboard
 * Mobile: card-based list view (< md breakpoint)
 * Desktop: sticky header row, frozen cable-number column, toolbar with search/filter/export
 * Features: bulk status update, colour legend, cable length totals by type
 */
import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import CableTableRow from "./CableTableRow";
import {
  createEmptyRow,
  STATUS_OPTIONS,
  STATUS_CLASS,
  type CableRow,
  type CableStatus,
  type SiteDetails,
} from "@/lib/cableTypes";
import { exportToExcel } from "@/lib/exportExcel";
import { exportCablePdf } from "@/lib/exportCablePdf";

interface Props {
  cables: CableRow[];
  site: SiteDetails;
  onChange: (cables: CableRow[]) => void;
}

// Colour legend entries — matches CableTableRow colour map
const LEGEND_ITEMS = [
  { label: "Cat6A",         colour: "#dbeafe" },
  { label: "Cat6",          colour: "#eff6ff" },
  { label: "FST",           colour: "#f5f3ff" },
  { label: "Twin Speaker",  colour: "#fffbeb" },
  { label: "Coax / SDI",   colour: "#fff7ed" },
  { label: "HDMI",          colour: "#ecfeff" },
  { label: "XLR",           colour: "#f0fdf4" },
  { label: "USB",           colour: "#f0fdfa" },
];

const COLUMNS = [
  { label: "",                     width: "w-8"   },
  { label: "Cable No.",            width: "w-20"  },
  { label: "Cable Type",           width: "min-w-[130px]" },
  { label: "Signal Type",          width: "min-w-[110px]" },
  { label: "Source",               width: "min-w-[200px]" },
  { label: "Destination",          width: "min-w-[320px]" },
  { label: "Length",               width: "min-w-[90px]"  },
  { label: "Patch / Rack Location",width: "min-w-[210px]" },
  { label: "Lead 47U → 12U", width: "min-w-[170px]" },
  { label: "At Destination – Part Nos.", width: "min-w-[230px]" },
  { label: "Dest. Lengths", width: "min-w-[90px]" },
  { label: "Status",               width: "w-32"  },
  { label: "Notes",                width: "min-w-[220px]" },
  { label: "",                     width: "w-10"  },
];

// ── Mobile cable card with swipe gestures ────────────────────────────────────
const STATUS_COLOURS: Record<CableStatus, string> = {
  Pending:   "bg-slate-100 text-slate-600 border-slate-300",
  Installed: "bg-blue-50 text-blue-700 border-blue-200",
  Tested:    "bg-green-50 text-green-700 border-green-200",
  Fault:     "bg-red-50 text-red-700 border-red-200",
};

function MobileCableCard({
  row,
  onStatusChange,
  onFaultNotes,
}: {
  row: CableRow;
  onStatusChange: (id: string, status: CableStatus) => void;
  onFaultNotes: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const SWIPE_THRESHOLD = 80;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return;
    setSwiping(true);
    const clamped = Math.max(-120, Math.min(120, dx));
    setSwipeX(clamped);
  };

  const handleTouchEnd = () => {
    if (swipeX > SWIPE_THRESHOLD) {
      onStatusChange(row.id, "Installed");
    } else if (swipeX < -SWIPE_THRESHOLD) {
      // Mark as Fault then immediately prompt for notes
      onStatusChange(row.id, "Fault");
      onFaultNotes(row.id);
    }
    setSwipeX(0);
    setSwiping(false);
  };

  // Swipe hint colours
  const swipeRight = swipeX > 20;
  const swipeLeft  = swipeX < -20;

  return (
    <div className="relative overflow-hidden rounded-lg shadow-sm" ref={cardRef}>
      {/* Background action hints */}
      <div className="absolute inset-0 flex">
        {/* Right swipe = Installed (blue) */}
        <div className={`flex-1 flex items-center px-5 transition-opacity duration-150 rounded-l-lg ${
          swipeRight ? "bg-blue-500 opacity-100" : "bg-blue-400 opacity-0"
        }`}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 10l4.5 4.5L16 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-white text-xs font-bold ml-2">Installed</span>
        </div>
        {/* Left swipe = Fault (red) */}
        <div className={`flex-1 flex items-center justify-end px-5 transition-opacity duration-150 rounded-r-lg ${
          swipeLeft ? "bg-red-500 opacity-100" : "bg-red-400 opacity-0"
        }`}>
          <span className="text-white text-xs font-bold mr-2">Fault</span>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M6 6l8 8M14 6l-8 8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* Card content — slides with swipe */}
      <div
        className="bg-white border border-border rounded-lg relative z-10"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Card header — always visible */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          onClick={() => { if (!swiping) setExpanded(e => !e); }}
        >
          {/* Cable number badge */}
          <span className="shrink-0 bg-slate-800 text-white text-xs font-mono font-bold px-2 py-1 rounded">
            {row.cableNumber}
          </span>

          {/* Source → Destination */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-800 break-words">
              {row.source || <span className="text-slate-400 italic">No source</span>}
            </div>
            <div className="text-xs text-slate-500 flex items-start gap-1 break-words leading-snug mt-0.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 mt-[3px]">
                <path d="M2 5h6M6 3l2 2-2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {row.destination || <span className="italic">No destination</span>}
            </div>
          </div>

          {/* Status badge */}
          <div className="shrink-0 flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOURS[row.status]}`}>
              {row.status}
            </span>
            <svg
              width="14" height="14" viewBox="0 0 14 14" fill="none"
              className={`text-slate-400 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-border bg-slate-50 px-4 py-3 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {row.cableType && (<><span className="text-slate-500 font-medium">Cable Type</span><span className="text-slate-800">{row.cableType}</span></>)}
              {row.signalType && (<><span className="text-slate-500 font-medium">Signal Type</span><span className="text-slate-800">{row.signalType}</span></>)}
              {row.length && (<><span className="text-slate-500 font-medium">Length</span><span className="text-slate-800">{row.length}</span></>)}
              {row.patchLocation && (<><span className="text-slate-500 font-medium">Patch/Rack</span><span className="text-slate-800">{row.patchLocation}</span></>)}
              {hasPatchLead(row) && (<><span className="text-slate-500 font-medium">47U → 12U lead</span><span className="inline-flex items-center gap-1.5 text-slate-800"><span className="h-2.5 w-2.5 rounded-full border border-slate-400" style={{ background: patchColour(row.patchLeadColour)?.hex ?? "transparent" }} />{patchLeadSummary(row)}</span></>)}
              {(row.destPatchCable || row.destPatchLength) && (<><span className="text-slate-500 font-medium">{leadKindOf(row) === "speaker" ? "Speaker cable at dest." : leadKindOf(row) === "dmx" ? "DMX lead at dest." : "Patch cable at dest."}</span><span className="text-slate-800">{[row.destPatchCable, row.destPatchLength].filter(Boolean).join(" · ")}</span></>)}
              {(row.destHdmi || row.destHdmiLength) && (<><span className="text-slate-500 font-medium">HDMI</span><span className="text-slate-800">{[row.destHdmi, row.destHdmiLength].filter(Boolean).join(" · ")}</span></>)}
              {(row.destUsb || row.destUsbLength) && (<><span className="text-slate-500 font-medium">USB</span><span className="text-slate-800">{[row.destUsb, row.destUsbLength].filter(Boolean).join(" · ")}</span></>)}
              {row.notes && (<><span className="text-slate-500 font-medium">Notes</span><span className="text-slate-800">{row.notes}</span></>)}
            </div>
            <div className="pt-1">
              <p className="text-xs text-slate-500 font-medium mb-1.5">Update status:</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((s) => (
                  <button key={s} onClick={() => onStatusChange(row.id, s)}
                    className={`text-xs px-3 py-1 rounded-full border font-semibold transition-all ${
                      row.status === s
                        ? STATUS_COLOURS[s] + " ring-2 ring-offset-1 ring-current"
                        : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CableTable({ cables, site, onChange }: Props) {
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | CableStatus>("all");
  const [patchFilter, setPatchFilter]   = useState<string>("all");
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus]     = useState<CableStatus | "">("");
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [faultNotesId, setFaultNotesId] = useState<string | null>(null);
  const [faultNotesDraft, setFaultNotesDraft] = useState("");

  const handlePrint = () => { window.print(); };

  // ── Derive unique patch panel numbers ────────────────────────────────────
  const patchPanels = useMemo(() => {
    const panels = new Set<string>();
    cables.forEach((c) => {
      const m = c.source.match(/[Pp]atch\s+[Pp]anel\s+(\d+)/i);
      if (m) panels.add(m[1]);
    });
    return Array.from(panels).sort((a, b) => Number(a) - Number(b));
  }, [cables]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return cables.filter((c) => {
      const matchesSearch =
        !q ||
        c.cableNumber.toLowerCase().includes(q) ||
        c.cableType.toLowerCase().includes(q) ||
        c.signalType.toLowerCase().includes(q) ||
        c.source.toLowerCase().includes(q) ||
        c.destination.toLowerCase().includes(q) ||
        c.patchLocation.toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesPatch  =
        patchFilter === "all" ||
        new RegExp(`[Pp]atch\\s+[Pp]anel\\s+${patchFilter}\\b`, 'i').test(c.source);
      return matchesSearch && matchesStatus && matchesPatch;
    });
  }, [cables, search, statusFilter, patchFilter]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((c) => next.delete(c.id)); return next; });
    } else {
      setSelected((prev) => { const next = new Set(prev); filtered.forEach((c) => next.add(c.id)); return next; });
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const handleBulkStatusApply = () => {
    if (!bulkStatus) { toast.error("Choose a status first"); return; }
    if (selected.size === 0) { toast.error("Select at least one cable"); return; }
    onChange(cables.map((c) => selected.has(c.id) ? { ...c, status: bulkStatus as CableStatus } : c));
    toast.success(`${selected.size} cable${selected.size !== 1 ? "s" : ""} set to ${bulkStatus}`);
    setSelected(new Set());
    setBulkStatus("");
  };

  // ── Mobile status change ──────────────────────────────────────────────────
  const handleMobileStatusChange = (id: string, status: CableStatus) => {
    onChange(cables.map((c) => c.id === id ? { ...c, status } : c));
    if (status !== "Fault") toast.success(`Cable updated to ${status}`);
  };

  const handleOpenFaultNotes = (id: string) => {
    const cable = cables.find(c => c.id === id);
    setFaultNotesDraft(cable?.notes || "");
    setFaultNotesId(id);
  };

  const handleSaveFaultNotes = () => {
    if (!faultNotesId) return;
    onChange(cables.map(c => c.id === faultNotesId ? { ...c, notes: faultNotesDraft } : c));
    toast.error("Fault logged");
    setFaultNotesId(null);
    setFaultNotesDraft("");
  };

  // ── Mutation helpers ──────────────────────────────────────────────────────
  const handleCellChange = (id: string, field: keyof CableRow, value: string) => {
    onChange(
      cables.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, [field]: value };
        // A new patch lead defaults to the standard 7 m length.
        if (field === "patchLeadColour" && value && !c.patchLeadLength) next.patchLeadLength = DEFAULT_PATCH_LEAD_LENGTH;
        return next;
      })
    );
  };

  const handleDelete = (id: string) => {
    onChange(cables.filter((c) => c.id !== id));
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    toast.success("Row deleted");
  };

  const handleAddRow = () => {
    onChange([...cables, createEmptyRow(cables.length)]);
  };

  const handleAddMultiple = (count: number) => {
    const newRows = Array.from({ length: count }, (_, i) => createEmptyRow(cables.length + i));
    onChange([...cables, ...newRows]);
    toast.success(`Added ${count} rows`);
  };

  const handleResetToPending = async () => {
    if (await confirmAction(`Reset all ${cables.length} cable statuses to Pending?`)) {
      onChange(cables.map((c) => ({ ...c, status: "Pending" as CableStatus })));
      toast.success("All cables reset to Pending");
    }
  };

  const handleClearAll = async () => {
    if (await confirmAction("Clear all cable data? This cannot be undone.")) {
      onChange(cables.map((c) => ({ ...c, cableType: "", signalType: "", source: "", destination: "", length: "", patchLocation: "", status: "Pending" as CableStatus, notes: "" })));
      toast.success("All cable data cleared");
    }
  };

  const handleExport = () => { exportToExcel(cables, site); toast.success("Exported to Excel"); };

  const handleExportPdf = async () => {
    try {
      toast.info("Generating PDF…");
      await exportCablePdf(cables, site);
      toast.success("PDF downloaded");
    } catch (e) {
      console.error(e);
      toast.error("PDF export failed — please try again");
    }
  };

  // ── Status summary counts ─────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c = { Pending: 0, Installed: 0, Tested: 0, Fault: 0 };
    cables.forEach((r) => { if (r.status in c) c[r.status as CableStatus]++; });
    return c;
  }, [cables]);

  // ── Cable length totals ───────────────────────────────────────────────────
  const lengthTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    cables.forEach((c) => {
      const metres = parseFloat(c.length.trim().replace(/[^0-9.]/g, ""));
      if (!isNaN(metres) && metres > 0) {
        const key = c.cableType || "Unknown";
        totals[key] = (totals[key] || 0) + metres;
        grandTotal += metres;
      }
    });
    return { byType: totals, grand: grandTotal };
  }, [cables]);

  const hasCableLengths = lengthTotals.grand > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── MOBILE TOOLBAR (< md) ─────────────────────────────────────────── */}
      <div className="md:hidden bg-white border-b border-border px-3 py-2 sticky top-0 z-20 shadow-sm">
        {/* Row 1: search + filter toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <Input className="pl-8 h-9 text-sm" placeholder="Search cables…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button
            onClick={() => setMobileToolsOpen(o => !o)}
            className={`shrink-0 h-9 w-9 flex items-center justify-center rounded-md border transition-colors ${mobileToolsOpen ? "bg-slate-800 text-white border-slate-800" : "border-border text-slate-600"}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Row 2: status pills */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-0.5">
          <button
            onClick={() => setStatusFilter("all")}
            className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold transition-colors ${statusFilter === "all" ? "bg-slate-800 text-white border-slate-800" : "bg-white text-slate-500 border-slate-200"}`}
          >
            All ({cables.length})
          </button>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold transition-opacity status-${s.toLowerCase()} ${statusFilter !== "all" && statusFilter !== s ? "opacity-40" : ""}`}
            >
              {counts[s]} {s}
            </button>
          ))}
        </div>

        {/* Expanded tools panel */}
        {mobileToolsOpen && (
          <div className="mt-2 pt-2 border-t border-border space-y-2">
            {/* Panel filter */}
            {patchPanels.length > 0 && (
              <Select value={patchFilter} onValueChange={setPatchFilter}>
                <SelectTrigger className="h-9 text-sm w-full">
                  <SelectValue placeholder="All panels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All panels</SelectItem>
                  {patchPanels.map((p) => (
                    <SelectItem key={p} value={p}>Panel {p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={handleExport} className="h-9 text-xs bg-primary">Export Excel</Button>
              <Button size="sm" onClick={handleExportPdf} className="h-9 text-xs bg-red-700 text-white">Export PDF</Button>
              <Button size="sm" variant="outline" onClick={handleAddRow} className="h-9 text-xs">+ Add Row</Button>
              <Button size="sm" variant="outline" onClick={handleResetToPending} className="h-9 text-xs text-amber-700 border-amber-300">Reset Pending</Button>
            </div>
          </div>
        )}
      </div>

      {/* ── DESKTOP TOOLBAR (≥ md) ────────────────────────────────────────── */}
      <div className="hidden md:flex bg-white border-b border-border px-4 py-2 flex-wrap items-center gap-2 sticky top-0 z-20 shadow-sm">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <Input className="pl-8 h-8 text-sm" placeholder="Search cables…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {patchPanels.length > 0 && (
          <Select value={patchFilter} onValueChange={setPatchFilter}>
            <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All panels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All panels</SelectItem>
              {patchPanels.map((p) => <SelectItem key={p} value={p}>Panel {p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | CableStatus)}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5 ml-1">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-opacity ${statusFilter !== "all" && statusFilter !== s ? "opacity-40" : ""} status-${s.toLowerCase()}`}>
              {counts[s]} {s}
            </button>
          ))}
        </div>

        <div className="flex-1" />
        <span className="text-xs text-muted-foreground hidden md:block">{filtered.length} / {cables.length} cables</span>

        <Button size="sm" variant="outline" onClick={handleAddRow} className="h-8 text-xs gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Add Row
        </Button>

        <Select onValueChange={(v) => handleAddMultiple(Number(v))}>
          <SelectTrigger className="h-8 text-xs w-28"><SelectValue placeholder="Add rows…" /></SelectTrigger>
          <SelectContent>
            {[5, 10, 25, 50].map((n) => <SelectItem key={n} value={String(n)}>Add {n} rows</SelectItem>)}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={handleResetToPending} className="h-8 text-xs text-amber-700 hover:text-amber-800 border-amber-300 hover:border-amber-400">Reset to Pending</Button>
        <Button size="sm" variant="outline" onClick={handleClearAll} className="h-8 text-xs text-destructive hover:text-destructive">Clear Data</Button>

        <Button size="sm" onClick={handleExport} className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 9v2h9V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Export Excel
        </Button>
        <Button size="sm" onClick={handleExportPdf} className="h-8 text-xs gap-1.5 bg-red-700 hover:bg-red-800 text-white">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M4 4h5M4 6.5h5M4 9h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          Export PDF
        </Button>
        <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs gap-1.5 print:hidden">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="3" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/><path d="M4 3V1.5h5V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="4" y="7" width="5" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.3"/></svg>
          Print View
        </Button>
      </div>

      {/* ── Bulk status bar ───────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-blue-800">{selected.size} cable{selected.size !== 1 ? "s" : ""} selected</span>
          <span className="text-blue-600">Set status to:</span>
          <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as CableStatus)}>
            <SelectTrigger className="h-7 text-xs w-32 border-blue-300"><SelectValue placeholder="Choose…" /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleBulkStatusApply} className="h-7 text-xs bg-blue-700 hover:bg-blue-800 text-white">Apply</Button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-blue-600 hover:text-blue-800 underline ml-2">Clear selection</button>
        </div>
      )}

      {/* ── Colour legend (desktop only) ──────────────────────────────────── */}
      <div className="hidden md:flex bg-slate-50 border-b border-border px-4 py-1.5 flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Row colours:</span>
        {LEGEND_ITEMS.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block w-3 h-3 rounded-sm border border-slate-300 flex-shrink-0" style={{ background: item.colour }} />
            {item.label}
          </span>
        ))}
      </div>

      {/* ── MOBILE CARD LIST (< md) ───────────────────────────────────────── */}
      <div className="md:hidden flex-1 overflow-y-auto px-3 py-3 bg-slate-50" style={{ paddingBottom: '80px' }}>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No cables match your search or filter.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-medium pb-1">
              {filtered.length} cable{filtered.length !== 1 ? "s" : ""}
              <span className="text-slate-400"> — swipe → Installed · swipe ← Fault · tap for details</span>
            </p>
            {filtered.map((row) => (
              <MobileCableCard
                key={row.id}
                row={row}
                onStatusChange={handleMobileStatusChange}
                onFaultNotes={handleOpenFaultNotes}
              />
            ))}
          </div>
        )}

        {/* Floating bulk-install button — shown when a panel is filtered */}
        {patchFilter !== "all" && filtered.length > 0 && (() => {
          const pendingCount = filtered.filter(c => c.status === 'Pending' || c.status === 'Fault').length;
          return (
            <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
              <button
                className="pointer-events-auto flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm px-5 py-3 rounded-full shadow-2xl transition-colors"
                onClick={() => {
                  if (pendingCount === 0) { toast.info('All visible cables already installed or tested'); return; }
                  const ids = new Set(filtered.filter(c => c.status === 'Pending' || c.status === 'Fault').map(c => c.id));
                  onChange(cables.map(c => ids.has(c.id) ? { ...c, status: 'Installed' as CableStatus } : c));
                  toast.success(`${pendingCount} cable${pendingCount !== 1 ? 's' : ''} marked as Installed`);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mark Panel {patchFilter} Installed ({pendingCount})
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── FAULT NOTES BOTTOM SHEET (mobile) ──────────────────────────── */}
      {faultNotesId && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden" onClick={() => setFaultNotesId(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-t-2xl shadow-2xl px-5 pt-5 pb-8" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <div className="flex items-center gap-2 mb-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="#ef4444" strokeWidth="1.4"/>
                <path d="M8 5v3.5" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round"/>
                <circle cx="8" cy="11" r="0.8" fill="#ef4444"/>
              </svg>
              <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                FAULT — Cable {cables.find(c => c.id === faultNotesId)?.cableNumber}
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-2">Describe the fault so it can be tracked and resolved:</p>
            <textarea
              autoFocus
              rows={3}
              className="w-full text-sm border border-red-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              placeholder="e.g. Cable damaged at panel port 3, needs re-termination…"
              value={faultNotesDraft}
              onChange={e => setFaultNotesDraft(e.target.value)}
            />
            <div className="flex gap-2 mt-3">
              <button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-sm py-2.5 rounded-lg transition-colors"
                onClick={handleSaveFaultNotes}
              >
                Log Fault
              </button>
              <button
                className="px-4 py-2.5 border border-border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => setFaultNotesId(null)}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP TABLE (≥ md) ─────────────────────────────────────────── */}
      <div className="hidden md:block flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: "1140px" }}>
          <thead className="sticky top-0 z-30">
            <tr className="bg-slate-800 text-white">
              <th className="px-2 py-2.5 w-8 sticky left-0 z-20 bg-slate-800">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="accent-cyan-400 cursor-pointer" title="Select all visible" />
              </th>
              {COLUMNS.slice(1).map((col, i) => (
                <th key={i}
                  className={`px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wider border-r border-slate-600/50 ${col.width} ${i === 0 ? "sticky left-8 z-20 bg-slate-800" : ""}`}
                  style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", letterSpacing: "0.05em" }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={COLUMNS.length} className="text-center py-16 text-muted-foreground text-sm">No cables match your search or filter.</td></tr>
            ) : (
              filtered.map((row, idx) => (
                <CableTableRow
                  key={row.id}
                  row={row}
                  index={idx}
                  selected={selected.has(row.id)}
                  onSelect={toggleSelect}
                  onChange={handleCellChange}
                  onDelete={handleDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="bg-slate-50 border-t border-border px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {cables.length} cables total &nbsp;·&nbsp;
          {counts.Tested} tested &nbsp;·&nbsp;
          {counts.Installed} installed &nbsp;·&nbsp;
          {counts.Fault} fault{counts.Fault !== 1 ? "s" : ""}
        </span>
        {hasCableLengths && (
          <span className="hidden md:flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">Cable lengths:</span>
            {Object.entries(lengthTotals.byType).sort((a, b) => b[1] - a[1]).map(([type, total]) => (
              <span key={type}><span className="font-medium text-slate-700">{type}</span> {total % 1 === 0 ? total : total.toFixed(1)}m</span>
            ))}
            <span className="font-semibold text-slate-700">Total: {lengthTotals.grand % 1 === 0 ? lengthTotals.grand : lengthTotals.grand.toFixed(1)}m</span>
          </span>
        )}
        <button onClick={handleAddRow} className="text-primary hover:underline font-medium">+ Add row</button>
      </div>
    </div>
  );
}
