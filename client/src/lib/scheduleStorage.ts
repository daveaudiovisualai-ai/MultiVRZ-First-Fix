import { isKarrinyup } from "./sites";
import type { CableRow } from "./cableTypes";
import { KARRINYUP_SWITCH_CABLES } from "./seedDataKarrinyup";

/** Browser storage key for the main (Karrinyup) cable schedule. */
export const CABLE_STORAGE_KEY = "multivrz_o2_cable_schedule_v4";

const CHECK_IN_RENAME_FLAG = "multivrz_migration_checkin_zones_v1";
const RECEPTION_DESK_FLAG = "multivrz_migration_reception_desk_v1";

/**
 * Cables 101–147 (Network Switch 1) serve the check-in zones, not the briefing
 * rooms. Keeps the zone number: "Hive A Briefing Room 1" -> "Hive A Check-in Zone 1".
 */
export function renameCheckInDestination(cable: CableRow): CableRow {
  const n = Number(cable.cableNumber);
  if (!(n >= 101 && n <= 147)) return cable;
  const destination = cable.destination
    .replace(/\bSPARE BRIEFING AREA (\d)\b/i, "SPARE CHECK-IN ZONE $1")
    .replace(/\bBriefing (?:Room|Rm) (\d)\b/i, "Check-in Zone $1");
  return destination === cable.destination ? cable : { ...cable, destination };
}

/** Cables added at KAR-AV P2 for the reception desk, each placed after the cable it follows in the seed. */
const RECEPTION_DESK_ADDITIONS: [after: string, added: string[]][] = [
  ["N405", ["N603"]],
  ["N703", ["N227", "N228", "N229", "N230", "N231"]],
];

/**
 * KAR-AV P2: the lighting button panels BP1–BP3 are not required, and the reception desk
 * gets the ChamSys lighting touch panel, a CCTV monitor RX and four network points.
 * Cables already in the schedule are left alone; a rack port someone else now uses is left blank.
 */
export function applyReceptionDeskChanges(cables: CableRow[]): CableRow[] {
  const result = cables.filter((cable) => !/lighting button panel/i.test(cable.destination));
  const seed = new Map(KARRINYUP_SWITCH_CABLES.map((cable) => [cable.cableNumber, cable]));
  RECEPTION_DESK_ADDITIONS.forEach(([after, numbers]) => {
    const missing = numbers.filter((n) => !result.some((cable) => cable.cableNumber === n));
    const added = missing.map((n) => {
      const cable = { ...seed.get(n)! };
      if (result.some((other) => other.rackPort && other.rackPort === cable.rackPort)) cable.rackPort = "";
      return cable;
    });
    const index = result.findIndex((cable) => cable.cableNumber === after);
    result.splice(index < 0 ? result.length : index + 1, 0, ...added);
  });
  return result;
}

/** Read the saved schedule, applying one-off corrections to older saved copies. */
export function readStoredCables(): CableRow[] | null {
  try {
    const raw = localStorage.getItem(CABLE_STORAGE_KEY);
    if (!raw) return null;
    let cables = JSON.parse(raw) as CableRow[];
    if (isKarrinyup() && !localStorage.getItem(CHECK_IN_RENAME_FLAG)) {
      cables = cables.map(renameCheckInDestination);
      localStorage.setItem(CABLE_STORAGE_KEY, JSON.stringify(cables));
      localStorage.setItem(CHECK_IN_RENAME_FLAG, "1");
    }
    if (isKarrinyup() && !localStorage.getItem(RECEPTION_DESK_FLAG)) {
      cables = applyReceptionDeskChanges(cables);
      localStorage.setItem(CABLE_STORAGE_KEY, JSON.stringify(cables));
      localStorage.setItem(RECEPTION_DESK_FLAG, "1");
    }
    return cables;
  } catch {
    return null;
  }
}
