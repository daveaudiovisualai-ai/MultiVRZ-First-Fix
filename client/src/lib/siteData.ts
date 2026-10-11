/**
 * Read and write a whole site's data (schedule, site details, drops, power,
 * sign-offs, consumables and progress) — for the Sites page stats, copying a
 * site, and backup / restore.
 */
import type { CableRow } from "./cableTypes";
import { lengthInMetres } from "./cableLength";
import { sitePlanUrl } from "./floorPlanStore";
import { PROGRESS_STAGES, type ProgressRecord, progressDocId } from "./progressStore";
import { flushSharedChanges, getSharedDb, getSharedStatus, getSharedUserId } from "./sharedSync";
import { activeSiteId, readRegistry, switchSite, SITE_DATA_KEYS, siteDocPath, siteProgressCollection, type SiteRecord } from "./sites";

/** localStorage key -> backup / shared document name. */
export const DATA_DOCS: Record<string, string> = {
  multivrz_o2_cable_schedule_v4: "schedule",
  multivrz_o2_cable_schedule_site_v2: "site",
  multivrz_destination_drops_o2_v1: "drops",
  multivrz_power_points_o2_v1: "power",
  av_panel_signoffs_v2: "signoffs",
  multivrz_consumables_o2_v3: "consumables",
};
const PROGRESS_LOCAL_KEY = "multivrz_progress_o2_v1";
const STASH_PREFIX = "multivrz_site_stash_";

export interface SiteSnapshot {
  /** Raw JSON strings by document name. */
  docs: Record<string, string>;
  progress: Record<string, ProgressRecord>;
}

export interface SiteBackup {
  format: "multivrz-site-backup";
  version: 1;
  exportedAt: string;
  site: SiteRecord;
  data: Record<string, unknown>;
  progress: Record<string, ProgressRecord>;
  floorPlanImage?: string;
}

function shared() {
  const db = getSharedDb();
  return db && getSharedStatus() !== "local" ? db : null;
}

function readCollectionOnce(path: string): Promise<Record<string, ProgressRecord>> {
  const db = shared();
  if (!db) return Promise.resolve({});
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | undefined;
    const finish = (value: Record<string, ProgressRecord>) => {
      if (done) return;
      done = true;
      setTimeout(() => unsubscribe?.(), 0);
      resolve(value);
    };
    unsubscribe = db.collection(path).onSnapshot(
      (snap) => {
        const out: Record<string, ProgressRecord> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          if (d.exists && data) out[d.id] = data as ProgressRecord;
        });
        finish(out);
      },
      () => finish({})
    );
    setTimeout(() => finish({}), 8000);
  });
}

