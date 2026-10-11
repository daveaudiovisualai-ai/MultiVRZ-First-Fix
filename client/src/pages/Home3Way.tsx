/*
 * Home3Way — 3-Way Divisible Room Cable Schedule page
 * Design: Clean Professional Dashboard — same style as Home.tsx
 * Uses separate localStorage key so it never overwrites the SSE schedule
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
import { SEED_3WAY_CABLES, SEED_3WAY_SITE } from "@/lib/seedData3Way";
import { toast } from "sonner";

const STORAGE_KEY_CABLES = "av_cable_schedule_3way_cables";
const STORAGE_KEY_SITE   = "av_cable_schedule_3way_site";

function loadCables(): CableRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CABLES);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return SEED_3WAY_CABLES;
}

function loadSite(): SiteDetails {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SITE);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    siteName:   SEED_3WAY_SITE.siteName,
    jobNumber:  SEED_3WAY_SITE.jobNumber,
    date:       SEED_3WAY_SITE.date,
    client:     SEED_3WAY_SITE.client,
    engineer:   SEED_3WAY_SITE.engineer,
    revision:   SEED_3WAY_SITE.revision,
  };
}

export default function Home3Way() {
  const [site, setSite]     = useState<SiteDetails>(loadSite);
  const [cables, setCables] = useState<CableRow[]>(loadCables);
  const [saved, setSaved]   = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CABLES, JSON.stringify(cables));
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    } catch { /* Storage full */ }
  }, [cables]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SITE, JSON.stringify(site));
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1500);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, [site]);

  const handleSiteChange   = useCallback((updated: SiteDetails) => setSite(updated), []);
  const handleCablesChange = useCallback((updated: CableRow[])   => setCables(updated), []);

  const handleReset = () => {
    if (window.confirm("Reset to 100 blank rows? All current data will be lost.")) {
      setCables(createInitialRows(100));
      setSite(defaultSiteDetails);
      toast.success("Schedule reset to 100 blank rows");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Sticky site details header */}
      <div className="shrink-0 sticky top-0 z-30">
        <SiteDetailsHeader site={site} onChange={handleSiteChange} />
      </div>

      {/* Auto-save indicator + reset */}
      <div className="shrink-0 bg-slate-100 border-b border-border px-4 py-1 flex items-center justify-between">
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

      {/* Cable table — fills remaining height */}
      <div className="flex-1 overflow-hidden">
        <CableTable cables={cables} site={site} onChange={handleCablesChange} />
      </div>
    </div>
  );
}
