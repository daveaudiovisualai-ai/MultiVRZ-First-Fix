/*
 * reportTemplates — save, load, and delete named checklist section templates
 * Templates are stored in localStorage as an array of named section sets.
 */
import type { ReportSection } from "./reportTypes";

const STORAGE_KEY = "av_report_templates";

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  sections: ReportSection[];
}

export function loadTemplates(): ReportTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveTemplate(name: string, description: string, sections: ReportSection[]): ReportTemplate {
  const templates = loadTemplates();
  const newTemplate: ReportTemplate = {
    id: `tpl-${Date.now()}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    sections: JSON.parse(JSON.stringify(sections)), // deep clone
  };
  templates.push(newTemplate);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  return newTemplate;
}

export function deleteTemplate(id: string): void {
  const templates = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

// Built-in starter templates
export const BUILT_IN_TEMPLATES: Omit<ReportTemplate, "id" | "createdAt">[] = [
  {
    name: "AV Commissioning",
    description: "Standard AV system commissioning checklist",
    sections: [
      {
        id: "bi-1", title: "AV Equipment", items: [
          { id: "bi-1-1", description: "All AV equipment powered on and operational", status: "Pending", notes: "" },
          { id: "bi-1-2", description: "Display screens functioning correctly", status: "Pending", notes: "" },
          { id: "bi-1-3", description: "Audio system checked and levels set", status: "Pending", notes: "" },
          { id: "bi-1-4", description: "Control system / touch panel operational", status: "Pending", notes: "" },
          { id: "bi-1-5", description: "Video sources switching correctly", status: "Pending", notes: "" },
          { id: "bi-1-6", description: "Microphones tested and working", status: "Pending", notes: "" },
        ],
      },
      {
        id: "bi-2", title: "Cabling & Connections", items: [
          { id: "bi-2-1", description: "All cables labelled correctly", status: "Pending", notes: "" },
          { id: "bi-2-2", description: "Cable management tidy and secured", status: "Pending", notes: "" },
          { id: "bi-2-3", description: "No visible damage to cables or connectors", status: "Pending", notes: "" },
          { id: "bi-2-4", description: "Patch panel connections verified", status: "Pending", notes: "" },
          { id: "bi-2-5", description: "Signal integrity tested end-to-end", status: "Pending", notes: "" },
        ],
      },
      {
        id: "bi-3", title: "Network & Infrastructure", items: [
          { id: "bi-3-1", description: "Network switch/router operational", status: "Pending", notes: "" },
          { id: "bi-3-2", description: "IP addresses configured correctly", status: "Pending", notes: "" },
          { id: "bi-3-3", description: "Dante / AoIP network verified", status: "Pending", notes: "" },
          { id: "bi-3-4", description: "Control network connectivity confirmed", status: "Pending", notes: "" },
          { id: "bi-3-5", description: "Firmware versions up to date", status: "Pending", notes: "" },
        ],
      },
      {
        id: "bi-4", title: "Health & Safety", items: [
          { id: "bi-4-1", description: "Cable routes free from trip hazards", status: "Pending", notes: "" },
          { id: "bi-4-2", description: "Equipment securely mounted / racked", status: "Pending", notes: "" },
          { id: "bi-4-3", description: "Ventilation adequate for all equipment", status: "Pending", notes: "" },
          { id: "bi-4-4", description: "Emergency stop / isolation accessible", status: "Pending", notes: "" },
          { id: "bi-4-5", description: "Site tidy and waste removed", status: "Pending", notes: "" },
        ],
      },
    ],
  },
  {
    name: "Service Call",
    description: "Fault-finding and service visit checklist",
    sections: [
      {
        id: "sc-1", title: "Fault Investigation", items: [
          { id: "sc-1-1", description: "Fault reported by client described and understood", status: "Pending", notes: "" },
          { id: "sc-1-2", description: "Fault reproduced on site", status: "Pending", notes: "" },
          { id: "sc-1-3", description: "Root cause identified", status: "Pending", notes: "" },
          { id: "sc-1-4", description: "Temporary workaround applied if needed", status: "Pending", notes: "" },
        ],
      },
      {
        id: "sc-2", title: "Remedial Works", items: [
          { id: "sc-2-1", description: "Faulty component replaced / repaired", status: "Pending", notes: "" },
          { id: "sc-2-2", description: "System tested after repair", status: "Pending", notes: "" },
          { id: "sc-2-3", description: "All original functionality restored", status: "Pending", notes: "" },
          { id: "sc-2-4", description: "Client demonstrated system operation", status: "Pending", notes: "" },
        ],
      },
      {
        id: "sc-3", title: "Parts & Follow-up", items: [
          { id: "sc-3-1", description: "Parts used documented", status: "Pending", notes: "" },
          { id: "sc-3-2", description: "Parts to order noted", status: "Pending", notes: "" },
          { id: "sc-3-3", description: "Return visit required?", status: "Pending", notes: "" },
        ],
      },
    ],
  },
  {
    name: "Pre-Event Check",
    description: "Day-of-event AV readiness checklist",
    sections: [
      {
        id: "pe-1", title: "Audio", items: [
          { id: "pe-1-1", description: "PA system powered and tested", status: "Pending", notes: "" },
          { id: "pe-1-2", description: "Microphones charged / cabled and tested", status: "Pending", notes: "" },
          { id: "pe-1-3", description: "Monitoring / IEM system checked", status: "Pending", notes: "" },
          { id: "pe-1-4", description: "Comms system operational", status: "Pending", notes: "" },
          { id: "pe-1-5", description: "Background music / playback ready", status: "Pending", notes: "" },
        ],
      },
      {
        id: "pe-2", title: "Video", items: [
          { id: "pe-2-1", description: "All screens / projectors on and displaying", status: "Pending", notes: "" },
          { id: "pe-2-2", description: "Presentation laptop connected and tested", status: "Pending", notes: "" },
          { id: "pe-2-3", description: "Video switching / routing verified", status: "Pending", notes: "" },
          { id: "pe-2-4", description: "Recording / streaming system ready", status: "Pending", notes: "" },
        ],
      },
      {
        id: "pe-3", title: "Lighting", items: [
          { id: "pe-3-1", description: "Lighting rig powered and patched", status: "Pending", notes: "" },
          { id: "pe-3-2", description: "Scenes / presets programmed and tested", status: "Pending", notes: "" },
          { id: "pe-3-3", description: "Emergency lighting unobstructed", status: "Pending", notes: "" },
        ],
      },
    ],
  },
];
