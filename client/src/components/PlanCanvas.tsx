/*
 * PlanCanvas — zoomable floor plan with clickable cable-drop markers.
 * Zoom: buttons, Ctrl/⌘ + scroll, or pinch on touch screens. Pan by scrolling/dragging.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Crosshair, Minus, Move, Plus, ScanSearch, Server, X } from "lucide-react";
import type { DestinationDrop, DrawingDocument } from "@/lib/destinationPlanner";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

export interface PlacedMarker {
  drop: DestinationDrop;
  x: number;
  y: number;
  placed: boolean;
  /** "rack" draws a yellow square instead of a numbered circle. */
  variant?: "drop" | "rack";
  /** Custom info-box content (used for the connection rack). */
  popupBody?: ReactNode;
  /** Marker fill colour (cable type). */
  colour?: string;
  /** Short text inside the marker instead of the cable count. */
  badge?: string;
  /** Extra content at the top of the info box (e.g. camera model). */
  popupExtra?: ReactNode;
  /** Eyebrow shown in the info box, e.g. "Power point". */
  kindLabel?: string;
}

function drawingKind(drawing?: DrawingDocument): "image" | "pdf" | "other" | "none" {
  if (!drawing) return "none";
  const name = drawing.fileName.toLowerCase();
  if (drawing.mimeType.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(name) || /\.(png|jpe?g|webp)$/.test(drawing.source)) return "image";
  if (drawing.mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  return "other";
}

function markerColour(drop: DestinationDrop) {
  if (drop.gopType === "2-way GOP") return "border-cyan-100 bg-cyan-500";
  if (drop.gopType === "4-way GOP" || drop.gopType === "Multiple 4-way GOP") return "border-violet-100 bg-violet-600";
  return "border-slate-100 bg-slate-600";
}

function statusDot(status: string) {
  return { Pending: "bg-slate-400", Installed: "bg-blue-500", Tested: "bg-emerald-500", Fault: "bg-red-500" }[status] ?? "bg-slate-400";
}

const POPUP_WIDTH = 288;

function DropPopup({
  marker,
  anchor,
  onClose,
  onMove,
  onCableAction,
  cableActionLabel,
}: {
  onCableAction?: (cableId: string) => void;
  cableActionLabel?: string;
  marker: PlacedMarker;
  /** Marker centre in the wrapper's pixel space, plus the wrapper size. */
  anchor: { x: number; y: number; width: number; height: number };
  onClose: () => void;
  onMove: () => void;
}) {
  const { drop } = marker;
  const width = Math.min(POPUP_WIDTH, anchor.width - 16);
  const left = Math.min(Math.max(8, anchor.x - width / 2), anchor.width - width - 8);
  const below = anchor.y < anchor.height * 0.5;
  const shown = drop.cables.slice(0, 6);
  return (
    <div
      role="dialog"
      aria-label={`${drop.label} details`}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-40 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-slate-800 shadow-2xl"
      style={{
        width,
        left,
        top: anchor.y,
        transform: below ? "translateY(18px)" : "translateY(calc(-100% - 18px))",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${marker.variant === "rack" ? "text-amber-700" : "text-cyan-700"}`}>{marker.kindLabel ?? (marker.variant === "rack" ? "Connection rack" : "Cable drop")}</p>
          <h3 className="mt-0.5 text-sm font-bold leading-5 text-slate-900">{drop.label}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      {marker.popupExtra}
      {marker.popupBody ?? (
        <>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          {drop.cableCount} cable{drop.cableCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-cyan-800">
          {drop.gopQuantity ? `${drop.gopQuantity} × ${drop.gopType}` : "No GOP"}
        </span>
        {!marker.placed && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-amber-800">Not placed yet</span>}
      </div>
      <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-100">
        {shown.map((cable) => (
          <li key={cable.id} className="flex items-start gap-2 px-2 py-1.5">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(cable.status)}`} />
            <div className="min-w-0 flex-1 text-[11px] leading-4">
              <p className="font-bold text-slate-800">
                Cable {cable.cableNumber} · {cable.cableType || cable.signalType || "Type TBC"}
              </p>
              <p className="text-slate-500">
                {cable.source || "Rack"} · {cable.status}
                {cable.length ? ` · ${cable.length}` : ""}
              </p>
            </div>
            {onCableAction && (
              <button
                type="button"
                onClick={() => onCableAction(cable.id)}
                className="shrink-0 self-center rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:border-cyan-500 hover:bg-cyan-50 hover:text-cyan-800"
              >
                {cableActionLabel ?? "Rack"} ›
              </button>
            )}
          </li>
        ))}
        {drop.cables.length > shown.length && (
          <li className="px-2 py-1.5 text-[11px] text-slate-500">+ {drop.cables.length - shown.length} more (see panel)</li>
        )}
      </ul>
      {drop.rackLocations.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Rack termination:</span> {drop.rackLocations.join(", ")}
        </p>
      )}
        </>
      )}
      <button
        type="button"
        onClick={onMove}
        className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Move className="h-3 w-3" /> {marker.placed ? "Move marker" : "Place on plan"}
      </button>
    </div>
  );
}

