/**
 * Shared storage. The app keeps its working data in localStorage; on the hosted
 * page this module mirrors selected keys to the artifact's shared database so
 * everyone the page is shared with (e.g. a contractor) sees the same schedule,
 * drop positions, power points and sign-offs. Without the database (local
 * preview, view-only access) the app simply stays on this device.
 */

import { prepareLocalSite, REGISTRY_STORAGE_KEY, siteDocPath } from "./sites";

type Unsubscribe = () => void;
type DocSnap = { exists: boolean; data(): Record<string, unknown> | undefined; metadata?: { hasPendingWrites: boolean } };
type DocRef = {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  update(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  onSnapshot(next: (snap: DocSnap) => void, error?: (err: { code: string }) => void): Unsubscribe;
};
type QuerySnap = { docs: { id: string; exists: boolean; data(): Record<string, unknown> | undefined }[] };
type CollectionRef = {
  doc(id: string): DocRef;
  onSnapshot(next: (snap: QuerySnap) => void, error?: (err: { code: string }) => void): Unsubscribe;
};
export type SharedDb = { doc(path: string): DocRef; collection(path: string): CollectionRef };
type UserApi = {
  id(): Promise<string | null>;
  can(name: string): Promise<boolean | null>;
  profiles(ids: readonly string[]): Promise<Record<string, { id: string; name: string; isMe: boolean }>>;
};
type ClaudeRuntime = { use(name: string): Promise<unknown> };

/** localStorage key -> shared document id within the open site (see siteDocPath). */
const SYNCED_KEYS: Record<string, string> = {
  [REGISTRY_STORAGE_KEY]: "sites",
  multivrz_o2_cable_schedule_v4: "schedule",
  multivrz_o2_cable_schedule_site_v2: "site",
  multivrz_destination_drops_o2_v1: "drops",
  multivrz_power_points_o2_v1: "power",
  av_panel_signoffs_v2: "signoffs",
  multivrz_consumables_o2_v3: "consumables",
};

const MAX_DOC_CHARS = 240_000;

/** Shared path for a synced key: the site library is global, everything else belongs to the open site. */
function pathFor(key: string) {
  const docId = SYNCED_KEYS[key];
  return key === REGISTRY_STORAGE_KEY ? "app/sites" : siteDocPath(docId);
}
export const SHARED_REMOTE_EVENT = "multivrz-shared-remote-change";
export const SHARED_STATUS_EVENT = "multivrz-shared-status";

export type SharedStatus = "local" | "connecting" | "shared" | "read-only";

let db: SharedDb | null = null;
let user: UserApi | null = null;
let userId: string | null = null;
let status: SharedStatus = "local";
let applyingRemote = false;
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function setStatus(next: SharedStatus) {
  status = next;
  window.dispatchEvent(new CustomEvent(SHARED_STATUS_EVENT, { detail: next }));
}

export function getSharedStatus() {
  return status;
}
export function getSharedDb() {
  return db;
}
export function getSharedUser() {
  return user;
}
export function getSharedUserId() {
  return userId;
}

function runtime(): ClaudeRuntime | null {
  const claude = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return claude?.use ? claude : null;
}

/** Drawings uploaded as data URLs can be too large to share; keep them on this device. */
function shareableValue(docId: string, raw: string): string | null {
  if (docId === "drops" && raw.length > MAX_DOC_CHARS) {
    try {
      const parsed = JSON.parse(raw);
      delete parsed.drawing;
      const slim = JSON.stringify(parsed);
      return slim.length <= MAX_DOC_CHARS ? slim : null;
    } catch {
      return null;
    }
  }
  return raw.length <= MAX_DOC_CHARS ? raw : null;
}

async function pushNow(key: string) {
  const docId = SYNCED_KEYS[key];
  if (!db || !docId || status === "read-only") return;
  const raw = localStorage.getItem(key);
  try {
    if (raw === null) {
      await db.doc(pathFor(key)).delete();
      return;
    }
    const value = shareableValue(docId, raw);
    if (value === null) return;
    await db.doc(pathFor(key)).set({ json: value, updatedAt: Date.now(), by: userId ?? "" });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "invalid_argument" || code === "not_granted" || code === "revoked") setStatus("read-only");
  }
}

