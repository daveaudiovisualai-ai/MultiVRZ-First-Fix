/*
 * SiteDetailsHeader — sticky top bar with editable site details + live progress bar
 * Design: Clean Professional Dashboard — Multivrz branding
 * Dark primary bar, cyan accent, Barlow Semi Condensed headings
 * Progress bar shows % of cables Installed or Tested (i.e. "done")
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SiteDetails, CableRow } from "@/lib/cableTypes";

const LOGO_URL = "assets/multivrz_logo.png";

interface Props {
  site: SiteDetails;
  onChange: (updated: SiteDetails) => void;
  cables?: CableRow[];
}

const fields: { key: keyof SiteDetails; label: string; placeholder: string; type?: string }[] = [
  { key: "jobNumber", label: "Job Number",  placeholder: "e.g. AV-2026-001" },
  { key: "date",      label: "Date",        placeholder: "",  type: "date" },
  { key: "client",    label: "Client",      placeholder: "e.g. Multivrz" },
  { key: "engineer",  label: "Engineer",    placeholder: "Your name" },
  { key: "revision",  label: "Revision",    placeholder: "A" },
];

// Colour thresholds for the progress bar fill
function progressColour(pct: number): string {
  if (pct >= 100) return "#22c55e"; // green-500
  if (pct >= 75)  return "#06b6d4"; // cyan-500
  if (pct >= 40)  return "#3b82f6"; // blue-500
  return "#94a3b8";                 // slate-400
}

export default function SiteDetailsHeader({ site, onChange, cables = [] }: Props) {
  const handleChange = (key: keyof SiteDetails, value: string) => {
    onChange({ ...site, [key]: value });
  };

  // ── Progress calculation ─────────────────────────────────────────────────
  const total = cables.length;
  const done  = cables.filter((c) => c.status === "Installed" || c.status === "Tested").length;
  const faults = cables.filter((c) => c.status === "Fault").length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const colour = progressColour(pct);

  return (
    <div className="bg-white border-b border-border shadow-sm print:shadow-none">
      {/* Brand bar */}
      <div className="bg-slate-900 px-4 py-2 flex items-center gap-4 print:bg-white print:border-b print:border-slate-300">
        {/* Multivrz logo */}
        <div className="bg-slate-800 rounded px-2 py-1 flex items-center shrink-0 border border-slate-600 print:bg-transparent print:border-slate-300">
          <img
            src={LOGO_URL}
            alt="Multivrz"
            className="h-8 w-auto object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="h-6 w-px bg-slate-600 print:bg-slate-300" />
        <h1
          className="text-white font-semibold tracking-wide print:text-slate-900 hidden xs:block"
          style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "1.05rem", letterSpacing: "0.06em" }}
        >
          <span className="hidden sm:inline">MultiVRZ CABLE SCHEDULE</span>
          <span className="sm:hidden">O2 SCHEDULE</span>
        </h1>

        {/* ── Live progress bar (right side of brand bar) ─────────────────── */}
        {total > 0 && (
          <div className="ml-auto flex items-center gap-3 print:hidden">
            {/* Stat pills */}
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="text-slate-400">{done}/{total}</span>
              {faults > 0 && (
                <span className="bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded-full font-semibold">
                  {faults} fault{faults !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {/* Bar + percentage */}
            <div className="flex items-center gap-2">
              <div className="w-20 sm:w-32 md:w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: colour }}
                />
              </div>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: colour, minWidth: "2.8rem", textAlign: "right" }}
              >
                {pct}%
              </span>
              <span className="text-slate-400 text-xs hidden lg:block">
                {pct === 100 ? "Complete" : "Installed"}
              </span>
            </div>
          </div>
        )}

        <span className={`${total > 0 ? "hidden" : "ml-auto"} text-cyan-400 text-xs font-medium tracking-widest uppercase hidden sm:block`}>
          Global AV Solutions
        </span>
      </div>

      {/* Site details fields */}
      <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-2">
        {fields.map(({ key, label, placeholder, type }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <Label
              htmlFor={`site-${key}`}
              className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.68rem" }}
            >
              {label}
            </Label>
            <Input
              id={`site-${key}`}
              type={type || "text"}
              value={site[key]}
              placeholder={placeholder}
              onChange={(e) => handleChange(key, e.target.value)}
              className="h-8 text-sm border-border focus:border-cyan-500 print:border-slate-300"
              style={{ fontFamily: "'Barlow', sans-serif" }}
            />
          </div>
        ))}
      </div>

      {/* ── Mobile progress bar (below fields, only when data present) ─────── */}
      {total > 0 && (
        <div className="md:hidden px-4 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: colour }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums" style={{ color: colour }}>
              {pct}% installed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
