import { saveFile } from "@/lib/saveFile";
/**
 * Multivrz Cable Schedule — Professional PDF Export
 * Generates a branded A4 landscape PDF with site details header and full cable table.
 */
import jsPDF from "jspdf";
import type { CableRow, SiteDetails } from "./cableTypes";

// Multivrz brand colours
const BRAND_DARK_BLUE = [15, 23, 42] as [number, number, number];     // slate-900 #0F172A
const BRAND_LIGHT_BLUE = [34, 211, 238] as [number, number, number]; // cyan-400  #22D3EE
const BRAND_RED = [34, 211, 238] as [number, number, number];         // cyan accent
const WHITE = [255, 255, 255] as [number, number, number];
const LIGHT_GREY = [245, 246, 248] as [number, number, number];
const MID_GREY = [200, 205, 212] as [number, number, number];
const DARK_TEXT = [30, 40, 55] as [number, number, number];
const MUTED_TEXT = [100, 110, 125] as [number, number, number];

// Status colours (R,G,B)
const STATUS_COLORS: Record<string, [number, number, number]> = {
  Installed: [16, 130, 80],
  Tested:    [37, 99, 235],
  Fault:     [190, 30, 45],
  Pending:   [120, 120, 130],
};

function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Logo load failed"));
    img.src = url;
  });
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export async function exportCablePdf(
  cables: CableRow[],
  site: SiteDetails
): Promise<void> {
  const LOGO_URL = "assets/multivrz_logo.png";

  // ── Load logo ───────────────────────────────────────────────────────────
  let logoBase64: string | null = null;
  try {
    logoBase64 = await loadImageAsBase64(LOGO_URL);
  } catch {
    logoBase64 = null;
  }

  // ── Page setup ──────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = 297; // page width  (landscape A4)
  const PH = 210; // page height
  const ML = 12;  // margin left
  const MR = 12;  // margin right
  const CW = PW - ML - MR; // content width

  // Column definitions (label, key, width %)
  const COLS: { label: string; key: keyof CableRow | "idx"; w: number }[] = [
    { label: "#",                  key: "idx",          w: 5  },
    { label: "Cable No.",          key: "cableNumber",  w: 8  },
    { label: "Cable Type",         key: "cableType",    w: 11 },
    { label: "Signal",             key: "signalType",   w: 8  },
    { label: "Source",             key: "source",       w: 14 },
    { label: "Destination",        key: "destination",  w: 14 },
    { label: "Length",             key: "length",       w: 7  },
    { label: "Patch / Rack",       key: "patchLocation",w: 13 },
    { label: "Status",             key: "status",       w: 9  },
    { label: "Notes",              key: "notes",        w: 11 },
  ];
  const totalPct = COLS.reduce((s, c) => s + c.w, 0);
  const colWidths = COLS.map(c => (c.w / totalPct) * CW);

  const HEADER_H = 38;   // top branded header height
  const TABLE_TOP = HEADER_H + 4;
  const ROW_H = 7;
  const TH_H = 8;        // table header row height
  const FOOTER_H = 8;

  let page = 1;
  let y = TABLE_TOP;

  // ── Draw branded page header ─────────────────────────────────────────────
  function drawHeader() {
    // Dark blue background bar
    doc.setFillColor(...BRAND_DARK_BLUE);
    doc.rect(0, 0, PW, HEADER_H, "F");

    // Logo — colour logo on white rounded pill
    // Multivrz logo: square-ish, use fixed height 16mm
      if (logoBase64) {
        const LOGO_H = 16;                       // mm — fixed height
        const LOGO_W = LOGO_H;                   // square logo
      const PILL_PAD_X = 4;
      const PILL_PAD_Y = 3;
      const PILL_W = LOGO_W + PILL_PAD_X * 2;
      const PILL_H = LOGO_H + PILL_PAD_Y * 2;
      const PILL_Y = (HEADER_H - PILL_H) / 2;  // vertically centred in header
      doc.setFillColor(...WHITE);
      doc.roundedRect(ML, PILL_Y, PILL_W, PILL_H, 2, 2, "F");
      doc.addImage(logoBase64, "PNG", ML + PILL_PAD_X, PILL_Y + PILL_PAD_Y, LOGO_W, LOGO_H);
      // Shift title block to the right of the logo pill
      const titleX = ML + PILL_W + 6;
      doc.setTextColor(...WHITE);
      doc.setFontSize(15);
      doc.setFont("helvetica", "bold");
      doc.text("MultiVRZ CABLE SCHEDULE", titleX, 14);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BRAND_LIGHT_BLUE);
      doc.text("Global AV Solutions", titleX, 20);
      // Site details start after title
      const detailX = titleX;
      const detailW = (PW - detailX - MR) / 3;
      const siteFields = [
        { label: "Site",     value: site.siteName  || "—" },
        { label: "Job No.",  value: site.jobNumber || "—" },
        { label: "Date",     value: formatDate(site.date) || "—" },
        { label: "Client",   value: site.client    || "—" },
        { label: "Engineer", value: site.engineer  || "—" },
        { label: "Revision", value: site.revision  || "A"  },
      ];
      siteFields.forEach((f, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const fx = detailX + col * detailW;
        const fy = 26 + row * 6;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...BRAND_LIGHT_BLUE);
        doc.text(f.label.toUpperCase(), fx, fy);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...WHITE);
        doc.text(f.value, fx + 18, fy);
      });
    } else {
      // Fallback text logo
      doc.setTextColor(...WHITE);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("MultiVRZ", ML + 2, 20);
    }

    // Red accent strip at bottom of header
    doc.setFillColor(...BRAND_RED);
    doc.rect(0, HEADER_H - 2, PW, 2, "F");
  }

  // ── Draw table header row ────────────────────────────────────────────────
  function drawTableHeader(ty: number) {
    doc.setFillColor(...BRAND_DARK_BLUE);
    doc.rect(ML, ty, CW, TH_H, "F");

    let cx = ML;
    COLS.forEach((col, i) => {
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...WHITE);
      doc.text(col.label, cx + 2, ty + TH_H - 2.5);
      cx += colWidths[i];
    });
    return ty + TH_H;
  }

  // ── Draw footer ──────────────────────────────────────────────────────────
  function drawFooter(pg: number, total: number) {
    const fy = PH - FOOTER_H;
    doc.setFillColor(...LIGHT_GREY);
    doc.rect(0, fy, PW, FOOTER_H, "F");
    doc.setDrawColor(...MID_GREY);
    doc.line(0, fy, PW, fy);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED_TEXT);
    doc.text(
      `MultiVRZ — Global AV Solutions  |  ${site.siteName || "Cable Schedule"}  |  Job: ${site.jobNumber || "—"}  |  Rev: ${site.revision || "A"}`,
      ML, fy + 5
    );
    doc.text(`Page ${pg} of ${total}`, PW - MR - 20, fy + 5);
  }

  // ── Draw a single data row ───────────────────────────────────────────────
  function drawRow(cable: CableRow, rowIdx: number, ry: number) {
    const isEven = rowIdx % 2 === 0;
    doc.setFillColor(...(isEven ? WHITE : LIGHT_GREY));
    doc.rect(ML, ry, CW, ROW_H, "F");

    // Bottom border
    doc.setDrawColor(...MID_GREY);
    doc.line(ML, ry + ROW_H, ML + CW, ry + ROW_H);

    let cx = ML;
    COLS.forEach((col, i) => {
      const cellW = colWidths[i];
      let val = "";
      if (col.key === "idx") {
        val = String(rowIdx + 1);
      } else {
        val = (cable[col.key as keyof CableRow] as string) || "";
      }

      // Status badge
      if (col.key === "status") {
        const color = STATUS_COLORS[val] ?? STATUS_COLORS["Pending"];
        doc.setFillColor(...color);
        const badgeW = Math.min(cellW - 4, 22);
        const badgeX = cx + 2;
        const badgeY = ry + 1.5;
        doc.roundedRect(badgeX, badgeY, badgeW, ROW_H - 3, 1.5, 1.5, "F");
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...WHITE);
        doc.text(val, badgeX + badgeW / 2, badgeY + (ROW_H - 3) / 2 + 1.5, { align: "center" });
      } else {
        // Truncate text to fit cell
        doc.setFontSize(7.5);
        doc.setFont("helvetica", col.key === "cableNumber" ? "bold" : "normal");
        doc.setTextColor(...DARK_TEXT);
        const maxW = cellW - 3;
        const truncated = doc.splitTextToSize(val, maxW)[0] ?? "";
        doc.text(truncated, cx + 2, ry + ROW_H - 2.2);
      }
      cx += cellW;
    });
  }

  // ── Summary stats ────────────────────────────────────────────────────────
  function drawSummary(sy: number) {
    const counts = { Installed: 0, Tested: 0, Pending: 0, Fault: 0 };
    cables.forEach(c => { if (c.status in counts) counts[c.status as keyof typeof counts]++; });

    doc.setFillColor(235, 240, 248);
    doc.roundedRect(ML, sy + 2, CW, 12, 2, 2, "F");

    const items = [
      { label: "Total Cables", value: String(cables.length), color: BRAND_DARK_BLUE },
      { label: "Installed",    value: String(counts.Installed), color: STATUS_COLORS.Installed },
      { label: "Tested",       value: String(counts.Tested),    color: STATUS_COLORS.Tested    },
      { label: "Pending",      value: String(counts.Pending),   color: STATUS_COLORS.Pending   },
      { label: "Fault",        value: String(counts.Fault),     color: STATUS_COLORS.Fault     },
    ];

    const itemW = CW / items.length;
    items.forEach((item, i) => {
      const ix = ML + i * itemW + itemW / 2;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...item.color);
      doc.text(item.value, ix, sy + 10, { align: "center" });
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...MUTED_TEXT);
      doc.text(item.label, ix, sy + 13, { align: "center" });
    });

    return sy + 16;
  }

  // ── Build pages ──────────────────────────────────────────────────────────
  // First pass: count pages
  const USABLE_FIRST = PH - TABLE_TOP - TH_H - FOOTER_H - 20; // leave room for summary
  const USABLE_REST  = PH - TABLE_TOP - TH_H - FOOTER_H;
  const rowsFirstPage = Math.floor(USABLE_FIRST / ROW_H);
  const rowsPerPage   = Math.floor(USABLE_REST  / ROW_H);
  const remaining = Math.max(0, cables.length - rowsFirstPage);
  const totalPages = 1 + Math.ceil(remaining / rowsPerPage);

  // ── Page 1 ───────────────────────────────────────────────────────────────
  drawHeader();
  // Summary block
  y = drawSummary(TABLE_TOP);
  y = drawTableHeader(y);

  let rowIdx = 0;
  while (rowIdx < cables.length && y + ROW_H <= PH - FOOTER_H - 2) {
    drawRow(cables[rowIdx], rowIdx, y);
    y += ROW_H;
    rowIdx++;
  }
  drawFooter(page, totalPages);

  // ── Subsequent pages ─────────────────────────────────────────────────────
  while (rowIdx < cables.length) {
    doc.addPage();
    page++;
    drawHeader();
    y = TABLE_TOP;
    y = drawTableHeader(y);

    while (rowIdx < cables.length && y + ROW_H <= PH - FOOTER_H - 2) {
      drawRow(cables[rowIdx], rowIdx, y);
      y += ROW_H;
      rowIdx++;
    }
    drawFooter(page, totalPages);
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const filename = `MultiVRZ_Cable_Schedule_${site.jobNumber || site.siteName || "Export"}_Rev${site.revision || "A"}.pdf`;
  await saveFile(filename, doc.output("blob"));
}
