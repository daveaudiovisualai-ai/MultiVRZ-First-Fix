import { confirmAction } from "@/lib/confirmAction";
/*
 * TemplateManager — dialog for saving current sections as a template
 * and loading built-in or saved templates.
 * Design: Clean Professional Dashboard
 */
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  BUILT_IN_TEMPLATES,
  type ReportTemplate,
} from "@/lib/reportTemplates";
import type { ReportSection } from "@/lib/reportTypes";

interface Props {
  currentSections: ReportSection[];
  onLoad: (sections: ReportSection[]) => void;
}

function TemplateCard({
  name,
  description,
  sectionCount,
  itemCount,
  isBuiltIn,
  onLoad,
  onDelete,
}: {
  name: string;
  description: string;
  sectionCount: number;
  itemCount: number;
  isBuiltIn?: boolean;
  onLoad: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="border border-border rounded-md p-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm text-slate-800" style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            {name}
          </span>
          {isBuiltIn && (
            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">
              Built-in
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">{description}</p>
        <p className="text-xs text-slate-400">
          {sectionCount} section{sectionCount !== 1 ? "s" : ""} · {itemCount} item{itemCount !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" onClick={onLoad} className="h-7 text-xs">
          Load
        </Button>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            title="Delete template"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3h9M5 3V2h3v1M4 3v7a1 1 0 001 1h3a1 1 0 001-1V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default function TemplateManager({ currentSections, onLoad }: Props) {
  const [open, setOpen] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<ReportTemplate[]>(loadTemplates);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [tab, setTab] = useState<"load" | "save">("load");

  const handleLoad = (sections: ReportSection[], name: string) => {
    // Re-generate IDs to avoid collisions
    const fresh = sections.map((s) => ({
      ...s,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      items: s.items.map((it) => ({
        ...it,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: "Pending" as const,
        notes: "",
      })),
    }));
    onLoad(fresh);
    setOpen(false);
    toast.success(`Template "${name}" loaded`);
  };

  const handleSave = () => {
    if (!saveName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    saveTemplate(saveName.trim(), saveDesc.trim(), currentSections);
    setSavedTemplates(loadTemplates());
    setSaveName("");
    setSaveDesc("");
    setTab("load");
    toast.success(`Template "${saveName.trim()}" saved`);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await confirmAction(`Delete template "${name}"?`)) return;
    deleteTemplate(id);
    setSavedTemplates(loadTemplates());
    toast.success("Template deleted");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M4 4h5M4 6.5h5M4 9h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Templates
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
            Checklist Templates
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border mb-3">
          {(["load", "save"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}
            >
              {t === "load" ? "Load Template" : "Save Current"}
            </button>
          ))}
        </div>

        {tab === "load" ? (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {/* Built-in templates */}
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
              style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
              Built-in Templates
            </p>
            {BUILT_IN_TEMPLATES.map((tpl, i) => (
              <TemplateCard
                key={i}
                name={tpl.name}
                description={tpl.description}
                sectionCount={tpl.sections.length}
                itemCount={tpl.sections.reduce((a, s) => a + s.items.length, 0)}
                isBuiltIn
                onLoad={() => handleLoad(tpl.sections, tpl.name)}
              />
            ))}

            {/* Saved templates */}
            {savedTemplates.length > 0 && (
              <>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1"
                  style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                  Your Saved Templates
                </p>
                {savedTemplates.map((tpl) => (
                  <TemplateCard
                    key={tpl.id}
                    name={tpl.name}
                    description={tpl.description || `Saved ${new Date(tpl.createdAt).toLocaleDateString()}`}
                    sectionCount={tpl.sections.length}
                    itemCount={tpl.sections.reduce((a, s) => a + s.items.length, 0)}
                    onLoad={() => handleLoad(tpl.sections, tpl.name)}
                    onDelete={() => handleDelete(tpl.id, tpl.name)}
                  />
                ))}
              </>
            )}

            {savedTemplates.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                No saved templates yet. Use the "Save Current" tab to save your checklist layout.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Save your current checklist sections ({currentSections.length} section{currentSections.length !== 1 ? "s" : ""}, {currentSections.reduce((a, s) => a + s.items.length, 0)} items) as a reusable template.
            </p>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1"
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                Template Name *
              </label>
              <Input
                placeholder="e.g. My Standard Commissioning"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1"
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif" }}>
                Description (optional)
              </label>
              <Input
                placeholder="Brief description of when to use this template…"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <Button onClick={handleSave} className="w-full gap-2">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M2 10.5V3a1 1 0 011-1h5.5L11 4.5V10.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 12V8h5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 2v3h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Save Template
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
