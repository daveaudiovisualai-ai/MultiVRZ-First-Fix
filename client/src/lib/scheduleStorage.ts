import { isKarrinyup } from "./sites";
import type { CableRow } from "./cableTypes";

/** Browser storage key for the main (Karrinyup) cable schedule. */
export const CABLE_STORAGE_KEY = "multivrz_o2_cable_schedule_v4";

const CHECK_IN_RENAME_FLAG = "multivrz_migration_checkin_zones_v1";

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
    return cables;
  } catch {
    return null;
  }
}
