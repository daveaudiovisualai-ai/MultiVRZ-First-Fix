/**
 * Patch leads from the network switches in the 47U equipment rack to the
 * keystone panels in the 12U connection rack (bundled in a cable sock).
 */
import type { CableRow } from "./cableTypes";

export const PATCH_LEAD_COLOURS: { name: string; hex: string; text: string }[] = [
  { name: "Yellow", hex: "#facc15", text: "#422006" },
  { name: "Blue", hex: "#2563eb", text: "#ffffff" },
  { name: "Green", hex: "#16a34a", text: "#ffffff" },
  { name: "Red", hex: "#dc2626", text: "#ffffff" },
  { name: "Orange", hex: "#f97316", text: "#ffffff" },
  { name: "Purple", hex: "#7c3aed", text: "#ffffff" },
  { name: "Pink", hex: "#ec4899", text: "#ffffff" },
  { name: "White", hex: "#f8fafc", text: "#0f172a" },
  { name: "Grey", hex: "#94a3b8", text: "#0f172a" },
  { name: "Black", hex: "#0f172a", text: "#ffffff" },
];

export const PATCH_LEAD_ROUTE = "47U rack switch → 12U rack, bundled in cable sock";
export const DEFAULT_PATCH_LEAD_LENGTH = "7m";

export function patchColour(name?: string) {
  if (!name) return undefined;
  return PATCH_LEAD_COLOURS.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
}

/** "Network Switch 1 Port 01" -> { switch: "1", port: "01" } */
export function switchPortOf(cable: CableRow) {
  const m = cable.source.match(/switch\s*(\d+)\s*port\s*(\d+)/i);
  return m ? { switchNo: m[1], port: m[2] } : null;
}

export function hasPatchLead(cable: CableRow) {
  return Boolean(cable.patchLeadColour || cable.patchLeadLength);
}

/** One line describing the lead, e.g. "Yellow · 7m". */
export function patchLeadSummary(cable: CableRow) {
  return [leadTypeLabel(cable), cable.patchLeadColour, cable.patchLeadLength].filter(Boolean).join(" · ");
}

/** Hive players need HDMI and USB leads at the destination; Turtle receivers need HDMI only. */
export function isHivePlayer(cable: CableRow) {
  return /^\s*hive\b/i.test(cable.destination);
}
export function needsUsb(cable: CableRow) {
  return isHivePlayer(cable);
}
export function needsHdmi(cable: CableRow) {
  return isHivePlayer(cable) || /turtle/i.test(cable.destination);
}

export type LeadKind = "network" | "speaker" | "dmx" | "other";

/** What the 47U → 12U link physically is for this cable. */
export function leadKindOf(cable: CableRow): LeadKind {
  const num = cable.cableNumber.trim().toUpperCase();
  const sig = `${cable.signalType} ${cable.cableType}`.toLowerCase();
  if (num.startsWith("A") || /speakon|speaker|audio/.test(sig)) return "speaker";
  if (num.startsWith("L") || /dmx|5 core/.test(sig)) return "dmx";
  if (/network|cat\s?6|cat\s?5|rj45/.test(sig)) return "network";
  return "other";
}

export const LEAD_KIND_LABEL: Record<LeadKind, { full: string; short: string }> = {
  network: { full: "Cat6A patch lead", short: "Patch" },
  speaker: { full: "Speaker cable (not a patch lead)", short: "Spkr" },
  dmx: { full: "Shielded DMX 5-pin XLR patch lead", short: "DMX" },
  other: { full: "Lead", short: "Lead" },
};

export function leadTypeLabel(cable: CableRow) {
  return LEAD_KIND_LABEL[leadKindOf(cable)].full;
}
