# MultiVRZ AV Cable Schedule — AI Handover

## Live working site

- **Cable Schedule:** https://avcablesch-7s7rlkhz.manus.space/
- **Connection Rack:** https://avcablesch-7s7rlkhz.manus.space/connection-rack
- **Destination Drops:** https://avcablesch-7s7rlkhz.manus.space/destination-drops
- **Consumables:** https://avcablesch-7s7rlkhz.manus.space/consumables
- **Project-aware builder:** https://avcablesch-7s7rlkhz.manus.space/build

The live site is the current deployed version and can be inspected in a browser. It is a client-side React application, so the URL alone does **not** give another AI access to the source code or Manus project workspace.

## Project

- **Name:** MultiVRZ AV Cable Schedule
- **Purpose:** Professional AV cable scheduling, rack planning, destination-drop planning, consumables calculation and contractor-ready exports.
- **Current project seed:** Karrinyup / O2-style schedule.
- **Default schedule:** 183 cables, sequential cable numbers 1001–1183, consolidated 24-port patch panels, Hive Player routes, no spare/contingency entries.
- **Default details:**
  - Job number: Karrinyup
  - Date: 2026-08-31
  - Client: Multivrz
  - Engineer: Billy Garbett
  - Patch/rack location: 47u Rack A

## Current features

### Cable Schedule

- Editable cable schedule with desktop table and mobile card view.
- Mobile swipe right marks a cable Installed; swipe left marks it Fault.
- Search, status filtering and patch-panel filtering.
- Add one or multiple rows.
- Bulk status changes.
- Reset to Pending and Clear Data actions.
- Cable-type colour coding.
- Panel Summary with 24-port capacity, status counts, spare capacity and engineer sign-off.
- **Export Excel** from the main Cable Schedule toolbar.
- **Export PDF** from the main Cable Schedule toolbar.
- Print View.
- Local browser persistence.
- PWA manifest and service worker for mobile installation/offline fallback.

### Connection Rack

- Interactive 12U rack representation.
- Rack plan derived from cable schedule data.
- Network patch-panel provisioning.
- U3 hybrid panel configuration with SpeakON, 5-pin XLR DMX, blank XLR positions and fibre feedthrough provision.
- U2 identified as lighting.
- Samsung LED fibre provision currently represented as two pre-made 75m LC–LC assemblies, based on the supplied crib sheet.
- Parts/consumables register derived from the rack plan.

### Destination Drops

- Cable-drop view based on the supplied `MultiverseAVCableDropsv6.pdf` drawing.
- PDF drawing displayed in a viewable window.
- Interactive drop markers can be selected.
- Selected drops show cable details and GOP type / endpoint information where available.
- Supports uploading a replacement PDF or drawing.
- DWG support is currently a future enhancement; browser-native PDF viewing is implemented.

### Consumables

- Rebuilt from specified Excel Networking product links.
- Recommended items and additional orders.
- Product links, quantities, categories, suppliers/specifications and notes.
- Network remote-end GOP allocation.
- Network keystone and patch-panel calculations.
- Van Damme speaker/DMX assumptions.
- Speaker assumptions include 1.5mm installation cable for pendants and 2.5mm speaker cable for subs.
- Samsung fibre provision included as two 75m assemblies.
- Mobile card view and export support.

### DAVE AV Operations integration

- `/build` accepts project-aware query parameters from the DAVE AV Preparation gate.
- Supported values include project ID, project name, address, job number, client, engineer and return URL.
- User can build a new 24-row schedule, import Excel/CSV or continue a saved project draft.
- Drafts are stored per project in browser localStorage.
- Contractor-ready validation requires at least one complete cable row and no unresolved Fault entries.
- Completion sends a restricted `DAVE_CABLE_SCHEDULE_READY` postMessage to the return URL origin and navigates back with status parameters.
- This is phase-one handoff only. There is no shared backend record update or automatic attachment upload yet.

## Technical stack

- React 19
- TypeScript
- Vite
- Tailwind CSS 4
- shadcn/ui components
- Wouter routing
- xlsx for Excel export
- jsPDF for PDF export
- signature_pad and framer-motion/lucide-react in the wider app
- Static frontend with browser localStorage; no backend/database currently exists

## Important source files

Repository path in the Manus sandbox:

`/home/ubuntu/av-cable-schedule`

