/**
 * MultiVRZ Cable Schedule – standalone server (Railway or any Node host).
 * No dependencies: serves the built portal from ./public and a small shared
 * JSON document store at /api/db/* (the same data model as the claude.ai artifact).
 *
 * Environment:
 *   PORT          – port to listen on (Railway sets this)
 *   DATA_DIR      – where store.json is kept; mount a Railway volume here (default ./data)
 *   APP_USERS     – editors, "name:password,name2:password2" (HTTP Basic sign-in)
 *   APP_VIEWERS   – read-only users, same format (optional)
 *   If neither is set the site is open to anyone with the link (not recommended).
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(here, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(here, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SEED_FILE = path.join(here, "seed.json");
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 2 * 1024 * 1024;

// ── Users ───────────────────────────────────────────────────────────────────
function parseUsers(value, canWrite) {
  return (value || "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf(":");
      return { name: pair.slice(0, i).trim(), password: pair.slice(i + 1), canWrite };
    })
    .filter((u) => u.name && u.password);
}
const USERS = [...parseUsers(process.env.APP_USERS, true), ...parseUsers(process.env.APP_VIEWERS, false)];
const OPEN = USERS.length === 0;
if (OPEN) console.warn("APP_USERS is not set: the portal is open to anyone with the link.");

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function authenticate(req) {
  if (OPEN) return { id: "guest", name: "Guest", canWrite: true };
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return null;
  const [name, ...rest] = Buffer.from(header.slice(6), "base64").toString("utf8").split(":");
  const password = rest.join(":");
  const user = USERS.find((u) => u.name.toLowerCase() === (name || "").toLowerCase());
  if (!user || !safeEqual(user.password, password)) return null;
  return { id: `user:${user.name.toLowerCase()}`, name: user.name, canWrite: user.canWrite };
}

// ── Store ───────────────────────────────────────────────────────────────────
let store = { rev: 0, docs: {} };
function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(STORE_FILE)) {
    store = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
    console.log(`Loaded ${Object.keys(store.docs).length} documents from ${STORE_FILE}`);
  } else if (fs.existsSync(SEED_FILE)) {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    store = { rev: 1, docs: seed.docs || {} };
    save();
    console.log(`Seeded ${Object.keys(store.docs).length} documents from seed.json`);
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, STORE_FILE);
  }, 200);
}
const validPath = (p) => typeof p === "string" && /^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)*$/.test(p) && p.length < 1000;

// ── HTTP helpers ────────────────────────────────────────────────────────────
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) {
        reject(e);
      }
    });
  });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".json": "application/json", ".ico": "image/x-icon" };

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 400, { error: "bad path" });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, "index.html");
  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
  });
  fs.createReadStream(file).pipe(res);
}

// ── Server ──────────────────────────────────────────────────────────────────
load();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") return send(res, 200, { ok: true });

    const user = authenticate(req);
    if (!user) {
      res.writeHead(401, { "WWW-Authenticate": 'Basic realm="MultiVRZ Cable Schedule", charset="UTF-8"', "Content-Type": "text/plain" });
      return res.end("Sign in required");
    }

    if (!url.pathname.startsWith("/api/db/")) return serveStatic(req, res, url.pathname);

    try {
      const route = url.pathname.slice("/api/db/".length);
      const p = url.searchParams.get("path");

      if (route === "health") return send(res, 200, { ok: true, user });
      if (route === "rev") return send(res, 200, { rev: store.rev });
      if (route === "profiles" && req.method === "POST") {
        const { ids = [] } = await readBody(req);
        const names = {};
        ids.forEach((id) => {
          const match = USERS.find((u) => `user:${u.name.toLowerCase()}` === id);
          names[id] = match ? match.name : id === "guest" ? "Guest" : "";
        });
        return send(res, 200, { names });
      }

      if (!validPath(p)) return send(res, 400, { error: "invalid path" });

      if (route === "collection" && req.method === "GET") {
        const prefix = `${p}/`;
        const depth = p.split("/").length + 1;
        const docs = Object.entries(store.docs)
          .filter(([k]) => k.startsWith(prefix) && k.split("/").length === depth)
          .map(([k, v]) => ({ id: k.slice(prefix.length), data: v.data }));
        return send(res, 200, { docs });
      }

      if (route === "doc") {
        if (req.method === "GET") {
          const doc = store.docs[p];
          return send(res, 200, doc ? { exists: true, data: doc.data, version: doc.version } : { exists: false });
        }
        if (!user.canWrite) return send(res, 403, { error: "read only" });
        if (req.method === "PUT" || req.method === "PATCH") {
          const { data } = await readBody(req);
          if (!data || typeof data !== "object") return send(res, 400, { error: "data required" });
          const prev = store.docs[p];
          const next = req.method === "PATCH" && prev ? { ...prev.data, ...data } : data;
          store.docs[p] = { data: next, version: (prev?.version || 0) + 1, updatedAt: Date.now(), by: user.id };
          store.rev += 1;
          save();
          return send(res, 200, { ok: true, version: store.docs[p].version });
        }
        if (req.method === "DELETE") {
          if (store.docs[p]) {
            delete store.docs[p];
            store.rev += 1;
            save();
          }
          return send(res, 200, { ok: true });
        }
      }
      return send(res, 404, { error: "not found" });
    } catch (error) {
      return send(res, 500, { error: String(error?.message || error) });
    }
  })
  .listen(PORT, () => console.log(`MultiVRZ Cable Schedule listening on :${PORT}`));
