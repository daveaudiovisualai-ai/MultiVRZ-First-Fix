import PatchingSchedule from "@/components/PatchingSchedule";
import { leadKindOf, hasPatchLead, patchColour, patchLeadSummary, PATCH_LEAD_ROUTE } from "@/lib/patchLeads";
import { getUrlSearch } from "@/lib/urlParams";
import { useMemo, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { requestFocus, takeFocus } from "@/lib/crossLink";
import { cableCategory } from "@/lib/cableCategory";
import { dropIdForCable, dropPositionForCable, loadDestinationPlannerStore } from "@/lib/destinationPlanner";
import { AlertTriangle, Cable, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Package, Printer, RefreshCw, ShieldCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  loadRackPlanFromSchedule,
  RACK_KIND_META,
  type RackCircuit,
  type RackPanel,
  type RackPlan,
} from "@/lib/rackPlanner";
import { FIBRE_PROVISION } from "@/lib/fibreProvision";

const CATEGORY_ORDER = ["Rack", "Network", "Speaker", "DMX", "Lighting", "Fibre", "Labelling"] as const;
/** SpeakON face: round flange with the keyed centre slot. */
function SpeakonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#0f172a" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="10" cy="10" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.9" y="3.4" width="2.2" height="3.4" rx="0.6" fill="currentColor" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** 5-pin XLR face: shell with latch tab and five pins. */
function Xlr5Icon({ className = "h-4 w-4" }: { className?: string }) {
  const pins = [0, 1, 2, 3, 4].map((i) => {
    const a = (Math.PI / 180) * (200 + i * 35);
    return [10 + 4.6 * Math.cos(a), 10 + 4.6 * Math.sin(a)];
  });
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#0f172a" stroke="currentColor" strokeWidth="1.4" />
      <rect x="8.8" y="16.2" width="2.4" height="2" rx="0.5" fill="currentColor" />
      {pins.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.1" fill="currentColor" />
      ))}
      <circle cx="10" cy="10" r="1.1" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function panelColour(panel: RackPanel) {
  if (panel.kind === "network" || panel.kind === "speaker" || panel.kind === "dmx" || panel.kind === "fibre") {
    return RACK_KIND_META[panel.kind].colour;
  }
  if (panel.kind === "lighting") return "#f59e0b";
  return panel.kind === "entry" ? "#94a3b8" : "#64748b";
}

function panelBadge(panel: RackPanel) {
  if (panel.kind === "network" || panel.kind === "speaker" || panel.kind === "dmx" || panel.kind === "fibre") {
    return RACK_KIND_META[panel.kind].label;
  }
  if (panel.kind === "lighting") return "Lighting provision";
  return panel.kind === "entry" ? "Rack infrastructure" : "Cable dressing";
}

function sourceLabel(plan: RackPlan) {
  if (plan.isProjectSchedule) return "Project schedule draft";
  return "Current Cable Schedule";
}

