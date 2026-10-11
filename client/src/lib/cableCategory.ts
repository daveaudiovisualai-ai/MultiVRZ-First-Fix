import type { CableRow } from "./cableTypes";
import { classifyRackConnection } from "./rackPlanner";

export type CableCategory = "network" | "cctv" | "wap" | "speaker" | "dmx" | "fibre" | "video" | "other";

export const CABLE_CATEGORY_META: Record<CableCategory, { label: string; colour: string }> = {
  network: { label: "Network (Cat6A)", colour: "#06b6d4" },
  cctv: { label: "CCTV (network)", colour: "#2563eb" },
  wap: { label: "Wireless access point", colour: "#65a30d" },
  speaker: { label: "Speaker", colour: "#f97316" },
  dmx: { label: "DMX", colour: "#8b5cf6" },
  fibre: { label: "Fibre", colour: "#10b981" },
  video: { label: "Video / HDMI / SDI", colour: "#e11d48" },
  other: { label: "Other", colour: "#64748b" },
};

export function cableCategory(cable: CableRow): CableCategory {
  const kind = classifyRackConnection(cable);
  if (kind === "network") {
    // CCTV and wireless access points are network cables, shown in their own colours.
    const where = `${cable.destination} ${cable.notes}`.toLowerCase();
    if (/\b(cctv\d*|camera\d*|cam\s?\d+|ptz|nvr)\b/.test(where)) return "cctv";
    if (/\b(waps?\d*|wireless access point|access point|wi-?fi ap|wifi)\b/.test(where)) return "wap";
  }
  if (kind) return kind;
  const text = `${cable.cableType} ${cable.signalType}`.toLowerCase();
  if (/(hdmi|sdi|coax|rg6|rg59|displayport|vga|usb)/.test(text)) return "video";
  return "other";
}

/** The most common category among a drop's cables. */
export function dominantCategory(cables: CableRow[]): CableCategory {
  const counts = new Map<CableCategory, number>();
  cables.forEach((cable) => {
    const category = cableCategory(cable);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  });
  let best: CableCategory = "other";
  let bestCount = -1;
  counts.forEach((count, category) => {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  });
  return best;
}
