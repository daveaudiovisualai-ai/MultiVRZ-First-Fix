/**
 * When the portal runs on its own server (e.g. Railway) rather than as a
 * claude.ai artifact, there is no window.claude. This shim provides the same
 * "db" and "user" API on top of the server's /api/db endpoints, so shared
 * data, live updates and progress tracking work exactly as on claude.ai.
 */

type Json = Record<string, unknown>;
type Listener = () => void;

const POLL_MS = 2500;
let revision = -1;
const listeners = new Set<Listener>();

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error("not allowed"), { code: "not_granted" });
  if (!res.ok) throw Object.assign(new Error(`server error ${res.status}`), { code: "unavailable" });
  return res.json();
}

const q = (path: string) => encodeURIComponent(path);

function startPolling() {
  const tick = async () => {
    try {
      const { rev } = await api("GET", "/api/db/rev");
      if (rev !== revision) {
        revision = rev;
        listeners.forEach((fn) => fn());
      }
    } catch {
      /* offline: try again */
    }
  };
  void tick();
  setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
}

function docSnap(data: Json | null, id: string) {
  return { id, exists: data !== null, data: () => (data === null ? undefined : data), metadata: { hasPendingWrites: false } };
}

function docRef(path: string) {
  const id = path.split("/").pop() ?? path;
  const get = async () => {
    const r = await api("GET", `/api/db/doc?path=${q(path)}`);
    return docSnap(r.exists ? (r.data as Json) : null, id);
  };
  const notifyAfterWrite = () => {
    // Our own writes bump the server revision; refresh listeners promptly.
    setTimeout(() => listeners.forEach((fn) => fn()), 50);
  };
  return {
    get,
    set: async (data: Json) => {
      await api("PUT", `/api/db/doc?path=${q(path)}`, { data });
      notifyAfterWrite();
    },
    update: async (data: Json) => {
      await api("PATCH", `/api/db/doc?path=${q(path)}`, { data });
      notifyAfterWrite();
    },
    delete: async () => {
      await api("DELETE", `/api/db/doc?path=${q(path)}`);
      notifyAfterWrite();
    },
    onSnapshot(next: (snap: ReturnType<typeof docSnap>) => void, error?: (err: { code: string }) => void) {
      let last = "\u0000";
      const run = () =>
        get()
          .then((snap) => {
            const key = JSON.stringify(snap.data() ?? null);
            if (key === last) return;
            last = key;
            next(snap);
          })
          .catch((e) => error?.({ code: e?.code ?? "unavailable" }));
      listeners.add(run);
      void run();
      return () => listeners.delete(run);
    },
  };
}

function collectionRef(path: string) {
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    onSnapshot(next: (snap: { docs: ReturnType<typeof docSnap>[] }) => void, error?: (err: { code: string }) => void) {
      let last = "\u0000";
      const run = () =>
        api("GET", `/api/db/collection?path=${q(path)}`)
          .then((r: { docs: { id: string; data: Json }[] }) => {
            const key = JSON.stringify(r.docs);
            if (key === last) return;
            last = key;
            next({ docs: r.docs.map((d) => docSnap(d.data, d.id)) });
          })
          .catch((e) => error?.({ code: e?.code ?? "unavailable" }));
      listeners.add(run);
      void run();
      return () => listeners.delete(run);
    },
  };
}

/** Install window.claude backed by this site's own server, if it has the data API. */
export async function installServerShim(): Promise<boolean> {
  const w = window as unknown as { claude?: unknown };
  if (w.claude) return false;
  let me: { id: string; name: string; canWrite: boolean };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/db/health", { signal: controller.signal, credentials: "same-origin" });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = await res.json();
    if (!body?.ok) return false;
    me = body.user;
  } catch {
    return false;
  }

  const db = { doc: docRef, collection: collectionRef };
  const user = {
    id: async () => me.id,
    can: async (name: string) => (name === "data.write" ? me.canWrite : true),
    me: async () => ({ id: me.id, name: me.name, isMe: true }),
    profiles: async (ids: readonly string[]) => {
      try {
        const r = await api("POST", "/api/db/profiles", { ids });
        const out: Record<string, { id: string; name: string; isMe: boolean }> = {};
        ids.forEach((id) => (out[id] = { id, name: r.names?.[id] || "", isMe: id === me.id }));
        return out;
      } catch {
        return Object.fromEntries(ids.map((id) => [id, { id, name: "", isMe: id === me.id }]));
      }
    },
  };
  w.claude = {
    use: async (name: string) => (name === "db" ? db : name === "user" ? user : null),
  };
  startPolling();
  return true;
}
