/**
 * Patching schedule: switch port in the 47U rack -> keystone port in the 12U
 * rack, with lead colour and length. Leads are bundled in a cable sock.
 */
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveFile } from "@/lib/saveFile";
import type { RackPlan, RackCircuit } from "@/lib/rackPlanner";
import { PATCH_LEAD_COLOURS, PATCH_LEAD_ROUTE, patchColour, switchPortOf } from "@/lib/patchLeads";

interface Row {
  circuit: RackCircuit;
  switchLabel: string;
  sortKey: number;
  rackPort: string;
}

export default function PatchingSchedule({ plan, siteName, onSelect }: { plan: RackPlan; siteName: string; onSelect: (c: RackCircuit) => void }) {
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    plan.panels.forEach((panel) => {
      (panel.ports ?? []).forEach((port, index) => {
        const c = port.circuit;
        if (!c || c.planned || port.connector !== "rj45") return;
        const sp = switchPortOf(c);
        out.push({
          circuit: c,
          switchLabel: sp ? `Switch ${sp.switchNo} · Port ${sp.port}` : c.source || "—",
          sortKey: sp ? Number(sp.switchNo) * 1000 + Number(sp.port) : 99999,
          rackPort: `${panel.shortLabel} · ${port.label || index + 1}`,
        });
      });
    });
    return out.sort((a, b) => a.sortKey - b.sortKey);
  }, [plan]);

  const assigned = rows.filter((r) => r.circuit.patchLeadColour);
  const visible = onlyAssigned ? assigned : rows;
  const totals = PATCH_LEAD_COLOURS.map((c) => ({ ...c, count: assigned.filter((r) => patchColour(r.circuit.patchLeadColour)?.name === c.name).length })).filter((c) => c.count);

  const download = async () => {
    const header = ["Switch (47U rack)", "12U rack port", "Cable No.", "Destination", "Patch lead colour", "Patch lead length", "Route"];
    const data = visible.map((r) => [r.switchLabel, r.rackPort, r.circuit.cableNumber, r.circuit.destination, r.circuit.patchLeadColour ?? "", r.circuit.patchLeadLength ?? "", r.circuit.patchLeadColour ? PATCH_LEAD_ROUTE : ""]);
    const summary = totals.map((t) => [`${t.name} leads`, t.count]);
    const ws = XLSX.utils.aoa_to_sheet([[`${siteName} – patching schedule (47U switches → 12U rack)`], [], header, ...data, [], ["Totals"], ...summary]);
    ws["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 10 }, { wch: 50 }, { wch: 16 }, { wch: 16 }, { wch: 48 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patching");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    await saveFile(`${siteName.replace(/[^A-Za-z0-9]+/g, "_")}_patching_schedule.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  };

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Patching schedule — 47U switches to 12U rack</h2>
          <p className="mt-0.5 text-xs text-slate-500">Patch leads bundled in cable sock from each network switch to its keystone port. Set the lead colour per cable in the Cable Schedule.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={onlyAssigned} onChange={(e) => setOnlyAssigned(e.target.checked)} className="accent-cyan-600" />
            Leads set only
          </label>
          <Button variant="outline" onClick={download} className="h-8 text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Excel</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs">
        <span className="font-semibold text-slate-600">{assigned.length} of {rows.length} leads set</span>
        {totals.map((t) => (
          <span key={t.name} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-400" style={{ background: t.hex }} />{t.count} × {t.name} {assigned.find((r) => r.circuit.patchLeadColour === t.name)?.circuit.patchLeadLength ?? ""}
          </span>
        ))}
      </div>
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-800 text-[10px] uppercase tracking-wider text-slate-200">
            <tr><th className="px-3 py-2">Switch (47U)</th><th className="px-3 py-2">12U rack port</th><th className="px-3 py-2">Cable</th><th className="px-3 py-2">Destination</th><th className="px-3 py-2">Patch lead</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.map((r) => {
              const colour = patchColour(r.circuit.patchLeadColour);
              return (
                <tr key={r.circuit.id} onClick={() => onSelect(r.circuit)} className="cursor-pointer hover:bg-cyan-50">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-700">{r.switchLabel}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">{r.rackPort}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold text-slate-900">{r.circuit.cableNumber}</td>
                  <td className="px-3 py-1.5 text-slate-700">{r.circuit.destination}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {r.circuit.patchLeadColour ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold" style={{ background: colour?.hex ?? "#e2e8f0", color: colour?.text ?? "#0f172a" }}>
                        {r.circuit.patchLeadColour} · {r.circuit.patchLeadLength || "length TBC"}
                      </span>
                    ) : <span className="text-slate-400">Not set</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
