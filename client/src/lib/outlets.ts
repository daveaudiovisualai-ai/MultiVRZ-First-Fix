/**
 * Outlets (GOP boxes, network plates and field plugs) at the remote end of a cable.
 *
 * Several cables can terminate in one outlet, e.g. a display's Turtle RX and
 * control cables in one 2-way GOP. A cable's outlet comes from its own `outlet`
 * field when set, otherwise from the site's built-in outlet register below.
 * Outlet ids follow the drawings: GOP-… (GOP box), NP-… (network plate), FP-… (field plug).
 */
import type { CableRow } from "./cableTypes";
import { areaOf } from "./areas";
import { isKarrinyup } from "./sites";

export interface OutletDefinition {
  id: string;
  /** areaOf() of the cables' destinations; a cable only joins the outlet when it matches. */
  area: string;
  description: string;
  /** Cable numbers as they appear in the app's schedule. */
  cables: string[];
  /** Cable numbers on the drawing, where the drawing numbers them differently. */
  drawingCables?: string[];
}

const gop = (id: string, area: string, description: string, cables: string[], drawingCables?: string[]): OutletDefinition =>
  ({ id, area, description, cables, drawingCables });

const lecterns = (zone: 1 | 2 | 3, first: number, touch: string, hive: string) =>
  [0, 1, 2, 3].map((i) => gop(
    `GOP-CI${zone}-0${i + 1}`, `Check-in ${zone}`,
    `Check-in Zone ${zone} lectern – QM43T ${String.fromCharCode(touch.charCodeAt(0) + i)} + Hive ${String.fromCharCode(hive.charCodeAt(0) + i)}`,
    [`N${first + i * 2}`, `N${first + i * 2 + 1}`],
  ));

const lgTouch = (zone: 1 | 2 | 3, first: number, touch: string, hive: string) =>
  [0, 1].map((i) => gop(
    `GOP-CI${zone}-0${i + 5}`, `Check-in ${zone}`,
    `Check-in Zone ${zone} – LG transparent touch ${String.fromCharCode(touch.charCodeAt(0) + i)} + Hive ${String.fromCharCode(hive.charCodeAt(0) + i)}`,
    [`N${first + i * 2}`, `N${first + i * 2 + 1}`],
  ));

const fieldPlugs = (prefix: string, area: string, label: string, first: number, count: number) =>
  Array.from({ length: count }, (_, i) => gop(
    `FP-${prefix}-${String(i + 1).padStart(2, "0")}`, area, `${label} ${String(i + 1).padStart(2, "0")}`, [`N${first + i}`],
  ));

/**
 * Karrinyup outlet register, from KAR-AV-IP-03 Outlet & device schedule rev P2 (09/10/2026):
 * one 2-way GOP per display (its Turtle RX / Hive and control cables share the box)
 * and every spare cable in its own 2-way GOP with one blank.
 * Cables are listed by their number in the app's schedule; from N149 the P2 drawing
 * renumbers the runs, so `drawingCables` gives the drawing's numbers.
 * Lighting button panels BP1–BP3 (FP-CTL-06 to 08) were removed at P2.
 * Not yet in the app's schedule: GOP-SPR-01 (N192) and FP-AUR-01–03 (N232–N234).
 */