function schedulePush(key: string) {
  const docId = SYNCED_KEYS[key];
  if (!db || !docId || status === "read-only") return;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  pending.set(
    key,
    setTimeout(async () => {
      pending.delete(key);
      await pushNow(key);
    }, 700)
  );
}

/** Send any changes still waiting to be shared (before switching site or reloading). */
export async function flushSharedChanges() {
  const keys = Array.from(pending.keys());
  keys.forEach((key) => {
    clearTimeout(pending.get(key)!);
    pending.delete(key);
  });
  await Promise.all(keys.map((key) => pushNow(key)));
}

function patchStorage() {
  const proto = Storage.prototype;
  const originalSet = proto.setItem;
  const originalRemove = proto.removeItem;
  proto.setItem = function (key: string, value: string) {
    const previous = this === localStorage ? localStorage.getItem(key) : null;
    originalSet.call(this, key, value);
    if (this === localStorage && !applyingRemote && SYNCED_KEYS[key] && previous !== value) schedulePush(key);
  };
  proto.removeItem = function (key: string) {
    originalRemove.call(this, key);
    if (this === localStorage && !applyingRemote && SYNCED_KEYS[key]) schedulePush(key);
  };
}

function applyRemote(key: string, json: string) {
  if (localStorage.getItem(key) === json) return false;
  applyingRemote = true;
  try {
    localStorage.setItem(key, json);
  } finally {
    applyingRemote = false;
  }
  return true;
}

/** Tell the app to re-read storage, waiting until nobody is typing. */
let notifyQueued = false;
function notifyRemoteChange() {
  if (notifyQueued) return;
  notifyQueued = true;
  const fire = () => {
    notifyQueued = false;
    window.dispatchEvent(new Event(SHARED_REMOTE_EVENT));
  };
  const active = document.activeElement;
  const typing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
  if (typing) {
    active!.addEventListener("blur", () => setTimeout(fire, 50), { once: true });
  } else {
    setTimeout(fire, 150);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

/**
 * Connect to the shared store before the app first renders. Resolves quickly
 * (and harmlessly) when no shared store is available.
 */
export async function initSharedSync(): Promise<void> {
  // Make sure this browser's working keys belong to the open site.
  prepareLocalSite((key, value) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  });
  const claude = runtime();
  if (!claude) return;
  setStatus("connecting");
  const [dbNs, userNs] = await withTimeout(
    Promise.all([claude.use("db").catch(() => null), claude.use("user").catch(() => null)]),
    6000,
    [null, null] as [unknown, unknown]
  );
  db = (dbNs as SharedDb) ?? null;
  user = (userNs as UserApi) ?? null;
  if (!db) {
    setStatus("local");
    return;
  }
  userId = user ? await user.id().catch(() => null) : null;
  const canWrite = user ? await user.can("data.write").catch(() => null) : null;

  // First load: take the shared copy; seed the store from this device if a document is missing.
  const entries = Object.entries(SYNCED_KEYS);
  const snaps = await withTimeout(
    Promise.all(entries.map(([key]) => db!.doc(pathFor(key)).get().catch(() => null))),
    6000,
    entries.map(() => null)
  );
  entries.forEach(([key], index) => {
    const snap = snaps[index];
    const json = snap?.exists ? (snap.data()?.json as string | undefined) : undefined;
    if (typeof json === "string") applyRemote(key, json);
  });

  setStatus(canWrite === false ? "read-only" : "shared");
  patchStorage();

  entries.forEach(([key], index) => {
    const snap = snaps[index];
    if (!snap?.exists && localStorage.getItem(key) !== null) schedulePush(key);
  });

  // Live updates from other people.
  entries.forEach(([key]) => {
    db!.doc(pathFor(key)).onSnapshot(
      (snap) => {
        if (snap.metadata?.hasPendingWrites) return;
        const json = snap.exists ? (snap.data()?.json as string | undefined) : undefined;
        if (typeof json === "string" && !pending.has(key) && applyRemote(key, json)) notifyRemoteChange();
      },
      () => undefined
    );
  });
}
