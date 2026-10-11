/*
 * SharedReport — read-only view of a shared site report
 * Decoded from the URL hash fragment: /site-report#report=<encoded>
 * Design: Clean Professional Dashboard
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  ITEM_STATUS_STYLE,
  OVERALL_STATUS_STYLE,
  type SiteReportData,
  type ReportItemStatus,
} from "@/lib/reportTypes";
import { decodeReportFromHash } from "@/lib/shareReport";
import { exportReportToPdf } from "@/lib/exportReportPdf";
import { toast } from "sonner";

function FieldPair({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5"
        style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
        {label}
      </p>
      <p className="text-sm text-slate-800">{value || "—"}</p>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-border rounded-md overflow-hidden shadow-sm">
      <div className="bg-slate-800 px-4 py-2.5">
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider"
          style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
          {title}
        </h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function SharedReport() {
  const [report, setReport] = useState<SiteReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || !hash.includes("report=")) {
      setError(true);
      setLoading(false);
      return;
    }
    decodeReportFromHash(hash.slice(1)).then((decoded) => {
      if (decoded) {
        setReport(decoded);
      } else {
        setError(true);
      }
      setLoading(false);
    });
  }, []);

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      await exportReportToPdf(report);
      toast.success("PDF exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading report…</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center space-y-3 max-w-sm px-4">
          <svg className="mx-auto text-slate-300" width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2"/>
            <path d="M24 14v14M24 34v2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <h2 className="text-lg font-bold text-slate-700" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            Report Not Found
          </h2>
          <p className="text-sm text-muted-foreground">
            This link may be invalid or the report data is too large to share via URL.
          </p>
          <Link href="/site-report">
            <Button variant="outline" size="sm">Go to Site Report</Button>
          </Link>
        </div>
      </div>
    );
  }

  const allItems = report.sections.flatMap((s) => s.items);
  const counts   = { Pass: 0, Fail: 0, "N/A": 0, Pending: 0 };
  allItems.forEach((it) => { if (it.status in counts) counts[it.status as ReportItemStatus]++; });

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      {/* Header */}
      <div className="bg-primary sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none" className="shrink-0">
            <rect x="1" y="1" width="20" height="20" rx="3" stroke="white" strokeWidth="1.5"/>
            <path d="M5 7h12M5 11h12M5 15h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h1 className="text-white font-semibold tracking-wide"
            style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "1rem", letterSpacing: "0.06em" }}>
            AV SITE REPORT
          </h1>
          <span className="ml-1 text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-medium">
            Read-only
          </span>
          <div className="flex-1" />
          <Button size="sm" onClick={handleExport} disabled={exporting}
            className="h-8 text-xs gap-1.5 bg-white text-primary hover:bg-blue-50">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 9v2h9V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Status summary */}
        <div className="bg-white border border-border rounded-md px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            Checklist Summary
          </span>
          {(["Pass", "Fail", "Pending", "N/A"] as ReportItemStatus[]).map((s) => (
            <span key={s} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ITEM_STATUS_STYLE[s]}`}>
              {counts[s]} {s}
            </span>
          ))}
          <div className="flex-1" />
          {report.overallStatus && (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${OVERALL_STATUS_STYLE[report.overallStatus]}`}>
              {report.overallStatus}
            </span>
          )}
        </div>

        {/* Site details */}
        <SectionBlock title="Site Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <FieldPair label="Site Name"   value={report.siteName} />
            <FieldPair label="Job Number"  value={report.jobNumber} />
            <FieldPair label="Date"        value={report.date} />
            <FieldPair label="Visit Type"  value={report.visitType} />
            <FieldPair label="Engineer"    value={report.engineer} />
            <FieldPair label="Revision"    value={report.revision} />
          </div>
        </SectionBlock>

        {/* Client & contact */}
        {(report.client || report.contactName || report.contactPhone || report.contactEmail || report.address) && (
          <SectionBlock title="Client & Contact">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              <FieldPair label="Client"       value={report.client} />
              <FieldPair label="Contact Name" value={report.contactName} />
              <FieldPair label="Phone"        value={report.contactPhone} />
              <FieldPair label="Email"        value={report.contactEmail} />
              <FieldPair label="Address"      value={report.address} />
            </div>
          </SectionBlock>
        )}

        {/* Executive summary */}
        {report.executiveSummary && (
          <SectionBlock title="Executive Summary">
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.executiveSummary}</p>
          </SectionBlock>
        )}

        {/* Checklist sections */}
        {report.sections.map((section) => (
          <SectionBlock key={section.id} title={section.title}>
            <div className="space-y-0">
              <div className="grid grid-cols-[1fr_110px_1fr] gap-2 px-2 py-1.5 bg-slate-50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                <span>Item</span>
                <span>Status</span>
                <span>Notes</span>
              </div>
              {section.items.map((item, idx) => (
                <div key={item.id}
                  className={`grid grid-cols-[1fr_110px_1fr] gap-2 px-2 py-2 border-b border-border/50 text-sm ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}>
                  <span className="text-slate-800">{item.description}</span>
                  <span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ITEM_STATUS_STYLE[item.status]}`}>
                      {item.status}
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">{item.notes}</span>
                </div>
              ))}
            </div>
          </SectionBlock>
        ))}

        {/* Comments */}
        {(report.generalComments || report.recommendations || report.followUpActions) && (
          <SectionBlock title="Comments & Recommendations">
            <div className="space-y-4">
              {report.generalComments && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
                    style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
                    General Comments
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.generalComments}</p>
                </div>
              )}
              {report.recommendations && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
                    style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
                    Recommendations
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.recommendations}</p>
                </div>
              )}
              {report.followUpActions && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
                    style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
                    Follow-up Actions
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{report.followUpActions}</p>
                </div>
              )}
            </div>
          </SectionBlock>
        )}

        {/* Sign-off */}
        {(report.engineer || report.clientPrintedName) && (
          <SectionBlock title="Sign-off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
                  style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
                  Engineer
                </p>
                {report.engineerSignature && report.engineerSignature !== "[signature]" ? (
                  <img src={report.engineerSignature} alt="Engineer signature"
                    className="h-16 border border-border rounded bg-white p-1 mb-1" />
                ) : (
                  <div className="h-16 border border-dashed border-border rounded bg-slate-50 flex items-center justify-center mb-1">
                    <span className="text-xs text-slate-300">Signature captured on device</span>
                  </div>
                )}
                <p className="text-sm text-slate-700">{report.engineer}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
                  style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.65rem" }}>
                  Client
                </p>
                {report.clientSignature && report.clientSignature !== "[signature]" ? (
                  <img src={report.clientSignature} alt="Client signature"
                    className="h-16 border border-border rounded bg-white p-1 mb-1" />
                ) : (
                  <div className="h-16 border border-dashed border-border rounded bg-slate-50 flex items-center justify-center mb-1">
                    <span className="text-xs text-slate-300">Signature captured on device</span>
                  </div>
                )}
                <p className="text-sm text-slate-700">{report.clientPrintedName}</p>
              </div>
            </div>
          </SectionBlock>
        )}

        {/* Note about photos */}
        {report.photos.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 text-sm text-amber-700">
            <strong>{report.photos.length} photo{report.photos.length !== 1 ? "s" : ""}</strong> were attached to this report.
            Photos are not included in shared links — export the PDF to view them.
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-4">
          Shared read-only view · Generated by AV Cable Schedule Tool
        </p>
      </div>
    </div>
  );
}
