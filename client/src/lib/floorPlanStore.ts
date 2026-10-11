/**
 * Floor plans for sites other than Karrinyup. The image is reduced in the
 * browser and kept in the shared store in chunks (sites/<id>/plan/c0, c1, …),
 * with a copy on this device so the plan pages can draw it straight away.
 */
import { getSharedDb, getSharedStatus, SHARED_REMOTE_EVENT } from "./sharedSync";
import { activeSite, readRegistry, type SiteRecord } from "./sites";

const CHUNK = 200_000;
const cacheKey = (siteId: string) => `multivrz_site_plan_${siteId}`;

interface CachedPlan {
  version: string;
  dataUrl: string;
}

function readCache(siteId: string): CachedPlan | null {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(siteId)) || "null");
  } catch {
    return null;
  }
}

function writeCache(siteId: string, plan: CachedPlan) {
  try {
    localStorage.setItem(cacheKey(siteId), JSON.stringify(plan));
  } catch {
    /* quota: the plan will be fetched again next time */
  }
}

/** Image source for a site's plan, or undefined while it hasn't arrived on this device. */
export function sitePlanUrl(site: SiteRecord): string | undefined {
  const plan = site.floorPlan;
  if (!plan) return undefined;
  if (!plan.chunks) return plan.url || undefined;
  const cached = readCache(site.id);
  return cached && cached.version === plan.version ? cached.dataUrl : undefined;
}

/** Shrink an image file to a JPEG data URL that fits the shared store comfortably. */
export async function reduceImage(file: File, maxSide = 2600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image could not be read"));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.85;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > 1_400_000 && quality > 0.45) {
      quality -= 0.1;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Store a plan for a site; returns the floorPlan value to put on the site record. */
export async function storeSitePlan(siteId: string, dataUrl: string, fileName: string): Promise<NonNullable<SiteRecord["floorPlan"]>> {
  const version = Date.now().toString(36);
  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += CHUNK) chunks.push(dataUrl.slice(i, i + CHUNK));
  const db = getSharedDb();
  if (db && getSharedStatus() === "shared") {
    for (let i = 0; i < chunks.length; i += 1) {
      await db.doc(`sites/${siteId}/plan/c${i}`).set({ data: chunks[i], version, index: i, total: chunks.length });
    }
  }
  writeCache(siteId, { version, dataUrl });
  return { url: "", fileName, chunks: chunks.length, version };
}

/** Copy a plan between sites (used when a new site starts from another site's plan). */
export async function copySitePlan(from: SiteRecord, toId: string) {
  const url = sitePlanUrl(from);
  if (!from.floorPlan) return undefined;
  if (!from.floorPlan.chunks) return { ...from.floorPlan };
  return url ? storeSitePlan(toId, url, from.floorPlan.fileName) : undefined;
}

let fetching = false;
/** Make sure the open site's plan is on this device; re-render once it arrives. */
export async function ensureActiveSitePlan() {
  const site = activeSite();
  const plan = site.floorPlan;
  if (!plan?.chunks || sitePlanUrl(site) || fetching) return;
  const db = getSharedDb();
  if (!db) return;
  fetching = true;
  try {
    const parts = await Promise.all(
      Array.from({ length: plan.chunks }, (_, i) => db.doc(`sites/${site.id}/plan/c${i}`).get())
    );
    const data = parts.map((snap) => (snap.exists ? (snap.data() as { data?: string; version?: string }) : undefined));
    if (data.some((d) => !d?.data || d.version !== plan.version)) return;
    writeCache(site.id, { version: plan.version!, dataUrl: data.map((d) => d!.data).join("") });
    // Drop cached plans of other sites to keep this device's storage small.
    const keep = new Set(readRegistry().map((s) => s.id));
    Object.keys(localStorage)
      .filter((k) => k.startsWith("multivrz_site_plan_") && !keep.has(k.slice("multivrz_site_plan_".length)))
      .forEach((k) => localStorage.removeItem(k));
    window.dispatchEvent(new Event(SHARED_REMOTE_EVENT));
  } catch {
    /* try again on the next change */
  } finally {
    fetching = false;
  }
}
