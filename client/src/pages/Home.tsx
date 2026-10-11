import { defaultCablesForSite, defaultSiteDetailsForSite } from "@/lib/siteDefaults";
import { CABLE_STORAGE_KEY, readStoredCables } from "@/lib/scheduleStorage";
import { confirmAction } from "@/lib/confirmAction";
/*
 * Home — main page for AV Cable Schedule
 * Design: Clean Professional Dashboard
 * Layout: sticky site-details header + full-height cable table
 * Site details are shared via AppDataContext so Site Report can auto-populate
 */
import { useState, useEffect, useCallback } from "react";
import SiteDetailsHeader from "@/components/SiteDetailsHeader";
import CableTable from "@/components/CableTable";
import {
  createInitialRows,
  defaultSiteDetails,
  type CableRow,
  type SiteDetails,
} from "@/lib/cableTypes";
import { O2_CABLES, O2_SEED_SITE } from "@/lib/seedDataO2";
import { useAppData } from "@/contexts/AppDataContext";
import PanelSummary from "@/components/PanelSummary";
import { toast } from "sonner";

// Karrinyup v2 deliberately loads the updated 47u Rack A schedule rather than
// an earlier browser copy. The versioned key preserves separation from legacy
// projects such as Clark Contracts.
const STORAGE_KEY_CABLES = CABLE_STORAGE_KEY;

function loadCables(): CableRow[] {
  const stored = readStoredCables();
  if (stored) return stored;
  // First load: use O2 seed data
  return defaultCablesForSite();
}

export default function Home() {
  // Site details live in shared context (also persisted by context)
  const { cableSiteDetails: site, setCableSiteDetails } = useAppData();

  const [cables, setCables] = useState<CableRow[]>(loadCables);
  const [saved, setSaved] = useState(false);

  // Auto-save cables to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CABLES, JSON.stringify(cables));
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    } catch { /* Storage full etc. */ }
  }, [cables]);

  // Also show saved indicator when site changes
  useEffect(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [site]);

  const handleSiteChange = useCallback((updated: SiteDetails) => {
    setCableSiteDetails(updated);
  }, [setCableSiteDetails]);

  const handleCablesChange = useCallback((updated: CableRow[]) => {
    setCables(updated);
  }, []);

  const handleReset = async () => {
    if (await confirmAction("Reset the schedule to the Switch 1 / Switch 2 drawings? All current edits will be lost.")) {
      setCables(defaultCablesForSite());
      setCableSiteDetails(defaultSiteDetailsForSite());
      localStorage.removeItem(STORAGE_KEY_CABLES);
      toast.success("Schedule reset");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Sticky site details header */}
      <div className="shrink-0 sticky top-0 z-30">
        <SiteDetailsHeader site={site} onChange={handleSiteChange} cables={cables} />
      </div>

      {/* Auto-save indicator + reset */}
      <div className="shrink-0 bg-slate-100 border-b border-border px-3 md:px-4 py-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          {saved ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#16a34a" strokeWidth="1.3"/>
                <path d="M3.5 6l1.8 1.8 3-3.6" stroke="#16a34a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-green-700 font-medium">Saved</span>
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.3"/>
                <path d="M6 3.5v2.8l1.5 1.5" stroke="#94a3b8" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Auto-saves to this browser
            </>
          )}
        </span>
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          Reset schedule
        </button>
      </div>

      {/* Panel Summary — collapsible, hidden on mobile by default (accessible via toggle inside) */}
      <div className="shrink-0 bg-slate-50 border-b border-border overflow-y-auto" style={{ maxHeight: '30vh' }}>
        <div className="px-3 py-1.5 md:px-4 md:py-2">
          <PanelSummary cables={cables} />
        </div>
      </div>

      {/* Cable table — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <CableTable cables={cables} site={site} onChange={handleCablesChange} />
      </div>
    </div>
  );
}