export const KARRINYUP_OUTLETS: OutletDefinition[] = [
  ...lecterns(1, 101, "A", "A"),
  ...lgTouch(1, 109, "A", "E"),
  gop("GOP-CI1-07", "Check-in 1", "Check-in Zone 1 – Pufferfish A touchscreen & stand (LAN 1 + LAN 2)", ["N113", "N114"]),
  gop("GOP-CI1-08", "Check-in 1", "Check-in Zone 1 – 75\" QM75C, Turtle RX + control", ["N204", "N153"], ["N155", "N156"]),
  gop("GOP-CI1-09", "Check-in 1", "Check-in Zone 1 spare (own GOP, 1 blank)", ["N115"]),

  ...lecterns(2, 117, "E", "G"),
  ...lgTouch(2, 125, "C", "K"),
  gop("GOP-CI2-07", "Check-in 2", "Check-in Zone 2 – Pufferfish B touchscreen & stand (LAN 1 + LAN 2)", ["N129", "N130"]),
  gop("GOP-CI2-08", "Check-in 2", "Check-in Zone 2 – 75\" QM75C, Turtle RX + control", ["N205", "N154"], ["N157", "N158"]),
  gop("GOP-CI2-09", "Check-in 2", "Check-in Zone 2 spare (own GOP, 1 blank)", ["N131"]),

  ...lecterns(3, 133, "I", "M"),
  ...lgTouch(3, 141, "E", "Q"),
  gop("GOP-CI3-07", "Check-in 3", "Check-in Zone 3 – Pufferfish C touchscreen & stand (LAN 1 + LAN 2)", ["N145", "N146"]),
  gop("GOP-CI3-08", "Check-in 3", "Check-in Zone 3 – 75\" QM75C, Turtle RX + control", ["N206", "N155"], ["N159", "N160"]),
  gop("GOP-CI3-09", "Check-in 3", "Check-in Zone 3 – additional 75\" QM75C (map)", ["N159"], ["N164"]),
  gop("GOP-CI3-10", "Check-in 3", "Check-in Zone 3 spare (own GOP, 1 blank)", ["N147"]),

  gop("GOP-BR1-01", "Briefing Room 1", "Briefing Room 1 – 110\" IAB LED, Turtle RX + control", ["N201", "N150"], ["N149", "N150"]),
  gop("GOP-BR1-02", "Briefing Room 1", "Briefing Room 1 spare (own GOP, 1 blank)", ["N156"], ["N161"]),
  gop("GOP-BR2-01", "Briefing Room 2", "Briefing Room 2 – 110\" IAB LED, Turtle RX + control", ["N202", "N151"], ["N151", "N152"]),
  gop("GOP-BR2-02", "Briefing Room 2", "Briefing Room 2 spare (own GOP, 1 blank)", ["N157"], ["N162"]),
  gop("GOP-BR3-01", "Briefing Room 3", "Briefing Room 3 – 110\" IAB LED, Turtle RX + control", ["N203", "N152"], ["N153", "N154"]),
  gop("GOP-BR3-02", "Briefing Room 3", "Briefing Room 3 spare (own GOP, 1 blank)", ["N158"], ["N163"]),

  ...["A", "B", "C", "D", "E", "F", "G", "H"].map((letter, i) =>
    gop(`GOP-EXC-0${i + 1}`, "Exit Corridor", `Exit signage ${letter} (1 blank)`, [`N${160 + i}`], [`N${165 + i}`])),

  gop("GOP-MAP-01", "Map Wall", "Map wall LEFT – 146\" IAB LED, Turtle RX + control", ["N168", "N207"], ["N173", "N174"]),
  gop("GOP-MAP-02", "Map Wall", "Map wall RIGHT – 146\" IAB LED, Turtle RX + control", ["N169", "N208"], ["N175", "N176"]),

  gop("GOP-VTX-01", "Mall frontage", "Vortex external to mall LEFT – 146\" LED, Turtle RX + control", ["N170", "N209"], ["N177", "N178"]),
  gop("GOP-VTX-02", "Mall frontage", "Vortex external to mall RIGHT – 146\" LED, Turtle RX + control", ["N171", "N210"], ["N179", "N180"]),
  gop("GOP-VTX-03", "Vortex", "Vortex West wall LEFT – 146\" LED, Turtle RX + control", ["N172", "N211"], ["N181", "N182"]),
  gop("GOP-VTX-04", "Vortex", "Vortex West wall RIGHT – 146\" LED, Turtle RX + control", ["N173", "N212"], ["N183", "N184"]),
  gop("GOP-VTX-05", "Vortex", "Vortex East wall LEFT – 146\" LED, Turtle RX + control", ["N174", "N213"], ["N185", "N186"]),
  gop("GOP-VTX-06", "Vortex", "Vortex East wall RIGHT – 146\" LED, Turtle RX + control", ["N175", "N214"], ["N187", "N188"]),
  gop("GOP-VTX-07", "Vortex", "Vortex spare (own GOP, 1 blank)", ["N176"], ["N189"]),

  gop("GOP-REC-01", "Reception", "Reception – 75\" QM75C signage (1 blank)", ["N177"], ["N190"]),
  gop("GOP-REC-03", "Reception", "Reception desk – CCTV monitor HDBaseT RX (1 blank)", ["N227"]),
  gop("GOP-REC-04", "Reception", "Reception spare (own GOP, 1 blank)", ["N178"], ["N191"]),
  gop("NP-REC-01", "Reception", "Reception desk – 4-way network plate", ["N228", "N229", "N230", "N231"]),

  gop("FP-CTL-01", "Vortex", "Touch panel TP1 – Vortex entry", ["N401"]),
  gop("FP-CTL-02", "Vortex", "Touch panel TP2 – Vortex exit", ["N402"]),
  gop("FP-CTL-03", "Briefing Room 1", "Touch panel TP3 – Briefing Room 1", ["N403"]),
  gop("FP-CTL-04", "Briefing Room 2", "Touch panel TP4 – Briefing Room 2", ["N404"]),
  gop("FP-CTL-05", "Briefing Room 3", "Touch panel TP5 – Briefing Room 3", ["N405"]),
  gop("FP-CTL-09", "Reception", "ChamSys lighting touch panel – reception desk", ["N603"]),
  ...fieldPlugs("CCTV", "Other", "CCTV camera", 501, 16),
  ...fieldPlugs("WAP", "Other", "Wireless access point", 701, 3),
];

function normaliseNumber(value: string) {
  return value.trim().toUpperCase();
}

const outletIndex = new Map<string, OutletDefinition>();
KARRINYUP_OUTLETS.forEach((outlet) => outlet.cables.forEach((cable) => outletIndex.set(cable, outlet)));

const definitionsById = new Map(KARRINYUP_OUTLETS.map((outlet) => [outlet.id.toUpperCase(), outlet]));

/** The site register's outlet for a cable, if any. */
export function builtInOutletFor(cable: Pick<CableRow, "cableNumber" | "destination">): OutletDefinition | undefined {
  if (!isKarrinyup()) return undefined;
  const outlet = outletIndex.get(normaliseNumber(cable.cableNumber));
  // The register follows the schedule's numbering; skip it if a number has since moved to another area.
  return outlet && areaOf(cable.destination) === outlet.area ? outlet : undefined;
}

/** The outlet id a cable terminates in, or "" for none. A cable's own `outlet` value wins, even when blank. */
export function outletIdFor(cable: Pick<CableRow, "cableNumber" | "destination" | "outlet">): string {
  if (cable.outlet !== undefined) return cable.outlet.trim().toUpperCase();
  return builtInOutletFor(cable)?.id ?? "";
}

export function outletDefinition(outletId: string): OutletDefinition | undefined {
  return isKarrinyup() ? definitionsById.get(outletId.toUpperCase()) : undefined;
}

export function isFieldPlug(outletId: string) {
  return /^FP-/i.test(outletId);
}
