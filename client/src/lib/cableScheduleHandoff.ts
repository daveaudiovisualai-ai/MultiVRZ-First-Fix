import { getUrlParams } from "@/lib/urlParams";
/*
 * Cable Schedule builder handoff contract
 *
 * The AV Preparation gate opens:
 * /build?projectId=...&projectName=...&address=...&jobNumber=...&client=...&engineer=...&returnUrl=...
 *
 * This stays deliberately query-based for the first integration. It permits
 * the DAVE Platform to pre-fill a project without an API or database bridge;
 * completion is returned via postMessage and an optional returnUrl.
 */
import type { SiteDetails } from "@/lib/cableTypes";

export interface CableScheduleProjectContext {
  projectId: string;
  projectName: string;
  address: string;
  jobNumber: string;
  client: string;
  engineer: string;
  returnUrl: string;
}

function readParam(params: URLSearchParams, names: string[], fallback = ""): string {
  for (const name of names) {
    const value = params.get(name)?.trim();
    if (value) return value;
  }
  return fallback;
}

export function readCableScheduleProjectContext(): CableScheduleProjectContext {
  const params = getUrlParams();
  return {
    projectId: readParam(params, ["projectId", "project_id", "id"], "unassigned-project"),
    projectName: readParam(params, ["projectName", "project", "siteName"], "New AV Project"),
    address: readParam(params, ["address", "siteAddress"]),
    jobNumber: readParam(params, ["jobNumber", "job", "jobNo"]),
    client: readParam(params, ["client"], "Multivrz"),
    engineer: readParam(params, ["engineer", "avPm", "avPM"]),
    returnUrl: readParam(params, ["returnUrl", "return"]),
  };
}

export function siteDetailsForProject(context: CableScheduleProjectContext): SiteDetails {
  return {
    siteName: context.projectName,
    jobNumber: context.jobNumber,
    date: new Date().toISOString().split("T")[0],
    client: context.client,
    engineer: context.engineer,
    revision: "Rev A",
  };
}

export function storageKeyForProject(context: CableScheduleProjectContext): string {
  const safeProjectId = context.projectId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return `dave_cable_schedule_${safeProjectId || "unassigned"}_v1`;
}

export interface CompletedCableScheduleHandoff {
  type: "DAVE_CABLE_SCHEDULE_READY";
  projectId: string;
  projectName: string;
  jobNumber: string;
  address: string;
  status: "ready_for_issue";
  cableCount: number;
  completedAt: string;
}