Key files:

- `client/src/pages/Home.tsx` — main schedule page
- `client/src/components/CableTable.tsx` — schedule editor, filters and exports
- `client/src/components/PanelSummary.tsx` — panel capacity and sign-off
- `client/src/pages/ConnectionRack.tsx` — rack elevation
- `client/src/lib/rackPlanner.ts` — rack calculations
- `client/src/pages/DestinationDrops.tsx` — drawing and cable-drop view
- `client/src/lib/destinationPlanner.ts` — destination-drop calculations
- `client/src/pages/Consumables.tsx` — consumables interface
- `client/src/lib/consumablesPlanner.ts` — consumables calculations
- `client/src/lib/fibreProvision.ts` — Samsung fibre specification
- `client/src/lib/seedDataO2.ts` — current Karrinyup/O2 cable seed
- `client/src/lib/cableScheduleHandoff.ts` — DAVE builder contract
- `client/src/pages/CableScheduleBuilder.tsx` — project-aware builder
- `client/src/App.tsx` — routes
- `client/src/components/AppNav.tsx` — navigation
- `validation-rack-destination.md` — rack/destination validation notes
- `validation-fibre-provision.md` — fibre validation notes

## Known deployment/checkpoint information

- Manus web project name: `av-cable-schedule`
- Manus project ID: `7S7rLKHzHDAPEuMahvw4wS`
- Latest previously recorded rack/destination checkpoint: `61f9e907`
- Latest previously recorded embedded drawing checkpoint: `dab53131`
- Latest previously recorded fibre provision checkpoint: `24b7dc1f`
- Earlier DAVE builder checkpoint: `05be5722`

The exact latest source state should be checked in the Manus project before making changes.

## How to transfer this to another AI

### Option 1 — Best option: transfer the source repository

1. In Manus, open the `av-cable-schedule` web project.
2. Export/download the project source, or connect the repository to GitHub if that option is available.
3. Give the other AI the repository or a ZIP archive.
4. Also provide this handover document and the live URL.
5. Ask the other AI to run the existing checks before changing anything:

```bash
npx tsc --noEmit
pnpm build
```

### Option 2 — Give another Manus agent the project context

Use this prompt after importing or attaching the project files:

> Continue development of the MultiVRZ AV Cable Schedule application. Use the attached AI_HANDOVER.md as the source of truth. First inspect the existing source and run `npx tsc --noEmit` and `pnpm build`. Do not rebuild the app from scratch. Preserve the MultiVRZ branding, mobile usability, the Karrinyup defaults, 183-cable seed, 24-port panels, U3 hybrid panel, U2 lighting label, destination-drop PDF, Samsung fibre provision, Excel/PDF exports and DAVE `/build` handoff. Before editing, identify the latest implementation state and list any conflicts between the handover and the source.

### Option 3 — Give an external AI only the live site

Provide the AI with:

- The live URL: https://avcablesch-7s7rlkhz.manus.space/
- This handover document
- A request to inspect all four routes
- The specific change you want made

This lets the AI review the interface, but it will **not** be able to safely modify the existing Manus deployment unless you also provide source/repository access or rebuild the app in the other platform.

## Recommended transfer prompt

```text
I am transferring an existing MultiVRZ AV Cable Schedule web application to you.

Live site:
https://avcablesch-7s7rlkhz.manus.space/

Please read AI_HANDOVER.md and inspect the attached source repository before making any changes. Preserve the existing application rather than creating a generic replacement. Run the TypeScript and production build checks first. The app must retain its MultiVRZ branding, mobile cable cards, 183-cable Karrinyup seed, 24-port panel logic, rack planner, destination-drop drawing view, consumables planner, Samsung fibre provision, Excel/PDF exports and DAVE project-aware builder.

My next requested change is:
[WRITE THE NEW CHANGE HERE]

Before implementation:
1. Identify the relevant existing files.
2. Explain the smallest safe implementation plan.
3. Implement the change.
4. Run the checks and report exactly what changed.
5. Provide the updated live URL or deployment instructions.
```

## Important limitation

The published URL is a deployed frontend, not a complete source-code transfer. For reliable continuation, transfer the source repository/project files as well as the live URL. If the other AI cannot import the Manus project, ask it to create a new project from the source ZIP and then redeploy it; do not expect it to update the existing Manus deployment merely from the public URL.
