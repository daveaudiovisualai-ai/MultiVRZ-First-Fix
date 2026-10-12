// Generates the dark-theme overrides in client/src/index.css (between the
// "dark theme:generated" markers). The page components use plain Tailwind
// palette classes (bg-white, text-slate-700, bg-cyan-50, …) designed for a
// white page, so instead of editing every component this remaps the light
// shades to dark equivalents on screen. Print keeps the original light look.
//
// Panels that were already dark (nav bar, rack, page heroes) set --dk: 0 so
// text inside them keeps its original colour; light panels set --dk: 1.
//
//   node scripts/gen-dark-theme.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CSS = path.join(ROOT, "client", "src", "index.css");
const THEME = path.join(ROOT, "node_modules", "tailwindcss", "theme.css");

const palette = {};
for (const m of fs.readFileSync(THEME, "utf8").matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
  (palette[m[1]] ||= {})[m[2]] = m[3].trim();
}
const NEUTRAL = ["slate", "gray", "zinc", "neutral", "stone"];
// Only palette families the client code actually uses (re-run after adding one)
const used = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name))
      for (const m of fs.readFileSync(p, "utf8").matchAll(/-([a-z]+)-\d{2,3}\b/g)) used.add(m[1]);
  }
};
walk(path.join(ROOT, "client", "src"));
const families = Object.keys(palette).filter((f) => used.has(f) || f === "slate");
const c = (f, s) => palette[f][s];
const mix = (a, pct, b) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
const SURFACE = c("slate", "900");

// Light background shade -> dark background
const bgMap = (f, s) =>
  NEUTRAL.includes(f)
    ? { 50: mix(c(f, "950"), 45, c(f, "900")), 100: c(f, "800"), 200: c(f, "700"), 300: c(f, "600") }[s]
    : { 50: mix(c(f, "500"), 12, SURFACE), 100: mix(c(f, "500"), 18, SURFACE), 200: mix(c(f, "500"), 28, SURFACE), 300: mix(c(f, "500"), 40, SURFACE) }[s];
// Dark text shade -> light text
const textMap = (f, s) =>
  NEUTRAL.includes(f)
    ? { 500: c(f, "400"), 600: c(f, "400"), 700: c(f, "300"), 800: c(f, "200"), 900: c(f, "100"), 950: c(f, "50") }[s]
    : { 600: c(f, "400"), 700: c(f, "300"), 800: c(f, "200"), 900: c(f, "200"), 950: c(f, "100") }[s];
// Light border shade -> dark border
const borderMap = (f, s) =>
  NEUTRAL.includes(f)
    ? { 50: c(f, "800"), 100: c(f, "800"), 200: c(f, "700"), 300: c(f, "600") }[s]
    : { 50: mix(c(f, "500"), 25, SURFACE), 100: mix(c(f, "500"), 25, SURFACE), 200: mix(c(f, "500"), 35, SURFACE), 300: mix(c(f, "500"), 50, SURFACE) }[s];

const esc = (cls) => cls.replace(/[:/#[\]]/g, (ch) => "\\" + ch);
const withAlpha = (v, a) => (a ? mix(v, a, "transparent") : v);
// Text follows the surrounding panel: original colour inside already-dark panels.
const ctx = (light, orig) => `color-mix(in oklab, ${light} calc(var(--dk, 1) * 100%), ${orig})`;

const lines = [];
const rule = (sel, decl) => lines.push(`  ${sel} { ${decl} }`);
const vars = [];
const def = (name, value) => (vars.push(`    --${name}: ${value};`), `var(--${name})`);

// Light surfaces (become dark, text inside them turns light)
const lightSurfaces = [".bg-white", ".bg-white\\/80", ".bg-white\\/90", ".bg-white\\/95", ".bg-\\[\\#edf2f7\\]", ".bg-\\[\\#eef3f7\\]", ".bg-\\[\\#f8f8f7\\]"];
for (const f of families) for (const s of ["50", "100", "200", "300"]) lightSurfaces.push(`.bg-${f}-${s}`);
// Panels that were already dark (keep their original text colours)
const darkSurfaces = ['[class^="bg-black"]', '[class*=" bg-black"]', ".bg-\\[\\#1a1a19\\]", '[class*="bg-[linear-gradient(135deg,#0b1220"]'];
for (const f of families)
  for (const s of ["7", "8", "9"]) darkSurfaces.push(`[class^="bg-${f}-${s}"]`, `[class*=" bg-${f}-${s}"]`);

rule(lightSurfaces.join(", "), "--dk: 1;");
rule(darkSurfaces.join(", "), "--dk: 0;");

const bg = (cls, v, alphas) => {
  for (const a of ["", ...alphas]) {
    const sfx = a ? `/${a}` : "";
    rule(`.${esc(`${cls}${sfx}`)}, .${esc(`hover:${cls}${sfx}`)}:hover`, `background-color: ${withAlpha(v, a)};`);
  }
};
bg("bg-white", def("dk-white", SURFACE), ["80", "90", "95"]);
rule(".bg-\\[\\#edf2f7\\], .bg-\\[\\#eef3f7\\]", `background-color: ${c("slate", "950")};`);
rule(".bg-\\[\\#f8f8f7\\]", `background-color: ${SURFACE};`);
for (const f of families) {
  for (const s of ["50", "100", "200", "300"]) {
    bg(`bg-${f}-${s}`, def(`dk-bg-${f}-${s}`, bgMap(f, s)), s === "50" ? ["30", "40", "50", "60", "70"] : []);
    const b = def(`dk-border-${f}-${s}`, borderMap(f, s));
    const orig = def(`dk-orig-${f}-${s}`, c(f, s));
    rule(`.${esc(`border-${f}-${s}`)}, .${esc(`hover:border-${f}-${s}`)}:hover`, `border-color: ${ctx(b, orig)};`);
    rule(`.${esc(`divide-${f}-${s}`)} > :not(:last-child)`, `border-color: ${b};`);
  }
  for (const s of Object.keys(palette[f])) {
    const v = textMap(f, s);
    if (!v) continue;
    const t = def(`dk-text-${f}-${s}`, v);
    const orig = def(`dk-orig-${f}-${s}`, c(f, s));
    rule(`.${esc(`text-${f}-${s}`)}, .${esc(`hover:text-${f}-${s}`)}:hover`, `color: ${ctx(t, orig)};`);
  }
}
rule(".text-black", `color: ${ctx(c("slate", "50"), "#000")};`);
lines.unshift("@layer utilities {", "@media screen {", "  :root {", ...vars, "  }");
lines.push("}", "}");

const block = lines.join("\n");
const START = "/* dark theme:generated start (scripts/gen-dark-theme.mjs) */";
const END = "/* dark theme:generated end */";
const css = fs.readFileSync(CSS, "utf8");
const re = new RegExp(`${START.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`);
const next = re.test(css) ? css.replace(re, `${START}\n${block}\n${END}`) : `${css.trimEnd()}\n\n${START}\n${block}\n${END}\n`;
fs.writeFileSync(CSS, next);
console.log(`dark theme: ${lines.length} lines written to client/src/index.css`);
