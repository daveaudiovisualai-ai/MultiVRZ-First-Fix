/*
 * ProgressDonut — share of cables at each installation stage.
 * Stages are ordered, so colour is one sequential green ramp (light = early,
 * dark = complete) with neutral grey for "not started". Hover a slice or a
 * legend row for its count; the legend doubles as the table view.
 */
import { useState } from "react";

export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  colour: string;
}

const SIZE = 180;
const R = 70;
const STROKE = 26;
const C = 2 * Math.PI * R;
const GAP = 2; // surface gap between segments, in px along the ring

export default function ProgressDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const [hover, setHover] = useState<string | null>(null);
  const complete = slices[slices.length - 1]?.count ?? 0;
  const pct = total ? Math.round((complete / total) * 100) : 0;
  const active = slices.find((s) => s.key === hover);
  const visible = slices.filter((s) => s.count > 0);

  let offset = 0;
  const arcs = visible.map((slice) => {
    const length = (slice.count / Math.max(total, 1)) * C;
    const dash = visible.length > 1 ? Math.max(length - GAP, 0.5) : length;
    const arc = { slice, dash, offset };
    offset += length;
    return arc;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${pct}% of cables complete`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#e2e8f0" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map(({ slice, dash, offset: o }) => (
              <circle
                key={slice.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={slice.colour}
                strokeWidth={hover === slice.key ? STROKE + 6 : STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-o}
                opacity={hover && hover !== slice.key ? 0.45 : 1}
                onMouseEnter={() => setHover(slice.key)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: "stroke-width 120ms, opacity 120ms", cursor: "default" }}
              >
                <title>{`${slice.label}: ${slice.count} cable${slice.count === 1 ? "" : "s"} (${Math.round((slice.count / Math.max(total, 1)) * 100)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {active ? (
            <>
              <span className="text-2xl font-bold tabular-nums text-slate-900">{active.count}</span>
              <span className="max-w-[6.5rem] text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{active.label}</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold tabular-nums text-slate-900">{pct}%</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">complete</span>
            </>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1 text-sm sm:max-w-xs">
        {slices.map((slice) => (
          <li
            key={slice.key}
            onMouseEnter={() => setHover(slice.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded px-2 py-1 ${hover === slice.key ? "bg-slate-100" : ""}`}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: slice.colour }} />
            <span className="flex-1 text-slate-700">{slice.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{slice.count}</span>
            <span className="w-10 text-right text-xs tabular-nums text-slate-500">{total ? Math.round((slice.count / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
