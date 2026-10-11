import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initSharedSync, SHARED_REMOTE_EVENT } from "./lib/sharedSync";
import { installServerShim } from "./lib/serverShim";
import { ensureActiveSitePlan } from "./lib/floorPlanStore";

/** Re-mounts the app when shared data changes elsewhere, so every page re-reads it. */
function Root() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(SHARED_REMOTE_EVENT, bump);
    return () => window.removeEventListener(SHARED_REMOTE_EVENT, bump);
  }, []);
  return <App key={version} />;
}

const rootEl = document.getElementById("root")!;
rootEl.innerHTML =
  '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font:500 14px Barlow,system-ui,sans-serif;color:#64748b;background:#0f172a">Loading schedule…</div>';

installServerShim()
  .catch(() => false)
  .then(() => initSharedSync())
  .catch(() => undefined)
  .finally(() => {
    rootEl.innerHTML = "";
    createRoot(rootEl).render(<Root />);
    void ensureActiveSitePlan();
    window.addEventListener(SHARED_REMOTE_EVENT, () => void ensureActiveSitePlan());
  });

// Hide images whose files are not published yet (logo, connector photos),
// rather than showing a broken-image icon.
window.addEventListener(
  "error",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) target.style.visibility = "hidden";
  },
  true
);
