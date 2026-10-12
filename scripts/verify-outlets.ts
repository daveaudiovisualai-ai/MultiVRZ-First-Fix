// Checks shared-outlet grouping: Karrinyup cables pair up in GOP boxes as on KAR-AV-IP-03 P2.
import { KARRINYUP_SWITCH_CABLES } from "../client/src/lib/seedDataKarrinyup";
import { KARRINYUP_OUTLETS } from "../client/src/lib/outlets";
import { buildDestinationDrops, dropIdForDestination, resolveDropPositions } from "../client/src/lib/destinationPlanner";
import { buildConsumablesPlan } from "../client/src/lib/consumablesPlanner";
import type { CableRow } from "../client/src/lib/cableTypes";

function equal(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
  console.log(`✓ ${label}`);
}

const cables = KARRINYUP_SWITCH_CABLES;
const byNumber = new Map(cables.map((c) => [c.cableNumber, c]));

// Every register cable is in the schedule and lands in its outlet.
const drops = buildDestinationDrops(cables);
const dropOf = (n: string) => drops.find((d) => d.cables.some((c) => c.cableNumber === n));
KARRINYUP_OUTLETS.forEach((outlet) => outlet.cables.forEach((n) => {
  if (!byNumber.has(n)) throw new Error(`${outlet.id}: cable ${n} is not in the schedule`);
  if (dropOf(n)?.outletId !== outlet.id) throw new Error(`${outlet.id}: cable ${n} landed in ${dropOf(n)?.outletId ?? dropOf(n)?.label}`);
}));
console.log(`✓ ${KARRINYUP_OUTLETS.length} outlets resolve against the schedule`);

const lectern = dropOf("N101")!;
equal("Lectern A Hive + touch share GOP-CI1-01", lectern.outletId, "GOP-CI1-01");
equal("GOP-CI1-01 cables", lectern.cables.map((c) => c.cableNumber).join(","), "N101,N102");
equal("GOP-CI1-01 box", `${lectern.gopQuantity} × ${lectern.gopType}`, "1 × 2-way GOP");
equal("Briefing Room 1 Turtle RX + control share one GOP", dropOf("N150")?.id, dropOf("N201")?.id);
equal("Spare has its own GOP with one blank", (dropOf("N115")!.gopPorts ?? 0) - dropOf("N115")!.networkCableCount, 1);
equal("CCTV camera is a field plug", dropOf("N501")?.gopType, "Field plug");
equal("No lighting button panels in the schedule", cables.some((c) => /button panel/i.test(c.destination)), false);
equal("Reception desk lighting touch panel is a field plug", dropOf("N603")?.outletId, "FP-CTL-09");
equal("Reception desk CCTV monitor RX has its own GOP with one blank", `${dropOf("N227")?.outletId} ${dropOf("N227")?.gopType}`, "GOP-REC-03 2-way GOP");
equal("Reception desk 4 network points share NP-REC-01", dropOf("N228")?.cables.map((c) => c.cableNumber).join(","), "N228,N229,N230,N231");
equal("NP-REC-01 box", dropOf("N231")?.gopType, "4-way GOP");

const twoWay = drops.filter((d) => d.gopType === "2-way GOP").reduce((n, d) => n + d.gopQuantity, 0);
const fourWay = drops.filter((d) => d.gopType === "4-way GOP").reduce((n, d) => n + d.gopQuantity, 0);
const perDestination = new Set(cables.filter((c) => c.signalType === "Network").map((c) => c.destination)).size;
console.log(`  2-way GOPs: ${twoWay}, 4-way: ${fourWay}, field plugs: ${drops.filter((d) => d.gopType === "Field plug").length} (previously one GOP per destination: ${perDestination})`);
equal("Consumables orders the same GOP count", buildConsumablesPlan(cables).summary.gopBoxes, twoWay + fourWay);

// A drop placed before grouping keeps its position.
const positions = resolveDropPositions({ [dropIdForDestination(byNumber.get("N102")!.destination)]: { dropId: "x", x: 10, y: 20 } }, drops);
equal("Outlet drop inherits a member cable's old position", positions[lectern.id]?.x, 10);

// Explicit outlet on any site: two cables typed into one outlet share a 2-way GOP; blank opts out.
const custom: CableRow[] = [
  { ...byNumber.get("N401")!, id: "a", outlet: "GOP-FOY-01" },
  { ...byNumber.get("N402")!, id: "b", outlet: "gop-foy-01" },
  { ...byNumber.get("N101")!, id: "c", outlet: "" },
];
const customDrops = buildDestinationDrops(custom);
equal("Typed outlet groups cables", customDrops.length, 2);
equal("Typed outlet box", customDrops.find((d) => d.outletId === "GOP-FOY-01")?.gopType, "2-way GOP");
equal("Blank outlet opts out of the register", customDrops.find((d) => d.cables[0].id === "c")?.outletId, undefined);
