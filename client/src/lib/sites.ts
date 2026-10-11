/**
 * Site library. Each site (job) keeps its own schedule, rack, drops, power and
 * progress. Karrinyup was the first site and keeps its original storage paths.
 *
 * Only one site is "open" at a time in a browser: its data sits in the usual
 * localStorage keys, and switching site stashes those keys and reloads.
 */

export type SiteStatus = "active" | "complete" | "archived";

export interface PortDesignationSetting {
  destination: string;
  cableType: string;
  signalType: string;
}

export interface SiteRecord {
  id: string;
  name: string;
  client: string;
  jobNumber: string;
  address: string;
  engineer: string;
  startDate: string;
  status: SiteStatus;
  createdAt: string;
  /** url for a built-in image; chunks/version when the plan lives in the shared store. */
  floorPlan?: { url: string; fileName: string; chunks?: number; version?: string };
  /** Named connectors on the Audio / DMX / Fibre panels, keyed by panel id. */
  connectorNames?: Record<string, PortDesignationSetting[]>;
}

export const KARRINYUP_ID = "karrinyup";

export const KARRINYUP_SITE: SiteRecord = {
  id: KARRINYUP_ID,
  name: "Karrinyup WA",
  client: "Multivrz",
  jobNumber: "Karrinyup",
  address: "Karrinyup, WA",
  engineer: "Billy Garbett",
  startDate: "2026-08-31",
  status: "active",
  createdAt: "2026-09-28T00:00:00.000Z",
  floorPlan: { url: "assets/karrinyup-floor-plan.png", fileName: "Multi VRZ Karrinyup WA floor plan" },
};

const ACTIVE_KEY = "multivrz_active_site";
const LOCAL_SITE_KEY = "multivrz_local_site";
const REGISTRY_KEY = "multivrz_sites_v1";
const STASH_PREFIX = "multivrz_site_stash_";

/** localStorage keys holding the open site's working data. */
export const SITE_DATA_KEYS = [
  "multivrz_o2_cable_schedule_v4",
  "multivrz_o2_cable_schedule_site_v2",
  "multivrz_destination_drops_o2_v1",
  "multivrz_power_points_o2_v1",
  "av_panel_signoffs_v2",
  "multivrz_consumables_o2_v3",
  "multivrz_progress_o2_v1",
];

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function activeSiteId(): string {
  return read(ACTIVE_KEY) || KARRINYUP_ID;
}

export function readRegistry(): SiteRecord[] {
  try {
    const parsed = JSON.parse(read(REGISTRY_KEY) || "null") as { sites?: SiteRecord[] } | null;
    const sites = parsed?.sites?.length ? parsed.sites : [KARRINYUP_SITE];
    return sites.some((s) => s.id === KARRINYUP_ID) ? sites : [KARRINYUP_SITE, ...sites];
  } catch {
    return [KARRINYUP_SITE];
  }
}

export function writeRegistryLocal(sites: SiteRecord[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify({ sites }));
  } catch {
    /* ignore */
  }
}

export const REGISTRY_STORAGE_KEY = REGISTRY_KEY;

export function activeSite(): SiteRecord {
  const id = activeSiteId();
  return readRegistry().find((s) => s.id === id) ?? KARRINYUP_SITE;
}

export function isKarrinyup() {
  return activeSiteId() === KARRINYUP_ID;
}

/** Shared document path for one of the open site's data documents. */
export function siteDocPath(docId: string, siteId = activeSiteId()) {
  return siteId === KARRINYUP_ID ? `app/${docId}` : `sites/${siteId}/data/${docId}`;
}

/** Shared collection holding the open site's progress records. */
export function siteProgressCollection(siteId = activeSiteId()) {
  return siteId === KARRINYUP_ID ? "progress" : `sites/${siteId}/progress`;
}

/**
 * Before the app reads storage: if this browser's working keys belong to a
 * different site, stash them and restore the open site's stash (if any).
 * Returns true when keys were swapped.
 */
export function prepareLocalSite(rawSet: (key: string, value: string | null) => void): boolean {
  const active = activeSiteId();
  const local = read(LOCAL_SITE_KEY) || KARRINYUP_ID;
  if (local === active) return false;
  const stash: Record<string, string> = {};
  SITE_DATA_KEYS.forEach((key) => {
    const value = read(key);
    if (value !== null) stash[key] = value;
  });
  rawSet(STASH_PREFIX + local, JSON.stringify(stash));
  let restored: Record<string, string> = {};
  try {
    restored = JSON.parse(read(STASH_PREFIX + active) || "{}");
  } catch {
    restored = {};
  }
  SITE_DATA_KEYS.forEach((key) => rawSet(key, restored[key] ?? null));
  rawSet(LOCAL_SITE_KEY, active);
  return true;
}

/** Open another site (reloads the page on the Cable Schedule). */
export function switchSite(siteId: string, path = "/") {
  try {
    localStorage.setItem(ACTIVE_KEY, siteId);
  } catch {
    /* ignore */
  }
  window.location.hash = `#${path}`;
  window.location.reload();
}

export function newSiteId(name: string, existing: string[]) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "site";
  let id = base;
  for (let n = 2; existing.includes(id); n += 1) id = `${base}-${n}`;
  return id;
}

/** Change one site's record in the library (shared with everyone on the hosted page). */
export function updateSite(id: string, patch: Partial<SiteRecord>) {
  writeRegistryLocal(readRegistry().map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s)));
}

export function addSite(site: SiteRecord) {
  writeRegistryLocal([...readRegistry(), site]);
}
