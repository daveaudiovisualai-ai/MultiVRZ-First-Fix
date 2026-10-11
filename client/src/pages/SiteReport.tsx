/*
 * SiteReport — full site report form page
 * Design: Clean Professional Dashboard (matches cable schedule)
 *
 * Features:
 * 1. Auto-populate from Cable Schedule (via AppDataContext)
 * 2. Camera capture on mobile (capture="environment" on file input)
 * 3. Checklist template save/load (TemplateManager)
 * 4. Finger-draw signature pads (SignaturePad component)
 * 5. Share button — generates a read-only URL from encoded report data
 */
import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAppData } from "@/contexts/AppDataContext";
import TemplateManager from "@/components/TemplateManager";
import SignaturePad from "@/components/SignaturePad";
import { encodeReportToHash, buildShareUrlSimple } from "@/lib/shareReport";
import {
  createDefaultReport,
  VISIT_TYPES,
  OVERALL_STATUSES,
  ITEM_STATUSES,
  ITEM_STATUS_STYLE,
  OVERALL_STATUS_STYLE,
  type SiteReportData,
  type ReportSection,
  type ReportItem,
  type ReportItemStatus,
  type ReportPhoto,
} from "@/lib/reportTypes";
import { exportReportToPdf } from "@/lib/exportReportPdf";

const STORAGE_KEY = "av_site_report";

function load(): SiteReportData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return createDefaultReport();
}

