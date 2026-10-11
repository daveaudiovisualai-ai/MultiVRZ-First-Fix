/*
 * shareReport — encode/decode a SiteReportData into a URL hash fragment
 * so the report can be shared as a read-only link with no server required.
 *
 * Strategy:
 *  - Strip photo dataUrls (too large for a URL) — photos are excluded from share
 *  - JSON stringify → compress with CompressionStream (deflate-raw) → base64url
 *  - Decode: base64url → DecompressionStream → JSON parse
 *
 * The hash is stored as: #report=<base64url>
 * Falls back to plain base64 JSON if CompressionStream is unavailable.
 */
import type { SiteReportData } from "./reportTypes";

const HASH_PREFIX = "report=";

/** Strip photo data URLs before encoding (keeps captions/timestamps) */
function stripPhotos(report: SiteReportData): SiteReportData {
  return {
    ...report,
    photos: report.photos.map((p) => ({ ...p, dataUrl: "" })),
    // Also strip signature images to keep URL short
    engineerSignature: report.engineerSignature.startsWith("data:") ? "[signature]" : report.engineerSignature,
    clientSignature:   report.clientSignature.startsWith("data:")   ? "[signature]" : report.clientSignature,
  };
}

async function compress(str: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data    = encoder.encode(str);
    const cs      = new CompressionStream("deflate-raw");
    const writer  = cs.writable.getWriter();
    writer.write(data);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out   = new Uint8Array(total);
    let offset  = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    // base64url encode
    return btoa(Array.from(out).map((b) => String.fromCharCode(b)).join(""))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    // Fallback: plain base64
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
}

async function decompress(encoded: string): Promise<string> {
  // Restore base64 padding
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
    const bytes  = new Uint8Array(Array.from(binary, (c) => c.charCodeAt(0)));

  try {
    const ds     = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out   = new Uint8Array(total);
    let offset  = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return new TextDecoder().decode(out);
  } catch {
    // Fallback: plain base64
    return decodeURIComponent(escape(atob(padded)));
  }
}

export async function encodeReportToHash(report: SiteReportData): Promise<string> {
  const stripped = stripPhotos(report);
  const json     = JSON.stringify(stripped);
  const encoded  = await compress(json);
  return `${HASH_PREFIX}${encoded}`;
}

export async function decodeReportFromHash(hash: string): Promise<SiteReportData | null> {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    if (!raw.startsWith(HASH_PREFIX)) return null;
    const encoded = raw.slice(HASH_PREFIX.length);
    const json    = await decompress(encoded);
    return JSON.parse(json) as SiteReportData;
  } catch {
    return null;
  }
}

export function buildShareUrl(hash: string): string {
  const base = `${window.location.origin}${window.location.pathname}#${hash}`;
  // Point to the shared-report route
  return base.replace(/#(?!report=)/, "") + (base.includes("?") ? "&" : "?") + "view=shared#" + hash;
}

/** Simpler: just use hash on the /site-report route */
export function buildShareUrlSimple(hash: string): string {
  const origin = window.location.origin;
  return `${origin}/site-report#${hash}`;
}
