import { O2_CABLES } from "../client/src/lib/seedDataO2";
import { buildConsumablesPlan } from "../client/src/lib/consumablesPlanner";

const plan = buildConsumablesPlan(O2_CABLES);
const byId = Object.fromEntries(plan.materials.map((item) => [item.id, item]));

function assertEqual(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

assertEqual("Network drops", plan.summary.networkDrops, 158);
assertEqual("Network patch panels", byId["excel-panel-frame"]?.qty, 7);
assertEqual("Cat6A keystones", byId["excel-keystone"]?.qty, 158);
assertEqual("Cat6A 305 m boxes", byId["excel-cat6a-cable"]?.qty, 13);
assertEqual("12U wall rack", byId["excel-wall-rack"]?.partNumber, "WB12.390SG-BK");
assertEqual("2-way GOP 10-packs", byId["excel-gop-2way"]?.qty, 16);
assertEqual("Samsung AAE 75 m OM4 fibre links", byId["samsung-aae-om4-fibre-links"]?.qty, 2);
assertEqual("U3 LC duplex fibre feedthroughs", byId["samsung-aae-lc-fibre-feedthrough"]?.qty, 2);

assertEqual("Remote GOP endpoints", plan.endpoints.filter((endpoint) => endpoint.endpointType === "GOP Box").length, 158);

console.log("Consumables planner verification passed", {
  summary: plan.summary,
  gopEndpoints: plan.endpoints.filter((endpoint) => endpoint.endpointType === "GOP Box").length,
  materialCount: plan.materials.length,
});
