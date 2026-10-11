import { O2_CABLES, O2_SEED_SITE } from "../client/src/lib/seedDataO2";
import { buildRackPlan } from "../client/src/lib/rackPlanner";
import { buildDestinationDrops } from "../client/src/lib/destinationPlanner";

function equal(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

const rack = buildRackPlan(O2_CABLES, O2_SEED_SITE);
const u3 = rack.panels.find((panel) => panel.unit === 3);
const u2 = rack.panels.find((panel) => panel.unit === 2);
const drops = buildDestinationDrops(O2_CABLES);
const hivePlayerSeven = drops.find((drop) => drop.label === "Hive Exit Display 7");
const fourWayTest = buildDestinationDrops([
  ...O2_CABLES.slice(0, 3).map((cable, index) => ({ ...cable, id: `four-way-${index}`, destination: "Four-way test drop" })),
]);
const multipleFourWayTest = buildDestinationDrops([
  ...O2_CABLES.slice(0, 5).map((cable, index) => ({ ...cable, id: `multiple-four-way-${index}`, destination: "Multiple four-way test drop" })),
]);

equal("U3 exists", Boolean(u3), true);
equal("U3 connector count", u3?.ports?.length, 12);
equal("U3 SpeakOn positions", u3?.ports?.filter((port) => port.connector === "speakon").length, 8);
equal("U3 5-pin XLR positions", u3?.ports?.filter((port) => port.connector === "xlr5").length, 2);
equal("U3 LC fibre positions", u3?.ports?.filter((port) => port.connector === "fibre").length, 2);
equal("U3 fibre provision count", rack.representedAtU3.fibre, 2);
equal("75 m OM4 fibre links", rack.parts.find((part) => part.item.includes("OM4 BIMMF"))?.quantity, 2);
equal("U3 LC feedthroughs", rack.parts.find((part) => part.item.includes("LC duplex D-series"))?.quantity, 2);
equal("U2 lighting label", u2?.shortLabel, "LIGHTING / SPARE");
equal("U2 blank XLR positions", u2?.ports?.filter((port) => port.connector === "xlrBlank").length, 12);
equal("Network panel count", rack.panels.filter((panel) => panel.kind === "network").length, 7);
equal("Destination count", drops.length > 100, true);
equal("Multi-cable destination calculation", hivePlayerSeven?.gopType, "2-way GOP");
equal("Multi-cable destination GOP quantity", hivePlayerSeven?.gopQuantity, 1);
equal("Four-cable GOP sizing", fourWayTest[0]?.gopType, "4-way GOP");
equal("Five-cable GOP sizing", multipleFourWayTest[0]?.gopType, "Multiple 4-way GOP");
equal("Five-cable GOP quantity", multipleFourWayTest[0]?.gopQuantity, 2);

console.log("Rack and destination planner verification passed", {
  rack: { usedU: rack.usedU, speakerAtU3: rack.representedAtU3.speaker, dmxAtU3: rack.representedAtU3.dmx },
  drops: { total: drops.length, twoWay: drops.filter((drop) => drop.gopType === "2-way GOP").length, fourWay: drops.filter((drop) => drop.gopType === "4-way GOP").length },
});
