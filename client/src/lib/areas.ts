/**
 * Site area for a cable drop, worked out from its destination name.
 * Used to filter the AV Drops and CCTV & WAP plans.
 */
export const AREA_ORDER = [
  "Vortex",
  "Briefing Room 1",
  "Briefing Room 2",
  "Briefing Room 3",
  "Briefing exits",
  "Check-in 1",
  "Check-in 2",
  "Check-in 3",
  "Exit Corridor",
  "Foyer",
  "Reception",
  "Map Wall",
  "Mall frontage",
  "Other",
];

export function areaOf(destination: string): string {
  const d = destination.toLowerCase().replace(/\s+/g, " ").trim();
  if (/exit corridor/.test(d)) return "Exit Corridor";
  if (/briefing (?:room )?(?:\d\s*&\s*\d|\d) exit|briefing room \d exit/.test(d)) return "Briefing exits";
  const checkIn = d.match(/check\s?-?\s?in(?: zone)? ?(\d)/);
  if (checkIn) return `Check-in ${checkIn[1]}`;
  const briefing = d.match(/briefing (?:room |rm )?(\d)/);
  if (briefing) return `Briefing Room ${briefing[1]}`;
  if (/map wall/.test(d)) return "Map Wall";
  if (/to mall|external vortex/.test(d)) return "Mall frontage";
  if (/vortex|west wall|east wall|snow controller|hive doors|^sub$/.test(d)) return "Vortex";
  if (/foyer/.test(d)) return "Foyer";
  if (/reception/.test(d)) return "Reception";
  return "Other";
}
