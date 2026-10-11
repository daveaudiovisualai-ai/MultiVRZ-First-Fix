/**
 * Site library: every job (site) with its progress, a form to start a new site,
 * settings for the open site, and backup / restore.
 */
import { useEffect, useRef, useState } from "react";
import { Archive, Building2, CheckCircle2, Download, FolderOpen, ImageUp, Plus, RotateCcw, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/lib/confirmAction";
import { saveFile } from "@/lib/saveFile";
import { reduceImage, sitePlanUrl, storeSitePlan } from "@/lib/floorPlanStore";
import { PORT_DESIGNATIONS } from "@/lib/rackPlanner";
import { getSharedStatus, SHARED_REMOTE_EVENT } from "@/lib/sharedSync";
import {
  backupToSnapshot,
  buildBackup,
  openSite,
  parseBackup,
  readSite,
  statsFor,
  writeSite,
  type SiteBackup,
  type SiteStats,
} from "@/lib/siteData";
import {
  activeSiteId,
  addSite,
  KARRINYUP_ID,
  newSiteId,
  readRegistry,
  updateSite,
  type PortDesignationSetting,
  type SiteRecord,
  type SiteStatus,
} from "@/lib/sites";

const STATUS_LABEL: Record<SiteStatus, string> = { active: "Active", complete: "Complete", archived: "Archived" };
const STATUS_STYLE: Record<SiteStatus, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  complete: "bg-sky-100 text-sky-800 border-sky-200",
  archived: "bg-slate-100 text-slate-600 border-slate-200",
};

const CONNECTOR_PANELS: { id: string; label: string; slots: number; cableType: string; signalType: string }[] = [
  { id: "audio-01", label: "Audio 01 (SpeakON)", slots: 12, cableType: "Speaker cable (type TBC)", signalType: "Speakon" },
  { id: "audio-02", label: "Audio 02 (SpeakON)", slots: 12, cableType: "Speaker cable (type TBC)", signalType: "Speakon" },
  { id: "dmx-01", label: "DMX 01 (5-pin XLR)", slots: 12, cableType: "5 core screened", signalType: "DMX" },
  { id: "dmx-02", label: "DMX 02 (5-pin XLR)", slots: 12, cableType: "5 core screened", signalType: "DMX" },
  { id: "fibre-vortex", label: "Fibre (LC)", slots: 2, cableType: "LC–LC OM4 fibre", signalType: "Fibre" },
];

const SITE_DETAILS_KEY = "multivrz_o2_cable_schedule_site_v2";