function parse<T>(raw: string | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function readSite(siteId: string): Promise<SiteSnapshot> {
  const db = shared();
  const docs: Record<string, string> = {};
  if (siteId === activeSiteId()) {
    Object.entries(DATA_DOCS).forEach(([key, name]) => {
      const raw = localStorage.getItem(key);
      if (raw !== null) docs[name] = raw;
    });
    const progress = db ? await readCollectionOnce(siteProgressCollection(siteId)) : parse(localStorage.getItem(PROGRESS_LOCAL_KEY) ?? undefined, {});
    return { docs, progress };
  }
  if (db) {
    const names = Object.values(DATA_DOCS);
    const snaps = await Promise.all(names.map((name) => db.doc(siteDocPath(name, siteId)).get().catch(() => null)));
    snaps.forEach((snap, i) => {
      const json = snap?.exists ? (snap.data()?.json as string | undefined) : undefined;
      if (typeof json === "string") docs[names[i]] = json;
    });
    return { docs, progress: await readCollectionOnce(siteProgressCollection(siteId)) };
  }
  const stash = parse<Record<string, string>>(localStorage.getItem(STASH_PREFIX + siteId) ?? undefined, {});
  Object.entries(DATA_DOCS).forEach(([key, name]) => {
    if (stash[key] !== undefined) docs[name] = stash[key];
  });
  return { docs, progress: parse(stash[PROGRESS_LOCAL_KEY], {}) };
}

/** Replace a site's data. The open site is written through this browser (and so shared); reload afterwards. */
export async function writeSite(siteId: string, snapshot: SiteSnapshot, replaceProgress = true) {
  const db = shared();
  if (siteId === activeSiteId()) {
    Object.entries(DATA_DOCS).forEach(([key, name]) => {
      const raw = snapshot.docs[name];
      if (raw === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
    });
  } else if (db) {
    const by = getSharedUserId() ?? "";
    for (const name of Object.values(DATA_DOCS)) {
      const raw = snapshot.docs[name];
      const ref = db.doc(siteDocPath(name, siteId));
      if (raw === undefined) await ref.delete().catch(() => undefined);
      else await ref.set({ json: raw, updatedAt: Date.now(), by });
    }
  } else {
    const stash: Record<string, string> = {};
    Object.entries(DATA_DOCS).forEach(([key, name]) => {
      if (snapshot.docs[name] !== undefined) stash[key] = snapshot.docs[name];
    });
    stash[PROGRESS_LOCAL_KEY] = JSON.stringify(snapshot.progress);
    localStorage.setItem(STASH_PREFIX + siteId, JSON.stringify(stash));
  }
  if (!replaceProgress) return;
  if (db) {
    const collection = siteProgressCollection(siteId);
    const existing = await readCollectionOnce(collection);
    for (const id of Object.keys(existing)) {
      if (!snapshot.progress[id]) await db.doc(`${collection}/${id}`).delete().catch(() => undefined);
    }
    for (const [id, record] of Object.entries(snapshot.progress)) {
      await db.doc(`${collection}/${id}`).set(record as Record<string, unknown>);
    }
  } else if (siteId === activeSiteId()) {
    localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(snapshot.progress));
  }
}

export interface SiteStats {
  cables: number;
  percent: number;
  complete: number;
  measuredMetres: number;
}

export function statsFor(snapshot: SiteSnapshot): SiteStats {
  const cables = parse<CableRow[]>(snapshot.docs.schedule, []);
  const list = Array.isArray(cables) ? cables : [];
  let marks = 0;
  let complete = 0;
  list.forEach((cable) => {
    const record = snapshot.progress[progressDocId(cable.id)] ?? {};
    const done = PROGRESS_STAGES.filter((s) => record[s.key]).length;
    marks += done;
    if (done === PROGRESS_STAGES.length) complete += 1;
  });
  const measuredMetres = list.reduce((sum, c) => sum + (lengthInMetres(c.length ?? "") ?? 0), 0);
  return {
    cables: list.length,
    percent: list.length ? Math.round((marks / (list.length * PROGRESS_STAGES.length)) * 100) : 0,
    complete,
    measuredMetres: Math.round(measuredMetres),
  };
}

export async function buildBackup(siteId: string): Promise<SiteBackup> {
  const site = readRegistry().find((s) => s.id === siteId)!;
  const snapshot = await readSite(siteId);
  const data: Record<string, unknown> = {};
  Object.entries(snapshot.docs).forEach(([name, raw]) => {
    data[name] = parse(raw, null);
  });
  const plan = site.floorPlan?.chunks ? sitePlanUrl(site) : undefined;
  return {
    format: "multivrz-site-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    site,
    data,
    progress: snapshot.progress,
    ...(plan ? { floorPlanImage: plan } : {}),
  };
}

export function parseBackup(text: string): SiteBackup {
  const parsed = JSON.parse(text) as Partial<SiteBackup>;
  if (parsed.format !== "multivrz-site-backup" || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("This file isn't a MultiVRZ site backup");
  }
  return { progress: {}, ...parsed } as SiteBackup;
}

export function backupToSnapshot(backup: SiteBackup): SiteSnapshot {
  const docs: Record<string, string> = {};
  Object.entries(backup.data).forEach(([name, value]) => {
    if (value !== null && value !== undefined && Object.values(DATA_DOCS).includes(name)) docs[name] = JSON.stringify(value);
  });
  return { docs, progress: backup.progress ?? {} };
}

export { SITE_DATA_KEYS };

/** Open a site: share any waiting changes first, then reload into it. */
export async function openSite(siteId: string, path = "/") {
  await flushSharedChanges().catch(() => undefined);
  switchSite(siteId, path);
}
