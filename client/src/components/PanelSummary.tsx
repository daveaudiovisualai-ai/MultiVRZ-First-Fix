import { confirmAction } from "@/lib/confirmAction";
/*
 * PanelSummary — collapsible panel-by-panel breakdown with engineer sign-off
 * Design: Clean Professional Dashboard — Multivrz branding
 * Shows port usage, status breakdown, spare capacity, and sign-off per 24-port panel
 */
import { useState, useMemo } from "react";
import type { CableRow, CableStatus } from "@/lib/cableTypes";

const MAX_PORTS = 24;
const SIGNOFF_KEY = "av_panel_signoffs_v2";

interface SignOff {
  engineer: string;
  timestamp: string; // ISO string
}

function loadSignOffs(): Record<number, SignOff> {
  try {
    const raw = localStorage.getItem(SIGNOFF_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveSignOffs(data: Record<number, SignOff>) {
  try { localStorage.setItem(SIGNOFF_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

interface Props {
  cables: CableRow[];
}

const STATUS_COLOURS: Record<CableStatus, string> = {
  Pending:   "bg-slate-400",
  Installed: "bg-blue-500",
  Tested:    "bg-green-500",
  Fault:     "bg-red-500",
};

const STATUS_TEXT: Record<CableStatus, string> = {
  Pending:   "text-slate-600",
  Installed: "text-blue-700",
  Tested:    "text-green-700",
  Fault:     "text-red-700",
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function PanelSummary({ cables }: Props) {
  const [open, setOpen] = useState(typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [expandedPanels, setExpandedPanels] = useState<Set<number>>(new Set());
  const [signOffs, setSignOffs] = useState<Record<number, SignOff>>(loadSignOffs);
  const [signOffPanel, setSignOffPanel] = useState<number | null>(null);
  const [engineerName, setEngineerName] = useState("");

  // Build panel data from cables
  const panels = useMemo(() => {
    const map = new Map<number, CableRow[]>();
    for (const c of cables) {
      const pm = c.source.match(/[Pp]atch\s+[Pp]anel\s+(\d+)\s+[Pp]ort/);
      if (pm) {
        const pn = parseInt(pm[1]);
        if (!map.has(pn)) map.set(pn, []);
        map.get(pn)!.push(c);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([num, rows]) => {
        const statusCounts: Record<CableStatus, number> = { Pending: 0, Installed: 0, Tested: 0, Fault: 0 };
        for (const r of rows) statusCounts[r.status]++;
        const done = statusCounts.Installed + statusCounts.Tested;
        const pct  = rows.length > 0 ? Math.round((done / rows.length) * 100) : 0;
        const spare = MAX_PORTS - rows.length;
        return { num, rows, statusCounts, done, pct, spare };
      });
  }, [cables]);

  const totalPanels = panels.length;
  const totalPorts  = panels.reduce((s, p) => s + p.rows.length, 0);
  const totalSpare  = panels.reduce((s, p) => s + p.spare, 0);
  const totalDone   = panels.reduce((s, p) => s + p.done, 0);
  const overallPct  = totalPorts > 0 ? Math.round((totalDone / totalPorts) * 100) : 0;

  const togglePanel = (num: number) => {
    setExpandedPanels(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  };

  const handleSignOff = (panelNum: number) => {
    setSignOffPanel(panelNum);
    setEngineerName("");
  };

  const confirmSignOff = () => {
    if (!signOffPanel) return;
    const signOff: SignOff = {
      engineer: engineerName.trim() || "Engineer",
      timestamp: new Date().toISOString(),
    };
    const next = { ...signOffs, [signOffPanel]: signOff };
    setSignOffs(next);
    saveSignOffs(next);
    setSignOffPanel(null);
    setEngineerName("");
  };

  const removeSignOff = async (panelNum: number) => {
    if (!await confirmAction(`Remove sign-off for Panel ${panelNum}?`)) return;
    const next = { ...signOffs };
    delete next[panelNum];
    setSignOffs(next);
    saveSignOffs(next);
  };

  if (panels.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-white shadow-sm print:hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800 text-white hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <rect x="1" y="2" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M1 5.5h13M5 5.5v7.5" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
          <span
            className="font-semibold text-sm tracking-wide"
            style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", letterSpacing: "0.05em" }}
          >
            PANEL SUMMARY
          </span>
          <span className="text-slate-400 text-xs hidden sm:inline">
            {totalPanels} panels · {totalPorts} ports used · {totalSpare} spare · {overallPct}% installed
          </span>
          <span className="text-slate-400 text-xs sm:hidden">
            {totalPanels} panels · {overallPct}%
          </span>
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Panel grid */}
      {open && (
        <div className="divide-y divide-border">
          {panels.map(({ num, rows, statusCounts, done, pct, spare }) => {
            const isExpanded = expandedPanels.has(num);
            const isFull = spare === 0;
            const signedOff = signOffs[num];
            const allDone = pct === 100;

            return (
              <div key={num}>
                {/* Panel row */}
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
                  {/* Expand button */}
                  <button onClick={() => togglePanel(num)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    {/* Panel number badge */}
                    <div className="shrink-0 w-20 flex items-center gap-1.5">
                      <span
                        className="text-xs font-bold text-slate-700"
                        style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
                      >
                        Panel {num}
                      </span>
                      {isFull && (
                        <span className="text-[10px] bg-slate-200 text-slate-500 px-1 rounded font-medium">FULL</span>
                      )}
                    </div>

                    {/* Port usage bar */}
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden flex">
                        {statusCounts.Installed > 0 && (
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(statusCounts.Installed / MAX_PORTS) * 100}%` }} title={`Installed: ${statusCounts.Installed}`} />
                        )}
                        {statusCounts.Tested > 0 && (
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${(statusCounts.Tested / MAX_PORTS) * 100}%` }} title={`Tested: ${statusCounts.Tested}`} />
                        )}
                        {statusCounts.Pending > 0 && (
                          <div className="h-full bg-slate-300 transition-all" style={{ width: `${(statusCounts.Pending / MAX_PORTS) * 100}%` }} title={`Pending: ${statusCounts.Pending}`} />
                        )}
                        {statusCounts.Fault > 0 && (
                          <div className="h-full bg-red-400 transition-all" style={{ width: `${(statusCounts.Fault / MAX_PORTS) * 100}%` }} title={`Fault: ${statusCounts.Fault}`} />
                        )}
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums shrink-0 w-16 text-right">
                        {rows.length}/{MAX_PORTS} ports
                      </span>
                    </div>

                    {/* Status counts (desktop) */}
                    <div className="hidden md:flex items-center gap-3 shrink-0">
                      {(["Installed","Tested","Pending","Fault"] as CableStatus[]).map(s => (
                        statusCounts[s] > 0 ? (
                          <span key={s} className={`text-xs font-medium ${STATUS_TEXT[s]}`}>
                            {statusCounts[s]} {s}
                          </span>
                        ) : null
                      ))}
                      {spare > 0 && <span className="text-xs text-slate-400">{spare} spare</span>}
                    </div>

                    {/* Completion % */}
                    <div className="shrink-0 w-12 text-right">
                      <span className={`text-xs font-bold tabular-nums ${pct === 100 ? "text-green-600" : pct > 0 ? "text-blue-600" : "text-slate-400"}`}>
                        {pct}%
                      </span>
                    </div>

                    <ChevronIcon open={isExpanded} />
                  </button>

                  {/* Sign-off button / badge */}
                  <div className="shrink-0 ml-1">
                    {signedOff ? (
                      <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 5.5l2.5 2.5L9 3" stroke="#16a34a" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="text-[11px] font-semibold text-green-700 hidden sm:inline">{signedOff.engineer}</span>
                        <button onClick={() => removeSignOff(num)} className="text-green-400 hover:text-red-500 transition-colors ml-0.5" title="Remove sign-off">
                          <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M2 2l5 5M7 2L2 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleSignOff(num)}
                        disabled={!allDone}
                        title={allDone ? "Sign off this panel" : "All cables must be Installed or Tested first"}
                        className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                          allDone
                            ? "border-green-400 text-green-700 hover:bg-green-50 cursor-pointer"
                            : "border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2 2 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="hidden sm:inline">Sign off</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Sign-off timestamp (below panel row when signed) */}
                {signedOff && (
                  <div className="px-4 pb-1.5 text-[11px] text-slate-400 italic">
                    Signed off by <span className="font-medium text-slate-600">{signedOff.engineer}</span> on {formatTs(signedOff.timestamp)}
                  </div>
                )}

                {/* Expanded cable list */}
                {isExpanded && (
                  <div className="bg-slate-50 border-t border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-slate-500 uppercase tracking-wider">
                          <th className="px-4 py-1.5 text-left font-semibold w-20">Cable No.</th>
                          <th className="px-3 py-1.5 text-left font-semibold w-28">Source</th>
                          <th className="px-3 py-1.5 text-left font-semibold">Destination</th>
                          <th className="px-3 py-1.5 text-left font-semibold w-16">Length</th>
                          <th className="px-3 py-1.5 text-left font-semibold w-24">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c, i) => (
                          <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                            <td className="px-4 py-1 font-mono text-slate-700">{c.cableNumber}</td>
                            <td className="px-3 py-1 text-slate-600">{c.source}</td>
                            <td className="px-3 py-1 text-slate-700">{c.destination}</td>
                            <td className="px-3 py-1 text-slate-500">{c.length || "—"}</td>
                            <td className="px-3 py-1">
                              <span className="inline-flex items-center gap-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOURS[c.status]}`} />
                                <span className={STATUS_TEXT[c.status]}>{c.status}</span>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sign-off modal */}
      {signOffPanel !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSignOffPanel(null)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8l3.5 3.5L13 4" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                  SIGN OFF — Panel {signOffPanel}
                </h3>
                <p className="text-xs text-slate-500">All {panels.find(p => p.num === signOffPanel)?.rows.length} cables complete</p>
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Engineer name</label>
            <input
              autoFocus
              className="w-full text-sm border border-border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-400"
              placeholder="Your name"
              value={engineerName}
              onChange={e => setEngineerName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && confirmSignOff()}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-2.5 rounded-lg transition-colors"
                onClick={confirmSignOff}
              >
                Confirm Sign-off
              </button>
              <button
                className="px-4 py-2.5 border border-border rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                onClick={() => setSignOffPanel(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