function RackedPanel({
  panel,
  unit,
  onCircuitSelect,
  selectedCircuit,
}: {
  panel?: RackPanel;
  unit: number;
  onCircuitSelect: (circuit: RackCircuit) => void;
  selectedCircuit?: RackCircuit;
}) {
  const colour = panel ? panelColour(panel) : "#334155";
  const isConnectionPanel = Boolean(panel?.ports?.length);
  const ports = panel?.ports ?? [];

  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-3">
      <div className="flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-xs font-bold text-slate-400">
        U{unit}
      </div>
      <div
        className={`relative min-h-[52px] overflow-hidden rounded-md border px-2 py-2 shadow-inner sm:min-h-[58px] sm:px-3 ${panel ? "bg-slate-800/95" : "bg-slate-900/50 border-dashed border-slate-700"}`}
        style={panel ? { borderColor: `${colour}80` } : undefined}
      >
        {panel ? (
          <>
            <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: colour }} />
            <div className="flex min-w-0 items-center justify-between gap-2 pl-1">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold tracking-[0.14em] text-slate-100 sm:text-xs">{panel.shortLabel}</p>
                <p className="hidden truncate text-[10px] text-slate-400 md:block">{panel.note}</p>
              </div>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-semibold text-slate-300" style={{ borderColor: `${colour}80`, color: colour }}>
                {isConnectionPanel ? `${panel.circuits.length} / ${panel.capacity}` : panel.kind === "entry" ? "1U" : "1U"}
              </span>
            </div>

            {isConnectionPanel && (
              <div
                className={`mt-1.5 grid gap-0.5 pl-1 ${panel.capacity === 24 ? "grid-cols-[repeat(12,minmax(0,1fr))] sm:grid-cols-[repeat(24,minmax(0,1fr))]" : "grid-cols-[repeat(6,minmax(0,1fr))] sm:grid-cols-[repeat(12,minmax(0,1fr))]"}`}
                aria-label={`${panel.label} port map`}
              >
                {ports.map((port, index) => {
                  const circuit = port.circuit;
                  const selected = Boolean(circuit && selectedCircuit && circuit.id === selectedCircuit.id);
                  const connectorClasses = {
                    rj45: circuit
                      ? selected
                        ? "border-white bg-white text-slate-950 ring-2 ring-white/40"
                        : "border-white/10 bg-slate-700 text-slate-200 hover:-translate-y-0.5 hover:border-white/50 hover:bg-slate-600"
                      : "border-slate-700 bg-slate-900/60 text-slate-600",
                    speakon: circuit
                      ? "border-amber-400/80 bg-slate-950 text-amber-300 hover:-translate-y-0.5 hover:border-amber-200"
                      : "border-slate-700 bg-slate-900 text-slate-500",
                    xlr5: circuit
                      ? "border-violet-400/80 bg-slate-950 text-violet-300 hover:-translate-y-0.5 hover:border-violet-200"
                      : "border-slate-700 bg-slate-900 text-slate-500",
                    xlrBlank: "border-slate-700 bg-slate-950 text-slate-600",
                    blank: "border-slate-700 bg-slate-950 text-slate-600",
                    fibre: circuit
                      ? "border-emerald-300/60 bg-slate-950 text-emerald-100 hover:-translate-y-0.5 hover:border-emerald-200"
                      : "border-emerald-900/50 bg-slate-950 text-emerald-800",
                  }[port.connector];
                  const selectedRing = selected && port.connector !== "rj45" ? " ring-2 ring-white/80 border-white" : "";
                  return (
                    <button
                      key={circuit?.id ?? `${panel.id}-port-${index + 1}`}
                      data-circuit-id={circuit?.id}
                      type="button"
                      onClick={() => circuit && onCircuitSelect(circuit)}
                      title={circuit ? `${circuit.portRef ?? port.label}: ${circuit.destination}${circuit.planned ? "" : ` (cable ${circuit.cableNumber})`}` : `${port.label}: ${port.note ?? "spare provision"}`}
                      aria-label={circuit ? `${circuit.portRef ?? port.label}, ${circuit.destination}${circuit.planned ? "" : `, cable ${circuit.cableNumber}`}` : `${port.label}, ${port.note ?? "spare provision"}`}
                      className={`relative flex min-w-0 items-center justify-center overflow-hidden rounded-sm border px-0.5 py-1 text-center text-[8px] font-semibold leading-none transition duration-150 ${connectorClasses}${selectedRing}${circuit ? " cursor-pointer" : " cursor-default"}`}
                      style={circuit && port.connector === "rj45" && !selected ? { boxShadow: patchColour(circuit.patchLeadColour) ? `inset 0 -3px 0 ${patchColour(circuit.patchLeadColour)!.hex}` : `inset 0 -2px 0 ${colour}` } : undefined}
                    >
                      {port.connector === "speakon" ? (
                        <><SpeakonIcon className="h-4 w-4 sm:h-5 sm:w-5" /><span className="sr-only">{port.label}</span></>
                      ) : port.connector === "xlr5" ? (
                        <><Xlr5Icon className="h-4 w-4 sm:h-5 sm:w-5" /><span className="sr-only">{port.label}</span></>
                      ) : port.connector === "xlrBlank" ? (
                        <span className="text-base leading-none text-slate-600">○</span>
                      ) : port.connector === "fibre" ? (
                        <span className="text-[7px] font-bold tracking-tight text-emerald-300 sm:text-[8px]">{port.label || "LC"}</span>
                      ) : (
                        port.label
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full min-h-[35px] items-center justify-center text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
            Available rack unit
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectionStat({ kind, value, detail = "scheduled circuits" }: { kind: "network" | "speaker" | "dmx" | "fibre"; value: number; detail?: string }) {
  const meta = RACK_KIND_META[kind];
  return (
    <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.colour }} />
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{meta.label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-[10px] text-slate-500">{detail}</p>
    </div>
  );
}

function PartsRegister({ plan }: { plan: RackPlan }) {
  const [open, setOpen] = useState(true);
  const activeParts = plan.parts.filter((part) => part.quantity > 0);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between bg-slate-900 px-4 py-3 text-left text-white transition-colors hover:bg-slate-800"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Package className="h-4 w-4 text-cyan-300" />
          <span className="text-sm font-bold uppercase tracking-[0.1em]">Calculated parts register</span>
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] text-slate-300">{activeParts.length} line items</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[690px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5">Part / material</th>
                <th className="px-4 py-2.5">Specification</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5">Unit</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORY_ORDER.flatMap((category) => activeParts.filter((part) => part.category === category)).map((part, index) => (
                <tr key={`${part.category}-${part.item}`} className={`border-b border-slate-100 ${index % 2 ? "bg-slate-50/50" : "bg-white"}`}>
                  <td className="px-4 py-3 align-top text-xs font-bold uppercase tracking-wide text-slate-500">{part.category}</td>
                  <td className="px-4 py-3 align-top font-semibold text-slate-800">{part.item}</td>
                  <td className="max-w-md px-4 py-3 align-top text-xs leading-5 text-slate-500">{part.specification}</td>
                  <td className="px-4 py-3 align-top text-right text-base font-bold text-slate-900">{part.quantity}</td>
                  <td className="px-4 py-3 align-top text-xs text-slate-500">{part.unit}</td>
                  <td className="px-4 py-3 align-top">
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${part.required ? "border-cyan-200 bg-cyan-50 text-cyan-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                      {part.required ? "Required" : "TBC"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function ConnectionRack() {
  const [plan, setPlan] = useState<RackPlan>(() => loadRackPlanFromSchedule());
  const [selectedCircuit, setSelectedCircuitState] = useState<RackCircuit | undefined>();
  const detailRef = useRef<HTMLElement>(null);
  const setSelectedCircuit = (circuit: RackCircuit) => {
    setSelectedCircuitState(circuit);
    // On phones the detail card sits below the rack; bring it into view.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  };
  const [showScheduleNotes, setShowScheduleNotes] = useState(false);
  const [, navigate] = useLocation();
  const dropPositions = useMemo(() => loadDestinationPlannerStore(plan.isProjectSchedule ? "" : "o2").positions, [plan]);

  // Arriving from Destination Drops: select that cable's port and scroll to it.
  useEffect(() => {
    const cableId = takeFocus("cable");
    if (!cableId) return;
    const circuit = plan.panels.flatMap((panel) => panel.ports ?? []).map((port) => port.circuit).find((c) => c?.id === cableId);
    if (!circuit) {
      toast.error("That cable is not on a rack panel");
      return;
    }
    setSelectedCircuitState(circuit);
    requestAnimationFrame(() => {
      const port = document.querySelector(`[data-circuit-id="${CSS.escape(cableId)}"]`);
      port?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showDropOnPlan = (circuit: RackCircuit) => {
    requestFocus({ type: "drop", id: dropIdForCable(circuit) });
    const category = cableCategory(circuit);
    navigate(category === "cctv" || category === "wap" ? "/cctv-wifi" : "/destination-drops");
  };

  const totalTerminations = useMemo(
    () => plan.counts.network + plan.counts.speaker + plan.counts.dmx + plan.counts.fibre,
    [plan]
  );
  const buildUrl = plan.isProjectSchedule ? `/build${getUrlSearch()}` : "/";
  const availableU = Math.max(0, plan.capacityU - plan.usedU);

  const refreshPlan = () => {
    const refreshed = loadRackPlanFromSchedule();
    setPlan(refreshed);
    setSelectedCircuit(undefined);
    toast.success("Connection rack refreshed from the cable schedule");
  };

  return (
    <div className="h-full overflow-y-auto bg-[#edf2f7] print:bg-white">
      <header className="relative overflow-hidden border-b border-slate-700 bg-slate-950 text-white print:bg-slate-950">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 18% -20%, #0891b2 0, transparent 31%), radial-gradient(circle at 85% 5%, #1e3a8a 0, transparent 35%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                <Cable className="h-3.5 w-3.5" /> MultiVRZ · First Fix Planning
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">Site Connection Rack</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">A live {plan.capacityU}U termination-rack plan generated from the current cable schedule.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Button variant="outline" onClick={refreshPlan} className="h-9 border-slate-600 bg-slate-900/50 text-slate-100 hover:bg-slate-800 hover:text-white">
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Refresh schedule
              </Button>
              <Button onClick={() => window.print()} className="h-9 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                <Printer className="mr-2 h-3.5 w-3.5" /> Print rack pack
              </Button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/10 pt-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Schedule source</p>
              <p className="mt-1 text-sm font-semibold text-white">{sourceLabel(plan)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Project / job</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{plan.site.siteName || plan.site.jobNumber || "Unassigned project"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Engineer</p>
              <p className="mt-1 text-sm font-semibold text-white">{plan.site.engineer || "To be assigned"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Revision</p>
              <p className="mt-1 text-sm font-semibold text-white">{plan.site.revision || "Rev A"}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {plan.isProjectSchedule && plan.cables.length === 0 ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold">No project schedule has been started yet.</p>
                <p className="mt-1 text-amber-900">Build or import cable rows first; this connection-rack plan will populate automatically when refreshed.</p>
                <Link href={buildUrl} className="mt-2 inline-block font-semibold text-amber-800 underline underline-offset-2">Return to the cable schedule builder</Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ConnectionStat kind="network" value={plan.counts.network} />
              <ConnectionStat kind="speaker" value={plan.counts.speaker} />
              <ConnectionStat kind="dmx" value={plan.counts.dmx} />
              <ConnectionStat kind="fibre" value={plan.representedAtU3.fibre} detail={`${FIBRE_PROVISION.lengthMetres} m links provisioned`} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-xl shadow-slate-400/25 print:shadow-none">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">Front elevation · {plan.capacityU}U shallow wall rack</p>
                    <h2 className="mt-0.5 text-base font-bold text-white">Calculated termination layout</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 font-semibold text-slate-300">{plan.usedU}U fitted</span>
                    <span className={`rounded-full border px-2.5 py-1 font-semibold ${plan.overflowPanels.length ? "border-red-800 bg-red-950/50 text-red-200" : "border-emerald-900 bg-emerald-950/40 text-emerald-200"}`}>
                      {plan.overflowPanels.length ? `${plan.overflowPanels.length}U overflow` : `${availableU}U spare`}
                    </span>
                  </div>
                </div>

                <div className="bg-[linear-gradient(135deg,#0b1220,#111827_45%,#0b1220)] p-3 sm:p-5">
                  <div className="rounded-xl border border-slate-600 bg-slate-950 p-2 shadow-[inset_0_0_0_7px_#111827,inset_0_0_0_8px_#334155] sm:p-3">
                    <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
                      <span>19 in. rack rail</span>
                      <span>Front elevation</span>
                    </div>
                    <div className="space-y-1.5">
                      {Array.from({ length: plan.capacityU }, (_, index) => (
                        <RackedPanel
                          key={plan.capacityU - index}
                          unit={plan.capacityU - index}
                          panel={plan.panels.find((panel) => panel.unit === plan.capacityU - index)}
                          onCircuitSelect={setSelectedCircuit}
                          selectedCircuit={selectedCircuit}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 border-t border-slate-800 bg-slate-900 px-4 py-3 sm:grid-cols-4">
                  {(["network", "speaker", "dmx", "fibre"] as const).map((kind) => (
                    <div key={kind} className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RACK_KIND_META[kind].colour }} />
                      <span>{RACK_KIND_META[kind].label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="space-y-4">
                <section ref={detailRef} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Selected port</p>
                      <h2 className="mt-1 text-base font-bold text-slate-900">{selectedCircuit ? (selectedCircuit.planned ? selectedCircuit.portRef : `Cable ${selectedCircuit.cableNumber}`) : "Select a populated port"}</h2>
                      {selectedCircuit && !selectedCircuit.planned && selectedCircuit.portRef && <p className="mt-0.5 text-xs font-medium text-slate-500">{selectedCircuit.portRef}</p>}
                      {selectedCircuit?.planned && <span className="mt-1.5 inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Not yet in cable schedule</span>}
                    </div>
                    <span className={`rounded-full p-2 ${selectedCircuit ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-400"}`}>
                      <Cable className="h-4 w-4" />
                    </span>
                  </div>
                  {selectedCircuit ? (
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Destination</p>
                        <p className="mt-1 font-semibold text-slate-800">{selectedCircuit.destination || "Not recorded"}</p>
                      </div>
                      <dl className="grid grid-cols-2 gap-3 text-xs">
                        <div><dt className="font-bold uppercase tracking-wide text-slate-400">Cable type</dt><dd className="mt-1 font-medium text-slate-700">{selectedCircuit.cableType || "—"}</dd></div>
                        <div><dt className="font-bold uppercase tracking-wide text-slate-400">Signal</dt><dd className="mt-1 font-medium text-slate-700">{selectedCircuit.signalType || "—"}</dd></div>
                        <div><dt className="font-bold uppercase tracking-wide text-slate-400">Source</dt><dd className="mt-1 font-medium text-slate-700">{selectedCircuit.source || "—"}</dd></div>
                        <div><dt className="font-bold uppercase tracking-wide text-slate-400">Length</dt><dd className="mt-1 font-medium text-slate-700">{selectedCircuit.length || "—"}</dd></div>
                      </dl>
                      {hasPatchLead(selectedCircuit) && (
                        <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                          <span className="h-8 w-2.5 shrink-0 rounded-full border border-slate-400" style={{ background: patchColour(selectedCircuit.patchLeadColour)?.hex ?? "#e2e8f0" }} />
                          <div className="text-xs">
                            <p className="font-bold uppercase tracking-wide text-slate-400">47U → 12U lead</p>
                            <p className="mt-0.5 font-semibold text-slate-800">{patchLeadSummary(selectedCircuit)}</p>
                            <p className="mt-0.5 text-slate-500">{selectedCircuit.source ? `${selectedCircuit.source} (47U rack) → this port` : PATCH_LEAD_ROUTE}, bundled in cable sock</p>
                          </div>
                        </div>
                      )}
                      {(selectedCircuit.destPatchCable || selectedCircuit.destHdmi || selectedCircuit.destUsb) && (
                        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                          <div><dt className="font-bold uppercase tracking-wide text-slate-400">{leadKindOf(selectedCircuit) === "speaker" ? "Speaker at dest." : leadKindOf(selectedCircuit) === "dmx" ? "DMX at dest." : "Patch at dest."}</dt><dd className="mt-1 font-mono text-slate-700">{[selectedCircuit.destPatchCable, selectedCircuit.destPatchLength].filter(Boolean).join(" · ") || "—"}</dd></div>
                          <div><dt className="font-bold uppercase tracking-wide text-slate-400">HDMI</dt><dd className="mt-1 font-mono text-slate-700">{[selectedCircuit.destHdmi, selectedCircuit.destHdmiLength].filter(Boolean).join(" · ") || "—"}</dd></div>
                          <div><dt className="font-bold uppercase tracking-wide text-slate-400">USB</dt><dd className="mt-1 font-mono text-slate-700">{[selectedCircuit.destUsb, selectedCircuit.destUsbLength].filter(Boolean).join(" · ") || "—"}</dd></div>
                        </dl>
                      )}
                      {selectedCircuit.notes && <p className="border-l-2 border-cyan-500 pl-3 text-xs leading-5 text-slate-600">{selectedCircuit.notes}</p>}
                      {!selectedCircuit.planned && selectedCircuit.destination && (
                        <button type="button" onClick={() => showDropOnPlan(selectedCircuit)} className="inline-flex items-center gap-1.5 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100">
                          <MapPin className="h-3.5 w-3.5" />
                          {dropPositionForCable(dropPositions, selectedCircuit) ? "Show drop on plan" : "Place drop on plan"} ›
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-slate-500">Tap a populated port in the rack to view its scheduled cable reference and route.</p>
                  )}
                </section>

                <section className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                  <div className="flex gap-2">
                    <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-700" />
                    <div>
                      <h2 className="font-bold text-cyan-950">First-fix readiness</h2>
                      <p className="mt-1 text-xs leading-5 text-cyan-900">{totalTerminations} scheduled cable routes have been classified for rack termination. Parts quantities use the circuit count, rather than a generic allowance.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-2">
                    <SpeakonIcon className="h-8 w-8 shrink-0 text-amber-600" />
                    <div>
                      <h2 className="font-bold text-amber-950">Audio, DMX and Fibre / Vortex panels</h2>
                      <p className="mt-1 text-xs leading-5 text-amber-900"><strong>Audio 01–02</strong> (U8–U7): 2 × 1U panels with <strong>12 × SpeakON</strong> each. <strong>DMX 01–02</strong> (U6–U5): 2 × 1U panels with <strong>12 × 5-pin XLR</strong> each. <strong>Fibre / Vortex</strong> (U4): <strong>2 × LC duplex fibre feedthroughs</strong>. U3 is labelled <strong>Lighting</strong> with 12 blank XLR positions. U2–U1 are free.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex gap-2">
                    <CircleHelp className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <h2 className="font-bold text-emerald-950">Specified Samsung AAE fibre provision</h2>
                      <p className="mt-1 text-xs leading-5 text-emerald-900"><strong>{FIBRE_PROVISION.quantity} × {FIBRE_PROVISION.lengthMetres} m</strong> pre-terminated <strong>LC–LC OM4 bend-insensitive multimode</strong> links are provisioned at the rear of the U4 Fibre / Vortex panel. This selection is valid for the AAE Snow Box at up to 100 m.</p>
                      <p className="mt-2 text-xs leading-5 text-amber-900"><strong>Controller check:</strong> if the final controller is CS4B rather than AAE, reconfirm the optics and cable: CS4B requires LC / OS2 for LR4 or Type B female MPO multimode for SR4.</p>
                      <a href={FIBRE_PROVISION.sourceDocumentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-emerald-800 underline underline-offset-2">View Samsung fibre crib sheet</a>
                    </div>
                  </div>
                </section>
              </aside>
            </section>

            {plan.overflowPanels.length > 0 && (
              <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                  <div>
                    <p className="font-bold">Rack capacity review required</p>
                    <p className="mt-1">This schedule needs {plan.usedU}U of physical equipment. The following allocation sits outside the {plan.capacityU}U wall rack: {plan.overflowPanels.map((panel) => panel.label).join(", ")}.</p>
                  </div>
                </div>
              </section>
            )}

            <PatchingSchedule
              plan={plan}
              siteName={plan.site.siteName || "Site"}
              onSelect={(circuit) => {
                setSelectedCircuit(circuit);
                detailRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />

            <PartsRegister plan={plan} />

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setShowScheduleNotes((value) => !value)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-slate-50"
                aria-expanded={showScheduleNotes}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-800"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Planning basis & assumptions</span>
                {showScheduleNotes ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              </button>
              {showScheduleNotes && (
                <div className="grid gap-4 border-t border-slate-100 px-4 py-4 text-sm leading-6 text-slate-600 md:grid-cols-3">
                  <p><strong className="text-slate-800">Network:</strong> Cat5e/Cat6/Cat6A, RJ45, Dante and network-labelled routes populate 24-way unloaded keystone panels. One shielded Cat6A keystone is calculated per route.</p>
                  <p><strong className="text-slate-800">Rack:</strong> {plan.capacityU}U. Five 24-way keystone panels (U15–U11; panel 05 for CCTV, WAPs, touch panels and Auri units), cable management (U10), cable entry (U9), two 12-way SpeakON Audio panels (U8–U7), two 12-way 5-pin XLR DMX panels (U6–U5), a Fibre / Vortex panel with two LC duplex feedthroughs (U4) and a Lighting panel with 12 blank XLR positions (U3). U2–U1 are free. Speaker and DMX routes in the schedule fill these panels in order.</p>
                  <p><strong className="text-slate-800">Fibre:</strong> the specified provision is two pre-terminated {FIBRE_PROVISION.lengthMetres} m LC–LC OM4 bend-insensitive multimode links for an AAE Snow Box, terminating at the rear of the U4 Fibre / Vortex panel. Reconfirm the selection if CS4B hardware is chosen, as its LR4 and SR4 links use different LC/OS2 or MPO Type B requirements.</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
