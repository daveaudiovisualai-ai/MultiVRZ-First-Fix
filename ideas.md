# AV Cable Schedule — Design Ideas

## Idea 1 — Industrial Technical Blueprint

**Design Movement:** Industrial / Technical Documentation
**Core Principles:**
- Precision-first: every element earns its place through function
- High information density without visual noise
- Monochromatic base with a single high-visibility accent
- Feels like professional AV/broadcast rack documentation

**Color Philosophy:** Dark charcoal background (#1a1f2e) with crisp white text, electric amber (#f59e0b) as the sole accent for interactive elements and status indicators. Evokes broadcast control rooms and rack documentation.

**Layout Paradigm:** Full-width table dominates the viewport. Site details live in a compact top bar. Toolbar (search, filter, export) sits as a sticky sub-header. No sidebars — all space goes to the data.

**Signature Elements:**
- Monospace font for cable numbers and technical values
- Thin amber rule lines separating header from table
- Row hover with a subtle left-border flash in amber

**Interaction Philosophy:** Inline cell editing — click any cell to edit in place. No modal dialogs. Fast keyboard navigation between cells.

**Animation:** Minimal — row highlight on hover (150ms), cell focus ring on edit, smooth row addition.

**Typography System:** `JetBrains Mono` for data cells, `IBM Plex Sans` for UI chrome and labels.

---

## Idea 2 — Clean Professional Dashboard

**Design Movement:** Modern SaaS / Enterprise Tool
**Core Principles:**
- Light, airy feel with strong typographic hierarchy
- Structured card-based layout
- Blue as the primary brand colour — trustworthy, professional
- Optimised for quick scanning on tablet/mobile on site

**Color Philosophy:** White background, slate-grey text, vivid blue (#2563eb) for primary actions and headers. Status badges use semantic traffic-light colours (green/amber/red).

**Layout Paradigm:** Sticky header with site details form, below it a full-width scrollable table with frozen first column (cable number). Toolbar floats above the table.

**Signature Elements:**
- Coloured status badge pills
- Alternating row shading for readability
- Sticky column for cable number

**Interaction Philosophy:** Click-to-edit cells with visible save state. Add/remove row buttons. Bulk status update.

**Animation:** Subtle row slide-in on add, badge colour transition on status change.

**Typography System:** `Barlow` semi-condensed for headers, `Inter` for body/data.

---

## Idea 3 — Field-Ready Utility Tool

**Design Movement:** Utilitarian / High-Contrast Field Tool
**Core Principles:**
- Maximum legibility in bright outdoor / warehouse conditions
- Large touch targets for gloved hands / tablet use
- Stark contrast — near-black on white
- Zero decoration, pure function

**Color Philosophy:** Pure white (#ffffff) background, near-black (#111827) text, vivid teal (#0d9488) for primary actions. High contrast for outdoor readability.

**Layout Paradigm:** Compact sticky header for site details. Full-width table with generous row height. Each row is a touch-friendly target.

**Signature Elements:**
- Extra-tall rows (48px minimum) for touch accuracy
- Large, clearly labelled action buttons
- Colour-coded cable type column

**Interaction Philosophy:** Large tap targets, minimal clicks to edit, auto-save on blur.

**Animation:** None — prioritise performance and clarity.

**Typography System:** `Roboto Condensed` for data, `Roboto` for UI.
