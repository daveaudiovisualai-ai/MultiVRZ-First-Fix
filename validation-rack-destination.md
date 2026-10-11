# Rack and destination planner validation

- The `/connection-rack` browser render confirmed a 12U elevation with network panels at U12–U6, U3 rendered as a 12-position audio/DMX hybrid panel, and U2 labelled Lighting.
- U3 visibly includes eight SpeakOn reference images, two 5-pin XLR reference images and two blank D-series positions. U2 renders 12 blank XLR positions.
- The `/destination-drops` browser render confirmed schedule-derived destinations, GOP sizing details, clickable markers and marker position controls. The initial 171-marker overview is overly dense on the placeholder canvas, so the next revision should constrain the overview to a manageable subset while retaining search-driven selection for every scheduled destination.
- The project compiled with `npx tsc --noEmit` and `pnpm build`; calculation verification passed before the overview density correction.

The corrected destination canvas now focuses on the currently selected marker by default and offers an explicit show-all control for a full marker overview. A browser-automation upload attempt did not locate the original `display: none` file input, so the file input was changed to an accessible visually hidden control before the final PDF-upload validation pass.

The final browser render confirms the focused plan canvas is readable and retains a single, clickable selected-drop marker. Browser-console validation confirms that a file input exists on `/destination-drops` and accepts `.pdf`, `.dwg` and `.dxf` files. The app uses the browser’s native file picker for upload; PDF is rendered in the plan window, while DWG/DXF is stored and prompts the user to upload a PDF export for in-browser rendering.

Mobile screenshots at 390 px confirm that the four-tab navigation remains reachable, the rack elevation scales into a readable vertical view, and the destination planner retains its upload action, calculation summary and focused plan canvas without clipping.
