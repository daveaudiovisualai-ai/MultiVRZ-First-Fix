import { buildRackPlan } from "../client/src/lib/rackPlanner";
import { O2_CABLES, O2_SEED_SITE } from "../client/src/lib/seedDataO2";

const plan = buildRackPlan(O2_CABLES, O2_SEED_SITE);
const expected = { network: 158, speaker: 25, dmx: 0, fibre: 0, usedU: 12, overflow: 0 };

for (const [key, value] of Object.entries(expected)) {
  const actual = key === "usedU" ? plan.usedU : key === "overflow" ? plan.overflowPanels.length : plan.counts[key as keyof typeof plan.counts];
  if (actual !== value) {
    throw new Error(`Expected ${key} to equal ${value}; received ${actual}`);
  }
}

const keystones = plan.parts.find((part) => part.item === "Cat6A shielded keystone jack");
if (keystones?.quantity !== 158) {
  throw new Error(`Expected 158 Cat6A keystone jacks; received ${keystones?.quantity ?? "none"}`);
}

console.log("Rack planner calculation check passed", {
  counts: plan.counts,
  usedU: plan.usedU,
  overflowU: plan.overflowPanels.length,
  parts: plan.parts.length,
});
