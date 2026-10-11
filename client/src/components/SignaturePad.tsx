/*
 * SignaturePad — finger/mouse draw signature component
 * Uses the signature_pad library on a canvas element.
 * Outputs a base64 PNG data URL stored in report state.
 * Design: Clean Professional Dashboard
 */
import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";

interface Props {
  label: string;
  value: string;          // base64 PNG data URL or ""
  signerName?: string;    // printed name shown below the line
  onChange: (dataUrl: string) => void;
}

export default function SignaturePad({ label, value, signerName, onChange }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const padRef     = useRef<SignaturePadLib | null>(null);
  const [empty, setEmpty] = useState(!value);

  // Initialise signature_pad on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      penColor: "#1e293b",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 0.8,
      maxWidth: 2.5,
    });
    padRef.current = pad;

    // Resize canvas to match CSS size (handles HiDPI)
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      canvas.width  = w * ratio;
      canvas.height = h * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(ratio, ratio);
      pad.clear();
      // Re-draw saved signature if present
      if (value) {
        pad.fromDataURL(value, { width: w, height: h });
        setEmpty(false);
      }
    };

    resize();
    window.addEventListener("resize", resize);

    pad.addEventListener("endStroke", () => {
      setEmpty(pad.isEmpty());
      onChange(pad.toDataURL("image/png"));
    });

    return () => {
      window.removeEventListener("resize", resize);
      pad.off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setEmpty(true);
    onChange("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span
          className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", fontSize: "0.68rem" }}
        >
          {label}
        </span>
        {!empty && (
          <button
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Canvas area */}
      <div className="relative border border-border rounded-md overflow-hidden bg-white" style={{ height: 110 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          style={{ cursor: "crosshair" }}
        />
        {/* Placeholder hint */}
        {empty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-slate-300 select-none">
              Sign here with finger or mouse
            </span>
          </div>
        )}
        {/* Signature line */}
        <div className="absolute bottom-7 left-4 right-4 border-b border-slate-200 pointer-events-none" />
      </div>

      {/* Signer name */}
      {signerName && (
        <p className="text-xs text-muted-foreground text-center">{signerName}</p>
      )}
    </div>
  );
}
