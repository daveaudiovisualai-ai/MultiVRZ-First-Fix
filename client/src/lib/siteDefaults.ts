/** Starting data for the open site: Karrinyup has its imported schedule; new sites start empty. */
import type { CableRow, SiteDetails } from "./cableTypes";
import { defaultSiteDetails } from "./cableTypes";
import { O2_CABLES, O2_SEED_SITE } from "./seedDataO2";
import { activeSite, isKarrinyup } from "./sites";

export function defaultCablesForSite(): CableRow[] {
  return isKarrinyup() ? O2_CABLES : [];
}

export function defaultSiteDetailsForSite(): SiteDetails {
  if (isKarrinyup()) return { ...defaultSiteDetails, ...O2_SEED_SITE };
  const site = activeSite();
  return {
    ...defaultSiteDetails,
    siteName: site.name,
    jobNumber: site.jobNumber,
    client: site.client,
    engineer: site.engineer,
    date: site.startDate,
    revision: "A",
  };
}
