// AV Site Report — Data types

export type ReportItemStatus = "Pass" | "Fail" | "N/A" | "Pending";

export interface ReportPhoto {
  id: string;
  dataUrl: string;   // base64 data URL stored locally
  caption: string;
  timestamp: string;
}

export interface ReportSection {
  id: string;
  title: string;
  items: ReportItem[];
}

export interface ReportItem {
  id: string;
  description: string;
  status: ReportItemStatus;
  notes: string;
}

export interface SiteReportData {
  // Header / site details
  siteName: string;
  jobNumber: string;
  date: string;
  visitType: string;
  engineer: string;
  client: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  revision: string;

  // Overall summary
  overallStatus: "Satisfactory" | "Unsatisfactory" | "Requires Follow-up" | "";
  executiveSummary: string;

  // Checklist sections
  sections: ReportSection[];

  // Free-form comments
  generalComments: string;
  recommendations: string;
  followUpActions: string;

  // Photos
  photos: ReportPhoto[];

  // Sign-off
  engineerSignature: string;
  clientSignature: string;
  clientPrintedName: string;
}

export const VISIT_TYPES = [
  "Installation",
  "Commissioning",
  "Service Call",
  "Maintenance",
  "Survey",
  "Handover",
  "Fault Finding",
  "Other",
];

export const OVERALL_STATUSES = [
  "Satisfactory",
  "Unsatisfactory",
  "Requires Follow-up",
];

export const ITEM_STATUSES: ReportItemStatus[] = ["Pass", "Fail", "N/A", "Pending"];

export const ITEM_STATUS_STYLE: Record<ReportItemStatus, string> = {
  Pass:    "bg-green-50 text-green-700 border border-green-200",
  Fail:    "bg-red-50 text-red-700 border border-red-200",
  "N/A":   "bg-slate-100 text-slate-500 border border-slate-200",
  Pending: "bg-amber-50 text-amber-700 border border-amber-200",
};

export const OVERALL_STATUS_STYLE: Record<string, string> = {
  Satisfactory:        "bg-green-50 text-green-700 border-green-300",
  Unsatisfactory:      "bg-red-50 text-red-700 border-red-300",
  "Requires Follow-up":"bg-amber-50 text-amber-700 border-amber-300",
  "":                  "bg-slate-50 text-slate-500 border-slate-200",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeItem(description: string): ReportItem {
  return { id: uid(), description, status: "Pending", notes: "" };
}

function makeSection(title: string, items: string[]): ReportSection {
  return { id: uid(), title, items: items.map(makeItem) };
}

export function createDefaultReport(): SiteReportData {
  return {
    siteName: "",
    jobNumber: "",
    date: new Date().toISOString().split("T")[0],
    visitType: "",
    engineer: "",
    client: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    address: "",
    revision: "A",
    overallStatus: "",
    executiveSummary: "",
    sections: [
      makeSection("AV Equipment", [
        "All AV equipment powered on and operational",
        "Display screens functioning correctly",
        "Audio system checked and levels set",
        "Control system / touch panel operational",
        "Video sources switching correctly",
        "Microphones tested and working",
      ]),
      makeSection("Cabling & Connections", [
        "All cables labelled correctly",
        "Cable management tidy and secured",
        "No visible damage to cables or connectors",
        "Patch panel connections verified",
        "Signal integrity tested end-to-end",
      ]),
      makeSection("Network & Infrastructure", [
        "Network switch/router operational",
        "IP addresses configured correctly",
        "Dante / AoIP network verified",
        "Control network connectivity confirmed",
        "Firmware versions up to date",
      ]),
      makeSection("Health & Safety", [
        "Cable routes free from trip hazards",
        "Equipment securely mounted / racked",
        "Ventilation adequate for all equipment",
        "Emergency stop / isolation accessible",
        "Site tidy and waste removed",
      ]),
    ],
    generalComments: "",
    recommendations: "",
    followUpActions: "",
    photos: [],
    engineerSignature: "",
    clientSignature: "",
    clientPrintedName: "",
  };
}
