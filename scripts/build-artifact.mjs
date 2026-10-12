// Builds the app as a static bundle for publishing as a claude.ai Artifact.
// npm packages are resolved to jsDelivr ESM builds (cached in .cdn-cache) and
// bundled in, with every React import pinned to a single version.
// Tailwind v4 CSS is compiled with the tailwindcss compiler API.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH || "esbuild");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "client", "src");
const OUT = path.join(ROOT, "dist-artifact");
const CACHE = path.join(ROOT, ".cdn-cache");
const VENDOR = process.env.VENDOR_DIR || path.join(ROOT, "..", "..", "vendor", "node_modules");
const CDN = "https://cdn.jsdelivr.net";

// Versions from pnpm-lock.yaml
const PIN = {
  react: "19.2.1",
  "react-dom": "19.2.1",
  scheduler: "0.27.0",
  wouter: "3.7.1",
  sonner: "2.0.7",
  "lucide-react": "0.453.0",
  "next-themes": "0.4.6",
  xlsx: "0.18.5",
  jspdf: "4.2.1",
  "tailwind-merge": "3.3.1",
  clsx: "2.1.1",
  "class-variance-authority": "0.7.1",
  "@radix-ui/react-dialog": "1.1.15",
  "@radix-ui/react-label": "2.1.7",
  "@radix-ui/react-select": "2.2.6",
  "@radix-ui/react-slot": "1.2.3",
  "@radix-ui/react-tabs": "1.1.13",
  "@radix-ui/react-tooltip": "1.2.8",
};

function splitSpec(spec) {
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  const sub = parts.slice(spec.startsWith("@") ? 2 : 1).join("/");
  return { name, sub };
}

// Rewrite any jsDelivr package path so React-family packages use one version.
function normalise(url) {
  return url.replace(
    /\/npm\/(react|react-dom|scheduler)@[^/]+\//,
    (_, name) => `/npm/${name}@${PIN[name]}/`
  );
}

async function fetchCached(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex") + ".js");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const text = await res.text();
  fs.writeFileSync(file, text);
  return text;
}

const cdnPlugin = {
  name: "jsdelivr",
  setup(build) {
    // Bare package imports from app source
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.namespace === "cdn") return; // handled below
      // LOCAL_PACKAGES=1 bundles the installed node_modules instead (same pinned versions, no CDN access needed).
      if (process.env.LOCAL_PACKAGES) return;
      if (args.path.startsWith("@/") || args.path.startsWith("@shared/") || args.path.startsWith("http")) return;
      const { name, sub } = splitSpec(args.path);
      const version = PIN[name];
      if (!version) return { errors: [{ text: `No pinned version for ${name}` }] };
      const url = `${CDN}/npm/${name}@${version}${sub ? "/" + sub : ""}/+esm`;
      return { path: normalise(url), namespace: "cdn" };
    });
    // Imports inside CDN modules ("/npm/..." or full URLs)
    build.onResolve({ filter: /.*/, namespace: "cdn" }, (args) => {
      const url = new URL(args.path, args.importer).toString();
      return { path: normalise(url), namespace: "cdn" };
    });
    build.onLoad({ filter: /.*/, namespace: "cdn" }, async (args) => ({
      contents: await fetchCached(args.path),
      loader: "js",
    }));
    // CSS is compiled separately; drop the JS-side import
    build.onResolve({ filter: /\.css$/ }, () => ({ path: "css", namespace: "empty" }));
    build.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  },
};

async function buildCss() {
  const { compile } = require(path.join(VENDOR, "tailwindcss", "dist", "lib.js"));
  const input = fs.readFileSync(path.join(SRC, "index.css"), "utf8");
  const compiler = await compile(input, {
    base: SRC,
    async loadStylesheet(id, base) {
      const map = {
        tailwindcss: path.join(VENDOR, "tailwindcss", "index.css"),
        "tailwindcss/preflight": path.join(VENDOR, "tailwindcss", "preflight.css"),
        "tailwindcss/theme": path.join(VENDOR, "tailwindcss", "theme.css"),
        "tailwindcss/utilities": path.join(VENDOR, "tailwindcss", "utilities.css"),
        "tw-animate-css": path.join(VENDOR, "tw-animate-css", "dist", "tw-animate.css"),
      };
      let file = map[id] || map[id.replace(/\.css$/, "")];
      if (!file && id.startsWith("./")) file = path.join(VENDOR, "tailwindcss", id);
      if (!file) file = path.resolve(base, id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, "utf8") };
    },
    async loadModule(id) {
      throw new Error(`Tailwind plugin/config not supported in this build: ${id}`);
    },
  });
  // Candidate scan: every token in the source files
  const candidates = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|jsx?|html)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        // Keep bracketed arbitrary values intact (e.g. grid-cols-[minmax(0,1fr)_22rem]),
        // and also add a finer split to catch classes next to punctuation.
        for (const t of text.split(/[\s"'`{}<>;\\]+/)) if (t) candidates.add(t);
        for (const t of text.split(/[\s"'`{}()<>;,\\]+/)) if (t) candidates.add(t);
      }
    }
  };
  walk(SRC);
  return compiler.build([...candidates]);
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(SRC, "main.tsx")],
    bundle: true,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    write: false,
    outfile: path.join(OUT, "app.js"),
    alias: { "@": SRC, "@shared": path.join(ROOT, "shared") },
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
    plugins: [cdnPlugin],
    logLevel: "warning",
  });
  const js = result.outputFiles[0].text;
  fs.writeFileSync(path.join(OUT, "app.js"), js);

  // Static assets (floor plans, logos) published alongside the page.
  const assetsDir = path.join(ROOT, "client", "public", "assets");
  if (fs.existsSync(assetsDir)) fs.cpSync(assetsDir, path.join(OUT, "assets"), { recursive: true });

  const css = await buildCss();
  fs.writeFileSync(path.join(OUT, "app.css"), css);

  // Page body (Artifact adds the document skeleton)
  const page = `<title>MultiVRZ Cable Schedule</title>
<meta name="theme-color" content="#0f172a" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="app.css" />
<div id="root"></div>
<script type="module" src="app.js"></script>
`;
  fs.writeFileSync(path.join(OUT, "index.html"), page);

  // Standalone preview for local testing
  fs.writeFileSync(
    path.join(OUT, "preview.html"),
    `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />${page}</head><body></body></html>`.replace(
      '<div id="root"></div>\n<script type="module" src="app.js"></script>\n</head><body>',
      '</head><body><div id="root"></div><script type="module" src="app.js"></script>'
    )
  );
  console.log(`app.js ${(js.length / 1024).toFixed(0)} KB, app.css ${(css.length / 1024).toFixed(0)} KB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
