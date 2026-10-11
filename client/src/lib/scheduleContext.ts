import { defaultCablesForSite, defaultSiteDetailsForSite } from "./siteDefaults";
import { readStoredCables } from "./scheduleStorage";
import { getUrlParams } from "@/lib/urlParams";
import type { CableRow, SiteDetails } from "./cableTypes";
import { O2_CABLES, O2_SEED_SITE } from "./seedDataO2";
import {
  readCableScheduleProjectContext,
  siteDetailsForProject,
  storageKeyForProject,
} from "./cableScheduleHandoff";

interface SavedSchedule {
  site: SiteDetails;
  cables: CableRow[];
}

export interface LoadedCableSchedule {
  cables: CableRow[];
  site: SiteDetails;
  isProjectSchedule: boolean;
  storageScope: string;
}

const DEFAULT_CABLE_STORAGE_KEY = "multivrz_o2_cable_schedule_v4";
const DEFAULT_SITE_STORAGE_KEY = "multivrz_o2_cable_schedule_site_v2";

function safelyRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function hasProjectScheduleContext() {
  const params = getUrlParams();
  return Boolean(params.get("projectId") || params.get("project_id") || params.get("id"));
}

export function loadCurrentCableSchedule(): LoadedCableSchedule {
  if (hasProjectScheduleContext()) {
    const project = readCableScheduleProjectContext();
    const saved = safelyRead<SavedSchedule>(storageKeyForProject(project));
    const safeScope = project.projectId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "unassigned";
    return {
      cables: saved?.cables ?? [],
      site: saved?.site ?? siteDetailsForProject(project),
      isProjectSchedule: true,
      storageScope: `dave-${safeScope}`,
    };
  }

  return {
    cables: readStoredCables() ?? defaultCablesForSite(),
    site: safelyRead<SiteDetails>(DEFAULT_SITE_STORAGE_KEY) ?? defaultSiteDetailsForSite(),
    isProjectSchedule: false,
    storageScope: "o2",
  };
}
