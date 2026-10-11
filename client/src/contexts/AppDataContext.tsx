import { defaultSiteDetailsForSite } from "@/lib/siteDefaults";
/*
 * AppDataContext — shared state bridge between Cable Schedule and Site Report
 * Exposes the cable schedule's SiteDetails so the Site Report can auto-populate
 * from it without duplicating data entry.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { SiteDetails } from "@/lib/cableTypes";
import { defaultSiteDetails } from "@/lib/cableTypes";
import { O2_SEED_SITE } from "@/lib/seedDataO2";

// Karrinyup v2 uses a dedicated key so the current job header supersedes any
// earlier browser record while remaining isolated from legacy projects.
const STORAGE_KEY_SITE = "multivrz_o2_cable_schedule_site_v2";

function loadSite(): SiteDetails {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SITE);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // First load: use O2 site details
  return defaultSiteDetailsForSite();
}

interface AppDataContextValue {
  cableSiteDetails: SiteDetails;
  setCableSiteDetails: (details: SiteDetails) => void;
}

const AppDataContext = createContext<AppDataContextValue>({
  cableSiteDetails: defaultSiteDetails,
  setCableSiteDetails: () => {},
});

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [cableSiteDetails, setCableSiteDetailsState] = useState<SiteDetails>(loadSite);

  const setCableSiteDetails = useCallback((details: SiteDetails) => {
    setCableSiteDetailsState(details);
    try {
      localStorage.setItem(STORAGE_KEY_SITE, JSON.stringify(details));
    } catch { /* ignore */ }
  }, []);

  return (
    <AppDataContext.Provider value={{ cableSiteDetails, setCableSiteDetails }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
