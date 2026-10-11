import { LEAD_KIND_LABEL, leadKindOf, leadTypeLabel, needsHdmi, needsUsb, PATCH_LEAD_COLOURS, patchColour } from "@/lib/patchLeads";
/*
 * CableTableRow — single editable row in the cable schedule table
 * Design: Clean Professional Dashboard — inline editing, status badge pills
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CABLE_TYPES,
  SIGNAL_TYPES,
  STATUS_CLASS,
  STATUS_OPTIONS,
  type CableRow,
  type CableStatus,
} from "@/lib/cableTypes";

interface Props {
  row: CableRow;
  index: number;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onChange: (id: string, field: keyof CableRow, value: string) => void;
  onDelete: (id: string) => void;
}

/** Wrapping text cell that grows to show its full contents (CSS grid auto-size, no measuring). */
function WrapCell({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="cable-cell-grow" data-value={`${value || placeholder || ""} `}>
      <textarea
        rows={1}
        className="cable-cell-input cable-cell-wrap"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
    </div>
  );
}

function TextCell({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      className="cable-cell-input"
      style={mono ? { fontFamily: "monospace", fontSize: "0.8rem" } : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SelectCell({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value || "__placeholder__"} onValueChange={(v) => onChange(v === "__placeholder__" ? "" : v)}>
      <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent px-0 focus:ring-0 w-full">
        <SelectValue placeholder={placeholder || "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {(value && !options.includes(value) ? [value, ...options] : options).map((opt) => (
          <SelectItem key={opt} value={opt} className="text-xs">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatusCell({
  value,
  onChange,
}: {
  value: CableStatus;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 border-0 shadow-none bg-transparent px-0 focus:ring-0 w-full">
        <SelectValue>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[value]}`}>
            {value}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLASS[s]}`}>
              {s}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Colour map by cable type — subtle tint so text stays readable
const CABLE_TYPE_COLOURS: Record<string, string> = {
  // Cat6 / network
  "Cat6 UTP":       "bg-blue-50",
  "Cat6 STP":       "bg-blue-50",
  "Cat6A UTP":      "bg-blue-100",
  "Cat6A STP":      "bg-blue-100",
  // Fibre / FST
  "FST":            "bg-violet-50",
  // Speaker
  "Twin Speaker":   "bg-amber-50",
  // Coax / video
  "RG6 Coax":       "bg-orange-50",
  "RG59 Coax":      "bg-orange-50",
  "SDI (75\u03a9)": "bg-orange-50",
  "HD-SDI":         "bg-orange-50",
  "3G-SDI":         "bg-orange-50",
  "12G-SDI":        "bg-orange-50",
  // HDMI
  "HDMI 2.0":       "bg-cyan-50",
  "HDMI 2.1":       "bg-cyan-50",
  // XLR / audio
  "XLR 3-Pin":      "bg-green-50",
  "XLR 5-Pin":      "bg-green-50",
  // Display
  "VGA":            "bg-slate-50",
  "DisplayPort 1.4":"bg-slate-50",
  // USB
  "USB-C":          "bg-teal-50",
  "USB-A":          "bg-teal-50",
};

export default function CableTableRow({ row, index, selected = false, onSelect, onChange, onDelete }: Props) {
  const isEven = index % 2 === 0;
  const typeColour = CABLE_TYPE_COLOURS[row.cableType];
  // If we have a type colour, use it; otherwise fall back to even/odd stripe
  const rowClass = typeColour ?? (isEven ? "cable-row-even" : "cable-row-odd");

  return (
    <tr className={`${rowClass} transition-colors duration-100 group${selected ? ' ring-2 ring-inset ring-blue-400' : ''}`}>
      {/* Checkbox */}
      <td className="px-2 py-1 w-8 sticky left-0 z-10 bg-inherit border-r border-border/40">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect?.(row.id)}
          className="accent-blue-500 cursor-pointer"
        />
      </td>
      {/* Cable Number */}
      <td className="px-3 py-1.5 text-center border-r border-border/60 w-20 sticky left-8 z-10 bg-inherit">
        <TextCell
          value={row.cableNumber}
          onChange={(v) => onChange(row.id, "cableNumber", v)}
          placeholder="001"
          mono
        />
      </td>
      {/* Cable Type */}
      <td className="px-2 py-1 border-r border-border/40 min-w-[130px]">
        <SelectCell
          value={row.cableType}
          options={CABLE_TYPES}
          onChange={(v) => onChange(row.id, "cableType", v)}
          placeholder="Cable type…"
        />
      </td>
      {/* Signal Type */}
      <td className="px-2 py-1 border-r border-border/40 min-w-[110px]">
        <SelectCell
          value={row.signalType}
          options={SIGNAL_TYPES}
          onChange={(v) => onChange(row.id, "signalType", v)}
          placeholder="Signal…"
        />
      </td>
      {/* Source */}
      <td className="px-3 py-1.5 border-r border-border/40 min-w-[200px]">
        <WrapCell
          value={row.source}
          onChange={(v) => onChange(row.id, "source", v)}
          placeholder="Source device / location"
        />
      </td>
      {/* Destination */}
      <td className="px-3 py-1.5 border-r border-border/40 min-w-[320px]">
        <WrapCell
          value={row.destination}
          onChange={(v) => onChange(row.id, "destination", v)}
          placeholder="Destination device / location"
        />
      </td>
      {/* Length */}
      <td className="px-3 py-1.5 border-r border-border/40 min-w-[90px]">
        <TextCell
          value={row.length}
          onChange={(v) => onChange(row.id, "length", v)}
          placeholder="e.g. 10m"
          mono
        />
      </td>
      {/* Patch / Rack Location */}
      <td className="px-3 py-1.5 border-r border-border/40 min-w-[210px]">
        <WrapCell
          value={row.patchLocation}
          onChange={(v) => onChange(row.id, "patchLocation", v)}
          placeholder="Rack / patch panel"
        />
      </td>
      {/* Patch lead (47U switch -> 12U rack) */}
      <td className="px-2 py-1 border-r border-border/40 min-w-[150px]">
        <div className="flex items-center gap-1.5">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-400"
            style={{ background: patchColour(row.patchLeadColour)?.hex ?? "transparent" }}
            title={row.patchLeadColour ? `${row.patchLeadColour} patch lead` : "No patch lead set"}
          />
          <select
            value={row.patchLeadColour ?? ""}
            onChange={(e) => onChange(row.id, "patchLeadColour", e.target.value)}
            aria-label="Patch lead colour"
            className="h-7 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-xs hover:border-slate-300 focus:border-blue-400 focus:outline-none"
          >
            <option value="">—</option>
            {PATCH_LEAD_COLOURS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            {row.patchLeadColour && !patchColour(row.patchLeadColour) && <option value={row.patchLeadColour}>{row.patchLeadColour}</option>}
          </select>
          <div className="w-12 shrink-0">
            <TextCell value={row.patchLeadLength ?? ""} onChange={(v) => onChange(row.id, "patchLeadLength", v)} placeholder="7m" mono />
          </div>
        </div>
        <p className={`mt-0.5 text-[10px] font-semibold leading-tight ${leadKindOf(row) === "speaker" ? "text-amber-700" : leadKindOf(row) === "dmx" ? "text-violet-700" : "text-slate-400"}`}>{leadTypeLabel(row)}</p>
      </td>
      {/* Leads at the destination end: part number and length */}
      {(() => {
        const items = ([
          ["destPatchCable", "destPatchLength", LEAD_KIND_LABEL[leadKindOf(row)].short],
          ["destHdmi", "destHdmiLength", "HDMI"],
          ["destUsb", "destUsbLength", "USB"],
        ] as const).filter(([field, lengthField]) =>
          field === "destPatchCable" || (field === "destUsb" ? needsUsb(row) : needsHdmi(row)) || row[field] || row[lengthField]
        );
        return (
          <>
            <td className="px-2 py-1 border-r border-border/40 min-w-[230px]">
              <div className="space-y-0.5">
                {items.map(([field, , label]) => {
                  const lead = field !== "destUsb" ? patchColour(row.patchLeadColour) : undefined;
                  return (
                    <div key={field} className="flex h-6 items-center gap-1.5">
                      <span
                        className={`w-10 shrink-0 text-[10px] font-bold uppercase tracking-wide ${lead ? "rounded px-1 py-0.5 text-center" : "text-slate-400"}`}
                        style={lead ? { background: lead.hex, color: lead.text, boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.25)" } : undefined}
                        title={lead ? `${lead.name} patch lead` : undefined}
                      >{label}</span>
                      <div className="min-w-0 flex-1">
                        <TextCell value={row[field] ?? ""} onChange={(v) => onChange(row.id, field, v)} placeholder="Part no." mono />
                      </div>
                    </div>
                  );
                })}
              </div>
            </td>
            <td className="px-2 py-1 border-r border-border/40 min-w-[90px]">
              <div className="space-y-0.5">
                {items.map(([field, lengthField, label]) => (
                  <div key={lengthField} className="flex h-6 items-center" title={`${label} length`}>
                    <TextCell value={row[lengthField] ?? ""} onChange={(v) => onChange(row.id, lengthField, v)} placeholder="e.g. 2m" mono />
                  </div>
                ))}
              </div>
            </td>
          </>
        );
      })()}
      {/* Status */}
      <td className="px-2 py-1 border-r border-border/40 w-32">
        <StatusCell
          value={row.status}
          onChange={(v) => onChange(row.id, "status", v as CableStatus)}
        />
      </td>
      {/* Notes */}
      <td className="px-3 py-1.5 border-r border-border/40 min-w-[220px]">
        <WrapCell
          value={row.notes}
          onChange={(v) => onChange(row.id, "notes", v)}
          placeholder="Notes…"
        />
      </td>
      {/* Delete */}
      <td className="px-2 py-1 text-center w-10">
        <button
          onClick={() => onDelete(row.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          title="Delete row"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </td>
    </tr>
  );
}
