/** Cable lengths are stored in the schedule as metres, e.g. "15m". */
export type LengthUnit = "m" | "ft";

const FT_PER_M = 3.28084;

/** Parse a stored or typed length ("15m", "15", "49ft", "49 ft") to metres, or null. */
export function lengthInMetres(value: string): number | null {
  const match = value?.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(m|metres?|meters?|ft|feet|')?$/);
  if (!match) return null;
  const n = Number(match[1].replace(",", "."));
  const isFeet = match[2] === "ft" || match[2] === "feet" || match[2] === "'";
  return isFeet ? n / FT_PER_M : n;
}

/** What a typed entry becomes in the schedule. Plain numbers use the chosen unit. */
export function toStoredLength(text: string, unit: LengthUnit): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const plain = /^\d+(?:[.,]\d+)?$/.test(trimmed);
  const metres = lengthInMetres(plain ? `${trimmed}${unit}` : trimmed);
  if (metres === null) return trimmed;
  return `${Math.round(metres * 10) / 10}m`;
}

export function formatLength(metres: number, unit: LengthUnit) {
  const value = unit === "m" ? metres : metres * FT_PER_M;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`;
}
