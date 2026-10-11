import { saveFile } from "@/lib/saveFile";
// Site Report — PDF export using jsPDF
import jsPDF from "jspdf";
import type { SiteReportData, ReportItem } from "./reportTypes";

const BLUE:  [number, number, number] = [37, 99, 235];    // primary blue
const DARK:  [number, number, number] = [30, 41, 59];     // slate-800
const MID:   [number, number, number] = [100, 116, 139];  // slate-500
const LIGHT: [number, number, number] = [248, 250, 252];  // slate-50
const WHITE: [number, number, number] = [255, 255, 255];

const STATUS_COLORS: Record<string, [number, number, number]> = {
  Pass:    [22, 163, 74],
  Fail:    [220, 38, 38],
  "N/A":   [148, 163, 184],
  Pending: [217, 119, 6],
};

const OVERALL_COLORS: Record<string, [number, number, number]> = {
  Satisfactory:         [22, 163, 74],
  Unsatisfactory:       [220, 38, 38],
  "Requires Follow-up": [217, 119, 6],
};

export async function exportReportToPdf(report: SiteReportData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;
  let y = 0;

  // ── helpers ──────────────────────────────────────────────────────────────
  const newPage = () => {
    doc.addPage();
    y = 14;
    drawPageHeader();
  };

  const checkY = (needed: number) => {
    if (y + needed > 278) newPage();
  };

  const setFont = (style: "normal" | "bold", size: number, color = DARK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const drawPageHeader = () => {
    doc.setFillColor(...BLUE);
    doc.rect(0, 0, W, 10, "F");
    setFont("bold", 9, WHITE);
    doc.text("AV SITE REPORT", MARGIN, 6.5);
    const right = `${report.siteName || "—"}  |  ${report.jobNumber || "—"}  |  ${report.date}`;
    doc.text(right, W - MARGIN, 6.5, { align: "right" });
  };

  const sectionHeading = (title: string) => {
    checkY(10);
    doc.setFillColor(...DARK);
    doc.rect(MARGIN, y, CONTENT_W, 7, "F");
    setFont("bold", 9, WHITE);
    doc.text(title.toUpperCase(), MARGIN + 3, y + 4.8);
    y += 9;
  };

  const labelValue = (label: string, value: string, x: number, colW: number) => {
    setFont("bold", 7.5, MID);
    doc.text(label.toUpperCase(), x, y);
    setFont("normal", 9, DARK);
    const lines = doc.splitTextToSize(value || "—", colW - 2);
    doc.text(lines, x, y + 4);
    return lines.length * 4.5 + 4;
  };

  const textBlock = (label: string, value: string) => {
    checkY(14);
    setFont("bold", 8, MID);
    doc.text(label.toUpperCase(), MARGIN, y);
    y += 4;
    setFont("normal", 9, DARK);
    const lines = doc.splitTextToSize(value || "—", CONTENT_W);
    lines.forEach((line: string) => {
      checkY(5);
      doc.text(line, MARGIN, y);
      y += 4.5;
    });
    y += 2;
  };

  // ── Page 1: Cover ────────────────────────────────────────────────────────
  // Blue header band
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 38, "F");

  setFont("bold", 22, WHITE);
  doc.text("AV SITE REPORT", MARGIN, 18);
  setFont("normal", 10, [180, 210, 255]);
  doc.text("Audio Visual Site Documentation", MARGIN, 25);

  // Overall status badge
  if (report.overallStatus) {
    const col = OVERALL_COLORS[report.overallStatus] || MID;
    doc.setFillColor(...col);
    doc.roundedRect(W - MARGIN - 52, 12, 52, 10, 2, 2, "F");
    setFont("bold", 9, WHITE);
    doc.text(report.overallStatus.toUpperCase(), W - MARGIN - 26, 18.5, { align: "center" });
  }

  y = 46;

  // Site details grid
  sectionHeading("Site Details");
  const col1 = MARGIN, col2 = MARGIN + CONTENT_W / 2;
  const colW = CONTENT_W / 2 - 4;

  const pairs: [string, string, string, string][] = [
    ["Site Name", report.siteName, "Job Number", report.jobNumber],
    ["Date", report.date, "Visit Type", report.visitType],
    ["Engineer", report.engineer, "Revision", report.revision],
    ["Client", report.client, "", ""],
  ];

  pairs.forEach(([l1, v1, l2, v2]) => {
    checkY(14);
    const h1 = labelValue(l1, v1, col1, colW);
    if (l2) labelValue(l2, v2, col2, colW);
    y += Math.max(h1, 10) + 2;
  });

  y += 2;

  // Contact details
  sectionHeading("Site Contact");
  const contactPairs: [string, string, string, string][] = [
    ["Contact Name", report.contactName, "Phone", report.contactPhone],
    ["Email", report.contactEmail, "Address", report.address],
  ];
  contactPairs.forEach(([l1, v1, l2, v2]) => {
    checkY(14);
    const h1 = labelValue(l1, v1, col1, colW);
    const h2 = labelValue(l2, v2, col2, colW);
    y += Math.max(h1, h2) + 2;
  });

  y += 4;

  // Executive summary
  if (report.executiveSummary) {
    sectionHeading("Executive Summary");
    textBlock("", report.executiveSummary);
  }

  // ── Checklist sections ───────────────────────────────────────────────────
  report.sections.forEach((section) => {
    checkY(16);
    sectionHeading(section.title);

    // Table header
    doc.setFillColor(...LIGHT);
    doc.rect(MARGIN, y, CONTENT_W, 6, "F");
    setFont("bold", 7.5, MID);
    doc.text("ITEM", MARGIN + 2, y + 4);
    doc.text("STATUS", MARGIN + CONTENT_W - 38, y + 4);
    doc.text("NOTES", MARGIN + CONTENT_W - 70, y + 4);
    y += 7;

    section.items.forEach((item: ReportItem, idx: number) => {
      checkY(8);
      const rowH = 7;
      const bg: [number, number, number] = idx % 2 === 0 ? WHITE : LIGHT;
      doc.setFillColor(...bg);
      doc.rect(MARGIN, y, CONTENT_W, rowH, "F");

      // Description
      setFont("normal", 8.5, DARK);
      const descLines = doc.splitTextToSize(item.description, CONTENT_W - 80);
      doc.text(descLines[0], MARGIN + 2, y + 4.5);

      // Notes
      setFont("normal", 7.5, MID);
      const noteLines = doc.splitTextToSize(item.notes || "", 30);
      doc.text(noteLines[0] || "", MARGIN + CONTENT_W - 70, y + 4.5);

      // Status badge
      const col = STATUS_COLORS[item.status] || MID;
      doc.setFillColor(...col);
      doc.roundedRect(MARGIN + CONTENT_W - 36, y + 1.5, 22, 4, 1, 1, "F");
      setFont("bold", 7, WHITE);
      doc.text(item.status, MARGIN + CONTENT_W - 25, y + 4.5, { align: "center" });

      y += rowH;
    });

    y += 4;
  });

  // ── Comments ─────────────────────────────────────────────────────────────
  if (report.generalComments || report.recommendations || report.followUpActions) {
    checkY(12);
    sectionHeading("Comments & Recommendations");
    if (report.generalComments)  textBlock("General Comments",  report.generalComments);
    if (report.recommendations)  textBlock("Recommendations",   report.recommendations);
    if (report.followUpActions)  textBlock("Follow-up Actions", report.followUpActions);
  }

  // ── Photos ───────────────────────────────────────────────────────────────
  if (report.photos.length > 0) {
    checkY(12);
    sectionHeading("Site Photos");
    y += 2;

    const photoW = (CONTENT_W - 6) / 2;
    const photoH = photoW * 0.65;

    for (let i = 0; i < report.photos.length; i += 2) {
      checkY(photoH + 14);
      const left = report.photos[i];
      const right = report.photos[i + 1];

      try {
        doc.addImage(left.dataUrl, "JPEG", MARGIN, y, photoW, photoH);
      } catch { /* skip bad image */ }
      setFont("normal", 7.5, MID);
      const capL = doc.splitTextToSize(left.caption || `Photo ${i + 1}`, photoW);
      doc.text(capL, MARGIN, y + photoH + 4);

      if (right) {
        try {
          doc.addImage(right.dataUrl, "JPEG", MARGIN + photoW + 6, y, photoW, photoH);
        } catch { /* skip */ }
        const capR = doc.splitTextToSize(right.caption || `Photo ${i + 2}`, photoW);
        doc.text(capR, MARGIN + photoW + 6, y + photoH + 4);
      }

      y += photoH + 10;
    }
  }

  // ── Sign-off ──────────────────────────────────────────────────────────────
  checkY(40);
  sectionHeading("Sign-off");
  y += 4;

  const signW = (CONTENT_W - 10) / 2;
  // Engineer box
  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.3);
  doc.rect(MARGIN, y, signW, 20);
  setFont("bold", 7.5, MID);
  doc.text("ENGINEER SIGNATURE", MARGIN + 2, y + 4);
  setFont("normal", 8, DARK);
  doc.text(report.engineerSignature || "", MARGIN + 4, y + 14);
  doc.setDrawColor(...MID);
  doc.line(MARGIN + 2, y + 17, MARGIN + signW - 2, y + 17);
  setFont("normal", 7, MID);
  doc.text(report.engineer || "", MARGIN + 2, y + 20);

  // Client box
  const cx = MARGIN + signW + 10;
  doc.setDrawColor(...DARK);
  doc.rect(cx, y, signW, 20);
  setFont("bold", 7.5, MID);
  doc.text("CLIENT SIGNATURE", cx + 2, y + 4);
  setFont("normal", 8, DARK);
  doc.text(report.clientSignature || "", cx + 4, y + 14);
  doc.setDrawColor(...MID);
  doc.line(cx + 2, y + 17, cx + signW - 2, y + 17);
  setFont("normal", 7, MID);
  doc.text(report.clientPrintedName || "", cx + 2, y + 20);

  y += 26;

  // Page numbers
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    setFont("normal", 7, MID);
    doc.text(`Page ${p} of ${pageCount}`, W - MARGIN, 290, { align: "right" });
  }

  // Save
  const safeName = (report.siteName || "SiteReport").replace(/\s+/g, "_");
  const safeJob  = report.jobNumber ? `_${report.jobNumber}` : "";
  await saveFile(`${safeName}${safeJob}_${report.date}.pdf`, doc.output("blob"));
}