export default function PlanCanvas({
  drawing,
  markers,
  selectedDropId,
  placingDropLabel,
  onMarkerClick,
  onPlace,
  onCancelPlacing,
  onStartPlacing,
  onMoveMarker,
  toolbar,
  focusRequest,
  onCableAction,
  cableActionLabel,
  overlay,
  drawMode,
  onCanvasPoint,
  onDrawFinish,
  onAspect,
  modeBar,
}: {
  /** Extra layer drawn over the plan, under the markers (e.g. cable routes). */
  overlay?: ReactNode;
  /** While true, taps add points via onCanvasPoint instead of opening markers. */
  drawMode?: boolean;
  onCanvasPoint?: (x: number, y: number) => void;
  onDrawFinish?: () => void;
  /** Plan height / width once the image loads. */
  onAspect?: (ratio: number) => void;
  /** Bar shown above the plan (e.g. route drawing controls). */
  modeBar?: ReactNode;
  /** Open this marker's info box and zoom to it (nonce re-triggers). */
  focusRequest?: { id: string; nonce: number };
  /** Adds a button beside each cable in the info box. */
  onCableAction?: (cableId: string) => void;
  cableActionLabel?: string;
  drawing?: DrawingDocument;
  markers: PlacedMarker[];
  selectedDropId?: string;
  placingDropLabel?: string;
  onMarkerClick: (dropId: string) => void;
  onPlace: (x: number, y: number) => void;
  onCancelPlacing: () => void;
  onStartPlacing: (dropId: string) => void;
  /** Called continuously while a placed marker is dragged. */
  onMoveMarker: (dropId: string, x: number, y: number) => void;
  /** Placement controls shown directly above the plan. */
  toolbar?: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [popupId, setPopupId] = useState<string | null>(null);
  const anchor = useRef<{ fx: number; fy: number; rx: number; ry: number } | null>(null);
  const kind = drawingKind(drawing);

  // Zoom around a focal point (viewport coordinates), keeping that point still.
  const zoomTo = useCallback((next: number, focal?: { x: number; y: number }) => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    if (!viewport || !stage) return;
    const fx = focal?.x ?? viewport.clientWidth / 2;
    const fy = focal?.y ?? viewport.clientHeight / 2;
    anchor.current = {
      fx,
      fy,
      rx: (viewport.scrollLeft + fx) / stage.offsetWidth,
      ry: (viewport.scrollTop + fy) / stage.offsetHeight,
    };
    setZoom(clampZoom(next));
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const stage = stageRef.current;
    const a = anchor.current;
    if (!viewport || !stage || !a) return;
    viewport.scrollLeft = a.rx * stage.offsetWidth - a.fx;
    viewport.scrollTop = a.ry * stage.offsetHeight - a.fy;
    anchor.current = null;
  }, [zoom]);

  // Ctrl/⌘ + wheel (and trackpad pinch) zoom; pinch on touch screens.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let pinch: { dist: number; zoom: number } | null = null;
    const zoomRef = { current: zoom };
    zoomRef.current = zoom;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-event.deltaY * 0.01), { x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    const distance = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) pinch = { dist: distance(event.touches), zoom: zoomRef.current };
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const cx = (event.touches[0].clientX + event.touches[1].clientX) / 2 - rect.left;
      const cy = (event.touches[0].clientY + event.touches[1].clientY) / 2 - rect.top;
      zoomTo(pinch.zoom * (distance(event.touches) / pinch.dist), { x: cx, y: cy });
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchstart", onTouchStart, { passive: true });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    viewport.addEventListener("touchend", onTouchEnd);
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchstart", onTouchStart);
      viewport.removeEventListener("touchmove", onTouchMove);
      viewport.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoom, zoomTo]);

  // Drag to pan with a mouse when zoomed in.
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onMouseDown = (event: React.MouseEvent) => {
    const viewport = viewportRef.current;
    if (!viewport || event.button !== 0 || placingDropLabel) return;
    drag.current = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
  };
  const onMouseMove = (event: React.MouseEvent) => {
    const viewport = viewportRef.current;
    const d = drag.current;
    if (!viewport || !d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    viewport.scrollLeft = d.left - dx;
    viewport.scrollTop = d.top - dy;
  };
  const endDrag = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const onStageClick = (event: React.MouseEvent) => {
    if (drag.current?.moved) return;
    const stage = stageRef.current;
    if (!stage) return;
    if (drawMode && onCanvasPoint) {
      const rect = stage.getBoundingClientRect();
      onCanvasPoint(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
      return;
    }
    if (placingDropLabel) {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      onPlace(Math.min(99, Math.max(1, x)), Math.min(99, Math.max(1, y)));
      return;
    }
    setPopupId(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPopupId(null);
      if (placingDropLabel) onCancelPlacing();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placingDropLabel, onCancelPlacing]);

  // Drag a placed marker to reposition it; a tap without movement opens its info box.
  const markerDrag = useRef<{ id: string; x: number; y: number; moved: boolean; pointerId: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const stagePercent = (clientX: number, clientY: number) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: Math.min(99, Math.max(1, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(99, Math.max(1, ((clientY - rect.top) / rect.height) * 100)),
    };
  };
  const onMarkerPointerDown = (event: React.PointerEvent, marker: PlacedMarker) => {
    event.stopPropagation();
    if (drawMode) {
      onCanvasPoint?.(marker.x, marker.y);
      return;
    }
    if (placingDropLabel || event.button !== 0) return;
    markerDrag.current = { id: marker.drop.id, x: event.clientX, y: event.clientY, moved: false, pointerId: event.pointerId };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onMarkerPointerMove = (event: React.PointerEvent, marker: PlacedMarker) => {
    const d = markerDrag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.moved && Math.abs(event.clientX - d.x) + Math.abs(event.clientY - d.y) < 5) return;
    if (!marker.placed) return; // unplaced markers are placed with "Place on plan"
    if (!d.moved) {
      d.moved = true;
      setDraggingId(marker.drop.id);
      setPopupId(null);
      onMarkerClick(marker.drop.id);
    }
    const p = stagePercent(event.clientX, event.clientY);
    onMoveMarker(marker.drop.id, p.x, p.y);
  };
  const onMarkerPointerUp = (event: React.PointerEvent, marker: PlacedMarker) => {
    const d = markerDrag.current;
    markerDrag.current = null;
    setDraggingId(null);
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.moved) {
      onMarkerClick(marker.drop.id);
      setPopupId((current) => (current === marker.drop.id ? null : marker.drop.id));
    }
  };

  const popupMarker = markers.find((marker) => marker.drop.id === popupId);

  // Jump to a marker: zoom in around it, scroll it to the middle and open its info box.
  useEffect(() => {
    if (!focusRequest) return;
    const marker = markers.find((m) => m.drop.id === focusRequest.id);
    if (!marker) return;
    setPopupId(marker.drop.id);
    setZoom(2);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const viewport = viewportRef.current;
        const stage = stageRef.current;
        if (!viewport || !stage) return;
        viewport.scrollLeft = (marker.x / 100) * stage.offsetWidth - viewport.clientWidth / 2;
        viewport.scrollTop = (marker.y / 100) * stage.offsetHeight - viewport.clientHeight / 2;
        wrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const measurePopup = useCallback(() => {
    const wrapper = wrapperRef.current;
    const stage = stageRef.current;
    const viewport = viewportRef.current;
    if (!wrapper || !stage || !viewport || !popupMarker) {
      setPopupAnchor(null);
      return;
    }
    const w = wrapper.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const v = viewport.getBoundingClientRect();
    const x = s.left + (popupMarker.x / 100) * s.width - w.left;
    const y = s.top + (popupMarker.y / 100) * s.height - w.top;
    const vx = x + w.left, vy = y + w.top;
    // Hide the box while its marker is scrolled out of view.
    if (vx < v.left || vx > v.right || vy < v.top || vy > v.bottom) {
      setPopupAnchor(null);
      return;
    }
    setPopupAnchor({ x, y, width: w.width, height: v.height });
  }, [popupMarker]);
  useLayoutEffect(() => {
    measurePopup();
  }, [measurePopup, zoom]);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.addEventListener("scroll", measurePopup, { passive: true });
    window.addEventListener("resize", measurePopup);
    return () => {
      viewport.removeEventListener("scroll", measurePopup);
      window.removeEventListener("resize", measurePopup);
    };
  }, [measurePopup]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
          <button type="button" onClick={() => zoomTo(zoom / 1.4)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out" className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] border-x border-slate-200 px-2 text-center text-xs font-bold tabular-nums text-slate-700">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => zoomTo(zoom * 1.4)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" className="px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button type="button" onClick={() => zoomTo(1)} className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100">
          <ScanSearch className="h-3.5 w-3.5" /> Fit plan
        </button>
        <span className="hidden text-[11px] text-slate-500 sm:inline">Pinch, or hold Ctrl / ⌘ and scroll, to zoom. Drag the plan to move around; drag a marker to reposition it.</span>
      </div>

      {toolbar}

      {modeBar}

      {placingDropLabel && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs text-cyan-950">
          <span className="flex items-center gap-2 font-semibold">
            <Crosshair className="h-4 w-4 text-cyan-700" /> Tap the plan where “{placingDropLabel}” drops.
          </span>
          <button type="button" onClick={onCancelPlacing} className="rounded border border-cyan-300 bg-white px-2 py-0.5 font-semibold text-cyan-800 hover:bg-cyan-100">
            Cancel
          </button>
        </div>
      )}

      <div ref={wrapperRef} className="relative">
      <div
        ref={viewportRef}
        className={`relative max-h-[72vh] overflow-auto rounded-lg border border-slate-300 bg-slate-100 ${placingDropLabel || drawMode ? "cursor-crosshair" : zoom > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <div ref={stageRef} className="relative select-none" style={{ width: `${zoom * 100}%` }} onClick={onStageClick} onDoubleClick={(event) => { if (drawMode) { event.preventDefault(); onDrawFinish?.(); } }}>
          {kind === "image" && drawing ? (
            <img src={drawing.source} alt={drawing.fileName} draggable={false} className="block h-auto w-full bg-white" onLoad={(event) => { const img = event.currentTarget; if (img.naturalWidth) onAspect?.(img.naturalHeight / img.naturalWidth); }} />
          ) : kind === "pdf" && drawing ? (
            <div className="relative aspect-[1.414/1] w-full bg-white">
              <object data={drawing.source} type="application/pdf" className="pointer-events-none absolute inset-0 h-full w-full">
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">
                  This PDF can't be shown here. Export the plan as a PNG or JPG and upload that instead.
                </div>
              </object>
            </div>
          ) : (
            <div className="relative aspect-[16/10] w-full bg-[linear-gradient(90deg,rgba(148,163,184,0.25)_1px,transparent_1px),linear-gradient(rgba(148,163,184,0.25)_1px,transparent_1px)] bg-[size:24px_24px]">
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">
                {kind === "other" ? "DWG / DXF files can't be displayed. Upload the plan as a PNG, JPG or PDF." : "Upload a floor plan to place cable drops on it."}
              </div>
            </div>
          )}

          {overlay}

          <div className="pointer-events-none absolute inset-0 z-20" aria-label="Cable drop markers">
            {markers.map((marker) => {
              const selected = marker.drop.id === selectedDropId;
              return (
                <button
                  key={marker.drop.id}
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => onMarkerPointerDown(event, marker)}
                  onPointerMove={(event) => onMarkerPointerMove(event, marker)}
                  onPointerUp={(event) => onMarkerPointerUp(event, marker)}
                  onPointerCancel={() => {
                    markerDrag.current = null;
                    setDraggingId(null);
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    // Keyboard activation (mouse and touch are handled by the pointer events).
                    if (event.detail !== 0 || placingDropLabel) return;
                    onMarkerClick(marker.drop.id);
                    setPopupId((current) => (current === marker.drop.id ? null : marker.drop.id));
                  }}
                  title={marker.drop.label}
                  aria-label={`Cable drop ${marker.drop.label}`}
                  className={`pointer-events-auto absolute z-20 flex -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center border-2 font-bold shadow-lg ${draggingId === marker.drop.id ? "scale-125 cursor-grabbing" : "transition-transform duration-150 hover:scale-125"} ${marker.placed ? "cursor-grab" : "border-dashed opacity-70"} ${marker.variant === "rack" ? `rounded-md border-amber-100 bg-amber-400 text-amber-950 ${selected ? "z-30 h-8 w-8 ring-4 ring-amber-300/70" : "h-6 w-6"}` : `rounded-full border-white text-white ${marker.colour ? "" : markerColour(marker.drop)} ${selected ? "z-30 h-7 w-7 text-[10px] ring-4 ring-slate-900/40" : marker.badge ? (marker.badge.length <= 2 ? "h-6 w-6 text-[10px]" : "h-6 w-6 text-[7px]") : "h-5 w-5 text-[8px]"}`}`}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%`, ...(marker.colour && marker.variant !== "rack" ? { backgroundColor: marker.colour } : {}) }}
                >
                  {marker.variant === "rack" ? <Server className={selected ? "h-4 w-4" : "h-3.5 w-3.5"} /> : marker.badge ?? marker.drop.cableCount}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {popupMarker && popupAnchor && !placingDropLabel && !draggingId && (
        <DropPopup
          marker={popupMarker}
          anchor={popupAnchor}
          onClose={() => setPopupId(null)}
          onCableAction={onCableAction}
          cableActionLabel={cableActionLabel}
          onMove={() => {
            setPopupId(null);
            onStartPlacing(popupMarker.drop.id);
          }}
        />
      )}
      </div>
    </div>
  );
}