function save(data: SiteReportData) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ── Sub-components ────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
      style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.68rem" }}
    >
      {children}
    </span>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-md overflow-hidden shadow-sm">
      <div
        className="bg-slate-800 px-4 py-2.5 flex items-center justify-between"
        style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
      >
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ChecklistSection({
  section,
  onChange,
  onAddItem,
  onDeleteItem,
  onRenameSection,
  onDeleteSection,
}: {
  section: ReportSection;
  onChange: (updated: ReportSection) => void;
  onAddItem: () => void;
  onDeleteItem: (itemId: string) => void;
  onRenameSection: (title: string) => void;
  onDeleteSection: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);

  const updateItem = (itemId: string, field: keyof ReportItem, value: string) => {
    onChange({
      ...section,
      items: section.items.map((it) =>
        it.id === itemId ? { ...it, [field]: value } : it
      ),
    });
  };

  return (
    <div className="bg-white border border-border rounded-md overflow-hidden shadow-sm">
      <div className="bg-slate-700 px-4 py-2 flex items-center gap-2">
        {editingTitle ? (
          <input
            autoFocus
            className="flex-1 bg-slate-600 text-white text-sm font-semibold rounded px-2 py-0.5 outline-none border border-slate-400"
            value={section.title}
            onChange={(e) => onRenameSection(e.target.value)}
            onBlur={() => setEditingTitle(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingTitle(false)}
          />
        ) : (
          <h3
            className="flex-1 text-white font-semibold text-sm uppercase tracking-wider cursor-pointer hover:text-blue-200 transition-colors"
            style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
            onClick={() => setEditingTitle(true)}
            title="Click to rename"
          >
            {section.title}
          </h3>
        )}
        <button
          onClick={onAddItem}
          className="text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Add item
        </button>
        <button
          onClick={onDeleteSection}
          className="text-slate-400 hover:text-red-300 transition-colors ml-1"
          title="Delete section"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2l9 9M11 2L2 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div
        className="grid grid-cols-[1fr_120px_1fr_32px] gap-2 px-3 py-1.5 bg-slate-50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
      >
        <span>Item Description</span>
        <span>Status</span>
        <span>Notes</span>
        <span></span>
      </div>

      {section.items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">
          No items — click "Add item" to add one.
        </div>
      ) : (
        section.items.map((item, idx) => (
          <div
            key={item.id}
            className={`grid grid-cols-[1fr_120px_1fr_32px] gap-2 px-3 py-2 items-start border-b border-border/50 ${
              idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"
            } group hover:bg-blue-50/40 transition-colors`}
          >
            <input
              className="cable-cell-input text-sm"
              value={item.description}
              placeholder="Item description…"
              onChange={(e) => updateItem(item.id, "description", e.target.value)}
            />
            <Select
              value={item.status}
              onValueChange={(v) => updateItem(item.id, "status", v)}
            >
              <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent px-0 focus:ring-0">
                <SelectValue>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ITEM_STATUS_STYLE[item.status]}`}
                  >
                    {item.status}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ITEM_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${ITEM_STATUS_STYLE[s]}`}
                    >
                      {s}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              className="cable-cell-input text-sm"
              value={item.notes}
              placeholder="Notes…"
              onChange={(e) => updateItem(item.id, "notes", e.target.value)}
            />
            <button
              onClick={() => onDeleteItem(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive mt-0.5"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Photo grid with camera capture ───────────────────────────────────────

function PhotoGrid({
  photos,
  onAdd,
  onCaptionChange,
  onDelete,
}: {
  photos: ReportPhoto[];
  onAdd: (photos: ReportPhoto[]) => void;
  onCaptionChange: (id: string, caption: string) => void;
  onDelete: (id: string) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const newPhotos: ReportPhoto[] = [];
    let loaded = 0;
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newPhotos.push({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          dataUrl: e.target?.result as string,
          caption: file.name.replace(/\.[^.]+$/, ""),
          timestamp: new Date().toISOString(),
        });
        loaded++;
        if (loaded === imageFiles.length) onAdd(newPhotos);
      };
      reader.readAsDataURL(file);
    });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => galleryRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-border rounded-md text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-blue-50/30 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="5.5" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M1 11l4-3.5 3 3 2.5-2.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Upload from Gallery
        </button>
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <button
          onClick={() => cameraRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-border rounded-md text-sm text-muted-foreground hover:border-primary hover:text-primary hover:bg-blue-50/30 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M1 5.5A1.5 1.5 0 012.5 4h1l1-2h5l1 2h1A1.5 1.5 0 0113 5.5v6A1.5 1.5 0 0111.5 13h-7A1.5 1.5 0 013 11.5v-6z" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8.5" r="2" stroke="currentColor" strokeWidth="1.3" />
          </svg>
          Take Photo
          <span className="text-xs text-slate-400">(mobile)</span>
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div
          className="flex-1 min-w-[180px] flex items-center justify-center border-2 border-dashed border-border/50 rounded-md px-3 py-2.5 text-xs text-muted-foreground"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
        >
          or drag & drop photos here
        </div>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="group relative rounded-md overflow-hidden border border-border shadow-sm"
            >
              <div className="relative">
                <img
                  src={photo.dataUrl}
                  alt={photo.caption}
                  className="w-full aspect-video object-cover"
                />
                <span className="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs font-bold rounded px-1.5 py-0.5">
                  {idx + 1}
                </span>
                <button
                  onClick={() => onDelete(photo.id)}
                  className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1 1l8 8M9 1L1 9" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="p-1.5 bg-white">
                <input
                  className="w-full text-xs text-slate-600 bg-transparent outline-none border-b border-transparent focus:border-primary"
                  value={photo.caption}
                  placeholder="Add caption…"
                  onChange={(e) => onCaptionChange(photo.id, e.target.value)}
                />
                <p className="text-xs text-slate-300 mt-0.5">
                  {new Date(photo.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <p className="text-xs text-center text-muted-foreground py-2">No photos added yet.</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function SiteReport() {
  const [report, setReport] = useState<SiteReportData>(load);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { cableSiteDetails } = useAppData();

  const update = useCallback((partial: Partial<SiteReportData>) => {
    setReport((prev) => {
      const next = { ...prev, ...partial };
      save(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      return next;
    });
  }, []);

  const field = (key: keyof SiteReportData) => ({
    value: report[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update({ [key]: e.target.value }),
  });

  // ── Auto-populate from Cable Schedule ──────────────────────────────────
  const handleAutoPopulate = () => {
    const hasData =
      cableSiteDetails.siteName || cableSiteDetails.jobNumber || cableSiteDetails.engineer;
    if (!hasData) {
      toast.error(
        "No data found on the Cable Schedule — fill in the site details there first."
      );
      return;
    }
    update({
      siteName:  cableSiteDetails.siteName  || report.siteName,
      jobNumber: cableSiteDetails.jobNumber || report.jobNumber,
      date:      cableSiteDetails.date      || report.date,
      engineer:  cableSiteDetails.engineer  || report.engineer,
      client:    cableSiteDetails.client    || report.client,
      revision:  cableSiteDetails.revision  || report.revision,
    });
    toast.success("Site details imported from Cable Schedule");
  };

  // ── Share report ────────────────────────────────────────────────────────
  const handleShare = async () => {
    setSharing(true);
    try {
      const hash = await encodeReportToHash(report);
      const url  = buildShareUrlSimple(hash);
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard!", {
        description: "Send this link to your client — it opens a read-only view of the report.",
        duration: 5000,
      });
    } catch {
      toast.error("Could not copy link — please try again");
    } finally {
      setSharing(false);
    }
  };

  // ── Section helpers ───────────────────────────────────────────────────
  const updateSection = (idx: number, updated: ReportSection) => {
    const sections = [...report.sections];
    sections[idx] = updated;
    update({ sections });
  };

  const addSection = () => {
    const uid = `${Date.now()}`;
    update({
      sections: [...report.sections, { id: uid, title: "New Section", items: [] }],
    });
  };

  const deleteSection = (idx: number) => {
    if (!window.confirm("Delete this section?")) return;
    update({ sections: report.sections.filter((_, i) => i !== idx) });
  };

  const addItem = (sectionIdx: number) => {
    const uid = `item-${Date.now()}`;
    const sections = [...report.sections];
    sections[sectionIdx] = {
      ...sections[sectionIdx],
      items: [
        ...sections[sectionIdx].items,
        { id: uid, description: "", status: "Pending" as ReportItemStatus, notes: "" },
      ],
    };
    update({ sections });
  };

  const deleteItem = (sectionIdx: number, itemId: string) => {
    const sections = [...report.sections];
    sections[sectionIdx] = {
      ...sections[sectionIdx],
      items: sections[sectionIdx].items.filter((it) => it.id !== itemId),
    };
    update({ sections });
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await exportReportToPdf(report);
      toast.success("PDF exported successfully");
    } catch (e) {
      toast.error("PDF export failed — please try again");
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    if (window.confirm("Reset report to blank? All data will be lost.")) {
      const fresh = createDefaultReport();
      setReport(fresh);
      save(fresh);
      toast.success("Report reset");
    }
  };

  const allItems = report.sections.flatMap((s) => s.items);
  const counts = { Pass: 0, Fail: 0, "N/A": 0, Pending: 0 };
  allItems.forEach((it) => {
    if (it.status in counts) counts[it.status as ReportItemStatus]++;
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-100">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="bg-primary sticky top-0 z-30 shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="shrink-0">
            <rect x="1" y="1" width="20" height="20" rx="3" stroke="white" strokeWidth="1.5" />
            <path d="M5 7h12M5 11h12M5 15h7" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h1
            className="text-white font-semibold tracking-wide"
            style={{
              fontFamily: "'Barlow Semi Condensed', sans-serif",
              fontSize: "1.05rem",
              letterSpacing: "0.06em",
            }}
          >
            AV SITE REPORT
          </h1>
          <span className="text-blue-200 text-xs font-medium tracking-widest uppercase hidden sm:block">
            Site Documentation Tool
          </span>
          <div className="flex-1" />
          <span className="text-xs text-blue-200 flex items-center gap-1">
            {saved ? (
              <>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" stroke="#86efac" strokeWidth="1.2" />
                  <path d="M3 5.5l1.5 1.5 3-3" stroke="#86efac" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-green-300">Saved</span>
              </>
            ) : (
              "Auto-saves"
            )}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReset}
            className="h-8 text-xs border-blue-300 text-blue-100 hover:bg-blue-700 bg-transparent"
          >
            Reset
          </Button>
          {/* Share button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleShare}
            disabled={sharing}
            className="h-8 text-xs gap-1.5 border-blue-300 text-blue-100 hover:bg-blue-700 bg-transparent"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="10" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="10" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="3" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.5 7.3l4 2.2M4.5 5.7l4-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {sharing ? "Generating…" : "Share"}
          </Button>
          <Button
            size="sm"
            onClick={handleExportPdf}
            disabled={exporting}
            className="h-8 text-xs gap-1.5 bg-white text-primary hover:bg-blue-50"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 9v2h9V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.5 1v7M4 6l2.5 2.5L9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Status summary bar */}
        <div className="bg-white border border-border rounded-md px-4 py-3 flex flex-wrap items-center gap-3">
          <span
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
          >
            Checklist Summary
          </span>
          {(["Pass", "Fail", "Pending", "N/A"] as ReportItemStatus[]).map((s) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${ITEM_STATUS_STYLE[s]}`}
            >
              {counts[s]} {s}
            </span>
          ))}
          <div className="flex-1" />
          {report.overallStatus && (
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${OVERALL_STATUS_STYLE[report.overallStatus]}`}
            >
              {report.overallStatus}
            </span>
          )}
        </div>

        {/* ── Site Details ─────────────────────────────────────────────── */}
        <SectionCard
          title="Site Details"
          action={
            <button
              onClick={handleAutoPopulate}
              className="flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition-colors font-medium"
              title="Import site name, job number, engineer and client from the Cable Schedule"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M2 6.5h9M7.5 3l3.5 3.5L7.5 10"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Import from Cable Schedule
            </button>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {[
              { key: "siteName",  label: "Site Name",  placeholder: "e.g. The Grand Hotel" },
              { key: "jobNumber", label: "Job Number", placeholder: "e.g. AV-2026-001" },
              { key: "date",      label: "Date",       type: "date" },
              { key: "visitType", label: "Visit Type", select: VISIT_TYPES },
              { key: "engineer",  label: "Engineer",   placeholder: "Your name" },
              { key: "revision",  label: "Revision",   placeholder: "A" },
            ].map(({ key, label, placeholder, type, select }) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                {select ? (
                  <Select
                    value={(report[key as keyof SiteReportData] as string) || "__placeholder__"}
                    onValueChange={(v) =>
                      update({ [key]: v === "__placeholder__" ? "" : v })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {select.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={type || "text"}
                    placeholder={placeholder}
                    className="h-9 text-sm"
                    {...field(key as keyof SiteReportData)}
                  />
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Client & Contact ─────────────────────────────────────────── */}
        <SectionCard title="Client & Contact">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
            {[
              { key: "client",       label: "Client / Company", placeholder: "e.g. Acme Events Ltd" },
              { key: "contactName",  label: "Contact Name",     placeholder: "e.g. John Smith" },
              { key: "contactPhone", label: "Phone",            placeholder: "+44 7700 900000", type: "tel" },
              { key: "contactEmail", label: "Email",            placeholder: "john@example.com", type: "email" },
              { key: "address",      label: "Site Address",     placeholder: "Full address", colSpan: true },
            ].map(({ key, label, placeholder, type, colSpan }) => (
              <div key={key} className={colSpan ? "col-span-2 sm:col-span-3" : ""}>
                <FieldLabel>{label}</FieldLabel>
                <Input
                  type={type || "text"}
                  placeholder={placeholder}
                  className="h-9 text-sm"
                  {...field(key as keyof SiteReportData)}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Overall Status & Summary ──────────────────────────────────── */}
        <SectionCard title="Overall Assessment">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel>Overall Status</FieldLabel>
              <Select
                value={report.overallStatus || "__placeholder__"}
                onValueChange={(v) =>
                  update({
                    overallStatus:
                      v === "__placeholder__"
                        ? ""
                        : (v as SiteReportData["overallStatus"]),
                  })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select status…" />
                </SelectTrigger>
                <SelectContent>
                  {OVERALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Executive Summary</FieldLabel>
              <Textarea
                placeholder="Brief summary of the site visit and key findings…"
                className="text-sm resize-none"
                rows={3}
                {...field("executiveSummary")}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Checklist Sections ───────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              className="text-base font-bold text-slate-700 uppercase tracking-wider"
              style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
            >
              Checklist Sections
            </h2>
            <div className="flex items-center gap-2">
              <TemplateManager
                currentSections={report.sections}
                onLoad={(sections) => {
                  update({ sections });
                  toast.success("Template loaded — all items reset to Pending");
                }}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={addSection}
                className="h-8 text-xs gap-1"
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Add Section
              </Button>
            </div>
          </div>

          {report.sections.map((section, idx) => (
            <ChecklistSection
              key={section.id}
              section={section}
              onChange={(updated) => updateSection(idx, updated)}
              onAddItem={() => addItem(idx)}
              onDeleteItem={(itemId) => deleteItem(idx, itemId)}
              onRenameSection={(title) => updateSection(idx, { ...section, title })}
              onDeleteSection={() => deleteSection(idx)}
            />
          ))}
        </div>

        {/* ── Comments ─────────────────────────────────────────────────── */}
        <SectionCard title="Comments & Recommendations">
          <div className="space-y-4">
            {[
              {
                key: "generalComments",
                label: "General Comments",
                placeholder: "General observations from the site visit…",
              },
              {
                key: "recommendations",
                label: "Recommendations",
                placeholder: "Recommended actions or improvements…",
              },
              {
                key: "followUpActions",
                label: "Follow-up Actions",
                placeholder: "Outstanding tasks, return visits, parts required…",
              },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <Label
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block"
                  style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.68rem" }}
                >
                  {label}
                </Label>
                <Textarea
                  placeholder={placeholder}
                  className="text-sm resize-none"
                  rows={3}
                  {...field(key as keyof SiteReportData)}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── Photos ───────────────────────────────────────────────────── */}
        <SectionCard title="Site Photos">
          <PhotoGrid
            photos={report.photos}
            onAdd={(newPhotos) => update({ photos: [...report.photos, ...newPhotos] })}
            onCaptionChange={(id, caption) =>
              update({
                photos: report.photos.map((p) =>
                  p.id === id ? { ...p, caption } : p
                ),
              })
            }
            onDelete={(id) =>
              update({ photos: report.photos.filter((p) => p.id !== id) })
            }
          />
        </SectionCard>

        {/* ── Sign-off with signature pads ─────────────────────────────── */}
        <SectionCard title="Sign-off">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Engineer */}
            <div className="space-y-3">
              <h3
                className="text-sm font-semibold text-slate-600"
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
              >
                Engineer Sign-off
              </h3>
              <div>
                <FieldLabel>Engineer Name</FieldLabel>
                <Input
                  className="h-9 text-sm"
                  value={report.engineer}
                  readOnly
                  placeholder="Auto-filled from site details"
                />
              </div>
              <SignaturePad
                label="Signature"
                value={report.engineerSignature}
                signerName={report.engineer || "Engineer"}
                onChange={(dataUrl) => update({ engineerSignature: dataUrl })}
              />
            </div>

            {/* Client */}
            <div className="space-y-3">
              <h3
                className="text-sm font-semibold text-slate-600"
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
              >
                Client Sign-off
              </h3>
              <div>
                <FieldLabel>Client Printed Name</FieldLabel>
                <Input
                  className="h-9 text-sm"
                  placeholder="Client's full name…"
                  {...field("clientPrintedName")}
                />
              </div>
              <SignaturePad
                label="Signature"
                value={report.clientSignature}
                signerName={report.clientPrintedName || "Client"}
                onChange={(dataUrl) => update({ clientSignature: dataUrl })}
              />
            </div>
          </div>
        </SectionCard>

        {/* Bottom export / share bar */}
        <div className="bg-white border border-border rounded-md px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {allItems.length} checklist items · {report.photos.length} photo
            {report.photos.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleShare}
              disabled={sharing}
              className="gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
                <circle cx="10" cy="2.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="10" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="3" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M4.5 7.3l4 2.2M4.5 5.7l4-2.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              {sharing ? "Generating link…" : "Copy Share Link"}
            </Button>
            <Button onClick={handleExportPdf} disabled={exporting} className="gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 10v2h10v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M7 1v8M4.5 6.5L7 9l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {exporting ? "Generating PDF…" : "Export PDF Report"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