function connectorNamesOf(site: SiteRecord): Record<string, PortDesignationSetting[]> {
  if (site.connectorNames) return site.connectorNames;
  return site.id === KARRINYUP_ID ? PORT_DESIGNATIONS : {};
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

function slugFile(name: string) {
  return name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "site";
}

function readFileText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const inputClass =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-50 disabled:text-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

interface DetailsDraft {
  name: string;
  client: string;
  jobNumber: string;
  address: string;
  engineer: string;
  startDate: string;
}

function DetailsFields({ draft, onChange, disabled }: { draft: DetailsDraft; onChange: (next: DetailsDraft) => void; disabled?: boolean }) {
  const set = (key: keyof DetailsDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [key]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Site name"><input className={inputClass} value={draft.name} onChange={set("name")} disabled={disabled} placeholder="e.g. Westfield Carousel" /></Field>
      <Field label="Client"><input className={inputClass} value={draft.client} onChange={set("client")} disabled={disabled} /></Field>
      <Field label="Job number"><input className={inputClass} value={draft.jobNumber} onChange={set("jobNumber")} disabled={disabled} /></Field>
      <Field label="Engineer"><input className={inputClass} value={draft.engineer} onChange={set("engineer")} disabled={disabled} /></Field>
      <Field label="Address"><input className={inputClass} value={draft.address} onChange={set("address")} disabled={disabled} /></Field>
      <Field label="Start date"><input type="date" className={inputClass} value={draft.startDate} onChange={set("startDate")} disabled={disabled} /></Field>
    </div>
  );
}

function SiteCard({ site, stats, open, onOpen }: { site: SiteRecord; stats?: SiteStats; open: boolean; onOpen: () => void }) {
  const planUrl = sitePlanUrl(site);
  return (
    <li className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm ${open ? "border-cyan-500 ring-2 ring-cyan-500/20" : "border-slate-200"}`}>
      <div className="relative h-28 bg-slate-100">
        {planUrl ? (
          <img src={planUrl} alt="" className="h-full w-full object-cover object-center opacity-90" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400"><Building2 className="h-8 w-8" /></div>
        )}
        {open && <span className="absolute left-2 top-2 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Open</span>}
        <span className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[site.status]}`}>{STATUS_LABEL[site.status]}</span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold text-slate-900">{site.name}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{[site.client, site.jobNumber].filter(Boolean).join(" · ") || "No client set"}</p>
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-600">{stats ? `${stats.cables} cables` : "Loading…"}</span>
            <span className="font-bold tabular-nums text-slate-900">{stats ? `${stats.percent}%` : ""}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${stats?.percent ?? 0}%` }} />
          </div>
          {stats && <p className="mt-1 text-[11px] text-slate-500">{stats.complete} fully complete{stats.measuredMetres ? ` · ${stats.measuredMetres} m scheduled` : ""}</p>}
        </div>
        <div className="mt-auto pt-4">
          {open ? (
            <a href="#/" className="inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Go to cable schedule</a>
          ) : (
            <Button onClick={onOpen} className="h-9 w-full bg-slate-900 text-white hover:bg-slate-800"><FolderOpen className="mr-2 h-4 w-4" />Open site</Button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Sites() {
  const [sites, setSites] = useState<SiteRecord[]>(() => readRegistry());
  const [stats, setStats] = useState<Record<string, SiteStats>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<SiteBackup | null>(null);
  const readOnly = getSharedStatus() === "read-only";
  const openId = activeSiteId();
  const openSiteRecord = sites.find((s) => s.id === openId) ?? sites[0];

  const refresh = () => setSites(readRegistry());

  useEffect(() => {
    let cancelled = false;
    sites.forEach((site) => {
      readSite(site.id)
        .then((snapshot) => {
          if (!cancelled) setStats((current) => ({ ...current, [site.id]: statsFor(snapshot) }));
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.map((s) => s.id).join("|")]);

  const visibleSites = sites.filter((s) => showArchived || s.status !== "archived" || s.id === openId);
  const archivedCount = sites.filter((s) => s.status === "archived").length;

  // ---- open-site settings ----
  const [details, setDetails] = useState<DetailsDraft>(() => ({
    name: openSiteRecord.name,
    client: openSiteRecord.client,
    jobNumber: openSiteRecord.jobNumber,
    address: openSiteRecord.address,
    engineer: openSiteRecord.engineer,
    startDate: openSiteRecord.startDate,
  }));
  const [connectorText, setConnectorText] = useState<Record<string, string>>(() => {
    const names = connectorNamesOf(openSiteRecord);
    return Object.fromEntries(CONNECTOR_PANELS.map((p) => [p.id, (names[p.id] ?? []).map((d) => d.destination).join("\n")]));
  });
  const planInput = useRef<HTMLInputElement>(null);
  const restoreInput = useRef<HTMLInputElement>(null);

  const saveDetails = () => {
    if (!details.name.trim()) {
      toast.error("Give the site a name");
      return;
    }
    updateSite(openSiteRecord.id, { ...details, name: details.name.trim() });
    // Keep the cable schedule's title block in step.
    try {
      const current = JSON.parse(localStorage.getItem(SITE_DETAILS_KEY) || "null");
      if (current && typeof current === "object") {
        localStorage.setItem(
          SITE_DETAILS_KEY,
          JSON.stringify({ ...current, siteName: details.name.trim(), client: details.client, jobNumber: details.jobNumber, engineer: details.engineer })
        );
      }
    } catch {
      /* ignore */
    }
    refresh();
    toast.success("Site details saved");
  };

  const setStatus = async (status: SiteStatus) => {
    updateSite(openSiteRecord.id, { status });
    refresh();
    toast.success(`Marked as ${STATUS_LABEL[status].toLowerCase()}`);
  };

  const saveConnectors = () => {
    const connectorNames: Record<string, PortDesignationSetting[]> = {};
    CONNECTOR_PANELS.forEach((panel) => {
      const lines = (connectorText[panel.id] ?? "").split("\n").map((l) => l.trim()).slice(0, panel.slots);
      while (lines.length && !lines[lines.length - 1]) lines.pop();
      if (lines.length) connectorNames[panel.id] = lines.map((destination) => ({ destination, cableType: panel.cableType, signalType: panel.signalType }));
    });
    updateSite(openSiteRecord.id, { connectorNames });
    refresh();
    toast.success("Connector names saved — the Connection Rack uses them now");
  };

  const uploadPlan = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      toast.error("Upload the floor plan as a PNG or JPG (export PDFs as an image first)");
      return;
    }
    setBusy(true);
    try {
      const floorPlan = await storeSitePlan(openSiteRecord.id, await reduceImage(file), file.name);
      updateSite(openSiteRecord.id, { floorPlan });
      // Show the new plan on the drops pages instead of an older uploaded drawing.
      try {
        const key = "multivrz_destination_drops_o2_v1";
        const drops = JSON.parse(localStorage.getItem(key) || "null");
        if (drops && typeof drops === "object") {
          delete drops.drawing;
          drops.hideDefaultDrawing = false;
          localStorage.setItem(key, JSON.stringify(drops));
        }
      } catch {
        /* ignore */
      }
      refresh();
      toast.success("Floor plan saved for this site");
    } catch {
      toast.error("The floor plan could not be saved");
    } finally {
      setBusy(false);
      if (planInput.current) planInput.current.value = "";
    }
  };

  const downloadBackup = async (siteId: string) => {
    setBusy(true);
    try {
      const backup = await buildBackup(siteId);
      const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
      await saveFile(`${slugFile(backup.site.name)}_backup_${fileStamp()}.json`, blob);
    } catch {
      toast.error("The backup could not be made");
    } finally {
      setBusy(false);
    }
  };

  const chooseRestore = async (file?: File) => {
    if (!file) return;
    try {
      setPendingRestore(parseBackup(await readFileText(file)));
    } catch (error) {
      toast.error((error as Error).message || "That file couldn't be read");
    } finally {
      if (restoreInput.current) restoreInput.current.value = "";
    }
  };

  const restoreIntoOpen = async () => {
    if (!pendingRestore) return;
    const ok = await confirmAction(
      `Replace everything in ${openSiteRecord.name} (schedule, rack, drops, power, consumables and progress) with the backup of ${pendingRestore.site.name}? Download a backup of ${openSiteRecord.name} first if you might need it.`,
      "Replace"
    );
    if (!ok) return;
    setBusy(true);
    try {
      await writeSite(openSiteRecord.id, backupToSnapshot(pendingRestore));
      if (pendingRestore.floorPlanImage && openSiteRecord.id !== KARRINYUP_ID) {
        const floorPlan = await storeSitePlan(openSiteRecord.id, pendingRestore.floorPlanImage, pendingRestore.site.floorPlan?.fileName || "Floor plan");
        updateSite(openSiteRecord.id, { floorPlan });
      }
      setPendingRestore(null);
      toast.success("Backup restored");
      window.dispatchEvent(new Event(SHARED_REMOTE_EVENT));
    } catch {
      toast.error("The backup could not be restored");
    } finally {
      setBusy(false);
    }
  };

  const restoreAsNew = async () => {
    if (!pendingRestore) return;
    setBusy(true);
    try {
      const source = pendingRestore.site;
      const existing = readRegistry();
      const id = newSiteId(source.name || "restored-site", existing.map((s) => s.id));
      const nameTaken = existing.some((s) => s.name === source.name);
      const site: SiteRecord = {
        id,
        name: nameTaken ? `${source.name} (restored)` : source.name || "Restored site",
        client: source.client ?? "",
        jobNumber: source.jobNumber ?? "",
        address: source.address ?? "",
        engineer: source.engineer ?? "",
        startDate: source.startDate ?? fileStamp(),
        status: "active",
        createdAt: new Date().toISOString(),
        connectorNames: source.connectorNames ?? (source.id === KARRINYUP_ID ? PORT_DESIGNATIONS : undefined),
      };
      if (pendingRestore.floorPlanImage) {
        site.floorPlan = await storeSitePlan(id, pendingRestore.floorPlanImage, source.floorPlan?.fileName || "Floor plan");
      } else if (source.floorPlan && !source.floorPlan.chunks) {
        site.floorPlan = { ...source.floorPlan };
      }
      addSite(site);
      await writeSite(id, backupToSnapshot(pendingRestore));
      toast.success(`${site.name} added — opening it now`);
      await openSite(id);
    } catch {
      toast.error("The backup could not be restored");
      setBusy(false);
    }
  };

  // ---- new site ----
  const [newDraft, setNewDraft] = useState<DetailsDraft>({ name: "", client: "", jobNumber: "", address: "", engineer: "", startDate: fileStamp() });
  const [copyScheduleFrom, setCopyScheduleFrom] = useState("");
  const [copyConnectorsFrom, setCopyConnectorsFrom] = useState("");
  const [newPlan, setNewPlan] = useState<File | undefined>();

  const createSite = async () => {
    if (!newDraft.name.trim()) {
      toast.error("Give the site a name");
      return;
    }
    setBusy(true);
    try {
      const existing = readRegistry();
      const id = newSiteId(newDraft.name, existing.map((s) => s.id));
      const connectorSource = existing.find((s) => s.id === copyConnectorsFrom);
      const site: SiteRecord = {
        id,
        ...newDraft,
        name: newDraft.name.trim(),
        status: "active",
        createdAt: new Date().toISOString(),
        ...(connectorSource ? { connectorNames: connectorNamesOf(connectorSource) } : {}),
      };
      if (newPlan) site.floorPlan = await storeSitePlan(id, await reduceImage(newPlan), newPlan.name);
      addSite(site);
      const scheduleSource = existing.find((s) => s.id === copyScheduleFrom);
      if (scheduleSource) {
        const snapshot = await readSite(scheduleSource.id);
        const cables = JSON.parse(snapshot.docs.schedule || "[]") as Record<string, unknown>[];
        const fresh = cables.map((c) => ({ ...c, status: "Pending" }));
        await writeSite(id, { docs: { schedule: JSON.stringify(fresh) }, progress: {} }, false);
      }
      toast.success(`${site.name} created — opening it now`);
      await openSite(id);
    } catch {
      toast.error("The site could not be created");
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">Site library</p>
            <h1 className="mt-1 text-2xl font-bold">Sites</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-300">Each site keeps its own cable schedule, rack, drops, power, consumables and progress. Open a site to work on it.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => restoreInput.current?.click()} className="h-9 border-slate-600 bg-slate-900/50 text-slate-100 hover:bg-slate-800 hover:text-white">
              <Upload className="mr-2 h-4 w-4" />Restore backup
            </Button>
            <input ref={restoreInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Choose a backup file" onChange={(e) => chooseRestore(e.target.files?.[0])} />
            <Button disabled={readOnly} onClick={() => setCreating((v) => !v)} className="h-9 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
              <Plus className="mr-2 h-4 w-4" />New site
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {readOnly && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">You have view-only access, so sites can't be added or changed from this account.</p>
        )}

        {pendingRestore && (
          <section className="rounded-xl border border-cyan-300 bg-cyan-50 p-4">
            <h2 className="font-bold text-cyan-950">Restore {pendingRestore.site.name}</h2>
            <p className="mt-1 text-sm text-cyan-900">
              Backup from {new Date(pendingRestore.exportedAt).toLocaleString()} ·{" "}
              {Array.isArray(pendingRestore.data.schedule) ? (pendingRestore.data.schedule as unknown[]).length : 0} cables ·{" "}
              {Object.keys(pendingRestore.progress ?? {}).length} progress records
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busy || readOnly} onClick={restoreAsNew} className="h-9 bg-slate-900 text-white hover:bg-slate-800"><Plus className="mr-2 h-4 w-4" />Restore as a new site</Button>
              <Button disabled={busy || readOnly} variant="outline" onClick={restoreIntoOpen} className="h-9"><RotateCcw className="mr-2 h-4 w-4" />Replace {openSiteRecord.name}</Button>
              <Button variant="ghost" onClick={() => setPendingRestore(null)} className="h-9">Cancel</Button>
            </div>
          </section>
        )}

        {creating && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold text-slate-900">New site</h2>
            <p className="mt-0.5 text-sm text-slate-500">Starts with an empty rack and schedule unless you copy one in.</p>
            <div className="mt-4 space-y-4">
              <DetailsFields draft={newDraft} onChange={setNewDraft} />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Cable schedule">
                  <select className={inputClass} value={copyScheduleFrom} onChange={(e) => setCopyScheduleFrom(e.target.value)}>
                    <option value="">Start empty</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>Copy from {s.name}</option>)}
                  </select>
                </Field>
                <Field label="Audio / DMX / fibre connector names">
                  <select className={inputClass} value={copyConnectorsFrom} onChange={(e) => setCopyConnectorsFrom(e.target.value)}>
                    <option value="">None yet</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>Copy from {s.name}</option>)}
                  </select>
                </Field>
                <Field label="Floor plan (PNG or JPG)">
                  <input type="file" accept="image/*" className="block w-full text-sm text-slate-600 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-semibold file:text-slate-700" onChange={(e) => setNewPlan(e.target.files?.[0])} />
                </Field>
              </div>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={createSite} className="h-9 bg-cyan-600 text-white hover:bg-cyan-500"><CheckCircle2 className="mr-2 h-4 w-4" />Create and open</Button>
                <Button variant="ghost" onClick={() => setCreating(false)} className="h-9">Cancel</Button>
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">{sites.length} {sites.length === 1 ? "site" : "sites"}</h2>
            {archivedCount > 0 && (
              <button onClick={() => setShowArchived((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
                {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
              </button>
            )}
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSites.map((site) => (
              <SiteCard key={site.id} site={site} stats={stats[site.id]} open={site.id === openId} onOpen={() => openSite(site.id)} />
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-700">Open site</p>
            <h2 className="text-lg font-bold text-slate-900">{openSiteRecord.name} settings</h2>
          </div>
          <div className="space-y-6 p-4 sm:p-5">
            <div>
              <h3 className="mb-3 text-sm font-bold text-slate-800">Details</h3>
              <DetailsFields draft={details} onChange={setDetails} disabled={readOnly} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button disabled={readOnly} onClick={saveDetails} className="h-9 bg-slate-900 text-white hover:bg-slate-800"><Save className="mr-2 h-4 w-4" />Save details</Button>
                <span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
                {(["active", "complete", "archived"] as SiteStatus[]).map((status) => (
                  <button
                    key={status}
                    disabled={readOnly || openSiteRecord.status === status}
                    onClick={() => setStatus(status)}
                    className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold ${openSiteRecord.status === status ? STATUS_STYLE[status] : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  >
                    {status === "archived" && <Archive className="h-3 w-3" />}
                    {STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-slate-800">Floor plan</h3>
              <p className="mt-0.5 text-sm text-slate-500">Used by AV Drops, CCTV &amp; WAP and Power. {openSiteRecord.floorPlan ? `Current: ${openSiteRecord.floorPlan.fileName}` : "None uploaded yet."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" disabled={busy || readOnly} onClick={() => planInput.current?.click()} className="h-9"><ImageUp className="mr-2 h-4 w-4" />{openSiteRecord.floorPlan ? "Replace floor plan" : "Upload floor plan"}</Button>
                <input ref={planInput} type="file" accept="image/*" className="sr-only" aria-label="Upload floor plan" onChange={(e) => uploadPlan(e.target.files?.[0])} />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-slate-800">Named connectors</h3>
              <p className="mt-0.5 text-sm text-slate-500">One name per line, connector 1 first. Schedule cables with a matching destination land on that connector in the Connection Rack.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {CONNECTOR_PANELS.map((panel) => (
                  <Field key={panel.id} label={panel.label}>
                    <textarea
                      rows={panel.slots > 2 ? 8 : 2}
                      disabled={readOnly}
                      value={connectorText[panel.id] ?? ""}
                      onChange={(e) => setConnectorText((cur) => ({ ...cur, [panel.id]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-5 text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 disabled:bg-slate-50"
                      placeholder={panel.slots > 2 ? "e.g.\nFront Left\nFront Right" : "e.g.\nEntry doors"}
                    />
                  </Field>
                ))}
              </div>
              <Button disabled={readOnly} onClick={saveConnectors} className="mt-3 h-9 bg-slate-900 text-white hover:bg-slate-800"><Save className="mr-2 h-4 w-4" />Save connector names</Button>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-sm font-bold text-slate-800">Backup</h3>
              <p className="mt-0.5 text-sm text-slate-500">Downloads the schedule, rack positions, drops, power, consumables, progress and floor plan as one file. Use “Restore backup” above to bring it back.</p>
              <Button variant="outline" disabled={busy} onClick={() => downloadBackup(openSiteRecord.id)} className="mt-3 h-9"><Download className="mr-2 h-4 w-4" />Download backup of {openSiteRecord.name}</Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
