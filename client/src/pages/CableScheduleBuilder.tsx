/*
 * CableScheduleBuilder — standalone, project-aware schedule editor
 * Design: Clean Professional Dashboard — MultiVRZ Cable Schedule format
 *
 * Entry route: /build?projectId=...&projectName=...&address=...&jobNumber=...
 * The builder is intentionally self-contained while providing a safe handoff
 * back to the originating DAVE AV Preparation gate when its returnUrl is sent.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import CableTable from "@/components/CableTable";
import PanelSummary from "@/components/PanelSummary";
import SiteDetailsHeader from "@/components/SiteDetailsHeader";
import { createEmptyRow, type CableRow, type CableStatus, type SiteDetails } from "@/lib/cableTypes";
import {
  readCableScheduleProjectContext,
  siteDetailsForProject,
  storageKeyForProject,
  type CompletedCableScheduleHandoff,
} from "@/lib/cableScheduleHandoff";

interface SavedSchedule {
  site: SiteDetails;
  cables: CableRow[];
  updatedAt: string;
  readyAt?: string;
}

function readSavedSchedule(key: string): SavedSchedule | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSchedule;
    if (!Array.isArray(data.cables) || !data.site) return null;
    return data;
  } catch {
    return null;
  }
}

function normaliseStatus(value: unknown): CableStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "installed") return "Installed";
  if (status === "tested") return "Tested";
  if (status === "fault") return "Fault";
  return "Pending";
}

function cell(row: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return String(value).trim();
  }
  return "";
}

function importCableRows(buffer: ArrayBuffer): CableRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The imported file does not contain a worksheet.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const headerIndex = matrix.findIndex((row) =>
    row.some((value) => String(value).trim().toLowerCase() === "cable no.")
  );
  if (headerIndex === -1) {
    throw new Error("No Cable No. column was found. Please import a Cable Schedule Excel or CSV export.");
  }

  const headers = matrix[headerIndex].map((value) => String(value).trim());
  const dataRows = matrix.slice(headerIndex + 1)
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])))
    .filter((row) => cell(row, ["Cable No.", "Cable Number", "Cable No"]) !== "");

  if (!dataRows.length) throw new Error("No cable rows were found below the Cable No. header.");

  return dataRows.map((row, index) => ({
    id: `import-${Date.now()}-${index}`,
    cableNumber: cell(row, ["Cable No.", "Cable Number", "Cable No"]),
    cableType: cell(row, ["Cable Type"]),
    signalType: cell(row, ["Signal Type", "Signal"]),
    source: cell(row, ["Source"]),
    destination: cell(row, ["Destination"]),
    outlet: cell(row, ["Outlet / GOP", "Outlet", "GOP"]) || undefined,
    length: cell(row, ["Length"]),
    patchLocation: cell(row, ["Patch / Rack Location", "Patch / Rack", "Patch Location"]),
    status: normaliseStatus(cell(row, ["Status"])),
    notes: cell(row, ["Notes", "Note"]),
    patchLeadColour: cell(row, ["Patch Lead Colour"]) || undefined,
    patchLeadLength: cell(row, ["Patch Lead Length"]) || undefined,
    destPatchCable: cell(row, ["Patch Cable at Destination"]) || undefined,
    destHdmi: cell(row, ["HDMI"]) || undefined,
    destUsb: cell(row, ["USB"]) || undefined,
    destPatchLength: cell(row, ["Patch Cable Length"]) || undefined,
    destHdmiLength: cell(row, ["HDMI Length"]) || undefined,
    destUsbLength: cell(row, ["USB Length"]) || undefined,
  }));
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</p>
      <p className="text-sm text-slate-700 truncate font-medium">{value || "Not provided"}</p>
    </div>
  );
}

export default function CableScheduleBuilder() {
  const project = useMemo(() => readCableScheduleProjectContext(), []);
  const storageKey = useMemo(() => storageKeyForProject(project), [project]);
  const [savedSchedule, setSavedSchedule] = useState<SavedSchedule | null>(() => readSavedSchedule(storageKey));
  const [view, setView] = useState<"choose" | "builder">("choose");
  const [site, setSite] = useState<SiteDetails>(() => savedSchedule?.site ?? siteDetailsForProject(project));
  const [cables, setCables] = useState<CableRow[]>(() => savedSchedule?.cables ?? []);
  const [readyAt, setReadyAt] = useState<string | undefined>(() => savedSchedule?.readyAt);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasWorkingSchedule = cables.length > 0;
  const completedRows = cables.filter((c) => c.source.trim() && c.destination.trim() && c.cableType.trim() && c.signalType.trim()).length;
  const faults = cables.filter((c) => c.status === "Fault").length;

  // Auto-save only after a schedule has been selected or imported for this job.
  useEffect(() => {
    if (!hasWorkingSchedule) return;
    const payload: SavedSchedule = { site, cables, updatedAt: new Date().toISOString(), readyAt };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
      setSavedSchedule(payload);
    } catch { /* Storage unavailable */ }
  }, [site, cables, storageKey, hasWorkingSchedule, readyAt]);

  const beginBlankSchedule = () => {
    setSite(siteDetailsForProject(project));
    setCables(Array.from({ length: 24 }, (_, index) => createEmptyRow(index)));
    setReadyAt(undefined);
    setView("builder");
  };

  const continueExisting = () => {
    if (!savedSchedule) return;
    setSite(savedSchedule.site);
    setCables(savedSchedule.cables);
    setReadyAt(savedSchedule.readyAt);
    setView("builder");
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = importCableRows(await file.arrayBuffer());
      setSite(siteDetailsForProject(project));
      setCables(rows);
      setReadyAt(undefined);
      setView("builder");
      toast.success(`${rows.length} cable rows imported for ${project.projectName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The schedule could not be imported.");
    } finally {
      event.target.value = "";
    }
  };

  const handleReturnToDave = () => {
    if (!completedRows) {
      toast.error("Add at least one complete cable row before marking the schedule ready.");
      return;
    }
    if (faults) {
      toast.error(`Resolve or acknowledge the ${faults} fault${faults === 1 ? "" : "s"} before contractor issue.`);
      return;
    }

    const completedAt = new Date().toISOString();
    const handoff: CompletedCableScheduleHandoff = {
      type: "DAVE_CABLE_SCHEDULE_READY",
      projectId: project.projectId,
      projectName: project.projectName,
      jobNumber: site.jobNumber,
      address: project.address,
      status: "ready_for_issue",
      cableCount: cables.length,
      completedAt,
    };
    setReadyAt(completedAt);

    // Allows a future embedded DAVE gate to receive the completion event while
    // restricting the message to the explicitly supplied return location.
    let targetOrigin = window.location.origin;
    try {
      if (project.returnUrl) targetOrigin = new URL(project.returnUrl, window.location.origin).origin;
    } catch { /* retain this app's origin as the safe fallback */ }
    window.opener?.postMessage(handoff, targetOrigin);
    if (window.parent !== window) window.parent.postMessage(handoff, targetOrigin);

    if (project.returnUrl) {
      try {
        const returnUrl = new URL(project.returnUrl, window.location.origin);
        returnUrl.searchParams.set("cableScheduleStatus", "ready_for_issue");
        returnUrl.searchParams.set("cableScheduleProjectId", project.projectId);
        returnUrl.searchParams.set("cableScheduleRows", String(cables.length));
        window.location.assign(returnUrl.toString());
        return;
      } catch { /* keep user on the schedule and show completion confirmation */ }
    }
    toast.success("Schedule marked ready for contractor issue. Export Excel or PDF using the toolbar.");
  };

  if (view === "choose") {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-900 rounded-t-xl px-5 py-5 text-white">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-400 font-semibold">AV Preparation · Provide Cable Schedule</p>
            <h1 className="mt-1 text-2xl font-bold" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>Build Cable Schedule</h1>
            <p className="mt-1 text-sm text-slate-300">Start a new schedule or continue an existing project record. The standard MultiVRZ schedule format is used throughout.</p>
          </div>

          <div className="bg-white border border-t-0 border-border rounded-b-xl px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shadow-sm">
            <InfoItem label="Project" value={project.projectName} />
            <InfoItem label="Job number" value={project.jobNumber || project.projectId} />
            <InfoItem label="Address" value={project.address} />
            <InfoItem label="Client" value={project.client} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <button onClick={beginBlankSchedule} className="text-left group bg-white border border-border rounded-xl p-5 shadow-sm hover:border-cyan-500 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-cyan-50 text-cyan-700 flex items-center justify-center mb-4 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M9.5 3v13M3 9.5h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
              </div>
              <h2 className="font-bold text-slate-800">Build new schedule</h2>
              <p className="mt-1 text-sm text-slate-500">Creates a clean 24-row cable schedule with the project details already filled in.</p>
            </button>

            <button onClick={() => fileInputRef.current?.click()} className="text-left group bg-white border border-border rounded-xl p-5 shadow-sm hover:border-blue-500 hover:shadow-md transition-all">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M3 2h8l4 4v11H3V2zM11 2v5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="font-bold text-slate-800">Edit existing schedule</h2>
              <p className="mt-1 text-sm text-slate-500">Import a Cable Schedule Excel or CSV export, then edit it in the same live schedule format.</p>
            </button>

            <button onClick={continueExisting} disabled={!savedSchedule} className={`text-left group border rounded-xl p-5 shadow-sm transition-all ${savedSchedule ? "bg-white border-border hover:border-green-500 hover:shadow-md" : "bg-slate-100 border-slate-200 cursor-not-allowed"}`}>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${savedSchedule ? "bg-green-50 text-green-700 group-hover:bg-green-600 group-hover:text-white" : "bg-slate-200 text-slate-400"} transition-colors`}>
                <svg width="19" height="19" viewBox="0 0 19 19" fill="none"><path d="M4 9.5a5.5 5.5 0 109.8-3.4M15 3v4h-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <h2 className="font-bold text-slate-800">Continue saved schedule</h2>
              <p className="mt-1 text-sm text-slate-500">{savedSchedule ? `${savedSchedule.cables.length} saved cable rows for this project.` : "No saved schedule exists for this project yet."}</p>
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />

          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
            <span className="font-semibold">Contractor issue workflow:</span> build or import the schedule, complete the cable records, then select <span className="font-semibold">Mark ready for contractor issue</span>. The usual Excel and PDF exports remain available within the editor.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Project context is separate from the standardised Cable Schedule header. */}
      <div className="shrink-0 bg-slate-800 px-4 py-2 flex items-center gap-3 text-white border-b border-slate-700">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-400 font-semibold">DAVE AV Preparation · Cable Schedule Builder</p>
          <p className="text-sm font-semibold truncate">{project.projectName} <span className="font-normal text-slate-400">· {project.address || "Address not provided"}</span></p>
        </div>
        <Button size="sm" onClick={handleReturnToDave} className="shrink-0 bg-green-600 hover:bg-green-700 text-white gap-1.5 h-8 text-xs">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l2.5 2.5L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {readyAt ? "Ready for issue" : "Mark ready for contractor issue"}
        </Button>
      </div>

      <div className="shrink-0 sticky top-0 z-30">
        <SiteDetailsHeader site={site} onChange={setSite} cables={cables} />
      </div>

      <div className="shrink-0 bg-slate-100 border-b border-border px-3 md:px-4 py-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Project-specific schedule · auto-saved to this browser</span>
        <button onClick={() => setView("choose")} className="text-xs text-cyan-700 hover:text-cyan-900 font-medium">Change start option</button>
      </div>

      <div className="shrink-0 bg-slate-50 border-b border-border overflow-y-auto" style={{ maxHeight: "30vh" }}>
        <div className="px-3 py-1.5 md:px-4 md:py-2"><PanelSummary cables={cables} /></div>
      </div>

      <div className="flex-1 overflow-hidden"><CableTable cables={cables} site={site} onChange={setCables} /></div>
    </div>
  );
}
