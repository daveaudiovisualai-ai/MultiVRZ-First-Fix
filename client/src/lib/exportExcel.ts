import { leadTypeLabel } from "./patchLeads";
import { saveFile } from "@/lib/saveFile";
// AV Cable Schedule — Excel export utility
import * as XLSX from "xlsx";
import type { CableRow, SiteDetails } from "./cableTypes";

export function exportToExcel(cables: CableRow[], site: SiteDetails): void {
  const wb = XLSX.utils.book_new();

  // ── Site details header rows ──────────────────────────────────────────────
  const siteRows = [
    ["AV CABLE SCHEDULE"],
    [],
    ["Site Name:",   site.siteName,  "",  "Job Number:", site.jobNumber],
    ["Client:",      site.client,    "",  "Date:",       site.date],
    ["Engineer:",    site.engineer,  "",  "Revision:",   site.revision],
    [],
  ];

  // ── Column headers ────────────────────────────────────────────────────────
  const headers = [
    "Cable No.",
    "Cable Type",
    "Signal Type",
    "Source",
    "Destination",
    "Length",
    "Patch / Rack Location",
    "47U-12U Lead Type",
    "Patch Lead Colour",
    "Patch Lead Length",
    "Patch Cable at Destination",
    "Patch Cable Length",
    "HDMI",
    "HDMI Length",
    "USB",
    "USB Length",
    "Status",
    "Notes",
  ];

  // ── Data rows ─────────────────────────────────────────────────────────────
  const dataRows = cables.map((c) => [
    c.cableNumber,
    c.cableType,
    c.signalType,
    c.source,
    c.destination,
    c.length,
    c.patchLocation,
    leadTypeLabel(c),
    c.patchLeadColour ?? "",
    c.patchLeadLength ?? "",
    c.destPatchCable ?? "",
    c.destPatchLength ?? "",
    c.destHdmi ?? "",
    c.destHdmiLength ?? "",
    c.destUsb ?? "",
    c.destUsbLength ?? "",
    c.status,
    c.notes,
  ]);

  // ── Assemble worksheet ────────────────────────────────────────────────────
  const wsData = [...siteRows, headers, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 12 },  // Cable No.
    { wch: 18 },  // Cable Type
    { wch: 14 },  // Signal Type
    { wch: 24 },  // Source
    { wch: 24 },  // Destination
    { wch: 10 },  // Length
    { wch: 22 },  // Patch Location
    { wch: 30 },  // lead type
    { wch: 12 },  // Patch lead colour
    { wch: 10 },  // Patch lead length
    { wch: 22 },  // Patch cable at destination
    { wch: 12 },  // patch cable length
    { wch: 18 },  // HDMI
    { wch: 12 },  // HDMI length
    { wch: 18 },  // USB
    { wch: 12 },  // USB length
    { wch: 12 },  // Status
    { wch: 36 },  // Notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Cable Schedule");

  // Generate filename
  const safeName = (site.siteName || "AV_Schedule").replace(/\s+/g, "_");
  const safeJob  = site.jobNumber ? `_${site.jobNumber}` : "";
  const safeDate = site.date || new Date().toISOString().split("T")[0];
  const filename = `${safeName}${safeJob}_${safeDate}.xlsx`;

  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  void saveFile(filename, new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
