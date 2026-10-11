/*
 * AppNav — shared top navigation
 * Design: Clean Professional Dashboard — Multivrz branding
 * Cable schedule, connection rack, destination drops and consumables navigation
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { getSharedStatus, SHARED_STATUS_EVENT, type SharedStatus } from "@/lib/sharedSync";
import { activeSite } from "@/lib/sites";

const STATUS_TEXT: Record<SharedStatus, { label: string; title: string; dot: string }> = {
  local: { label: "This device", title: "Changes are saved in this browser only", dot: "bg-slate-400" },
  connecting: { label: "Connecting", title: "Connecting to shared data", dot: "bg-amber-400" },
  shared: { label: "Shared", title: "Changes are shared with everyone who has this page", dot: "bg-emerald-400" },
  "read-only": { label: "View only", title: "You can view shared data but your changes are not saved for others", dot: "bg-amber-400" },
};

function SharedBadge() {
  const [status, setStatus] = useState<SharedStatus>(getSharedStatus());
  useEffect(() => {
    const onStatus = (event: Event) => setStatus((event as CustomEvent<SharedStatus>).detail);
    window.addEventListener(SHARED_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SHARED_STATUS_EVENT, onStatus);
  }, []);
  const meta = STATUS_TEXT[status];
  return (
    <span title={meta.title} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <span className="hidden sm:inline">{meta.label}</span>
    </span>
  );
}

const LOGO_URL = "assets/dave_logo.png";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Cable Schedule",
    mobileLabel: "Schedule",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="2" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 5.5h13" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5 5.5v7.5" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    href: "/connection-rack",
    label: "Connection Rack",
    mobileLabel: "Rack",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="2" y="1" width="11" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4.5 4h6M4.5 7.5h6M4.5 11h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <circle cx="5.2" cy="4" r="0.55" fill="currentColor"/>
        <circle cx="5.2" cy="7.5" r="0.55" fill="currentColor"/>
        <circle cx="5.2" cy="11" r="0.55" fill="currentColor"/>
      </svg>
    ),
  },
  {
    href: "/destination-drops",
    label: "AV Drops",
    mobileLabel: "AV Drops",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M7.5 13s4.2-3.6 4.2-7.1A4.2 4.2 0 003.3 5.9C3.3 9.4 7.5 13 7.5 13z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <circle cx="7.5" cy="5.8" r="1.35" stroke="currentColor" strokeWidth="1.3"/>
      </svg>
    ),
  },
  {
    href: "/cctv-wifi",
    label: "CCTV & WAP",
    mobileLabel: "CCTV & WAP",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M2 4.5l7.5-2 1.2 4.3-7.5 2L2 4.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        <path d="M6 8.3L6.8 11M4 12.5h5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M11.5 9.5a2 2 0 012 2M11.3 11.6h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/power",
    label: "Power",
    mobileLabel: "Power",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <path d="M8.5 1.5L3.5 8.5h4l-1 5 5-7h-4l1-5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/consumables",
    label: "Consumables",
    mobileLabel: "Stock",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="1" y="3" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M5 7.5h5M7.5 5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/progress",
    label: "Progress",
    mobileLabel: "Progress",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
        <rect x="2" y="1.5" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4.5 5l1 1 2-2M4.5 9.5l1 1 2-2M9 5h1.5M9 9.5h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export default function AppNav() {
  const [location] = useLocation();

  return (
    <div className="bg-slate-900 flex items-center px-3 sm:px-4 h-12 shrink-0 border-b border-slate-700 overflow-x-auto">
      {/* Multivrz Logo */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 mr-2 sm:mr-6">
        <div className="flex items-center">
          <img
            src={LOGO_URL}
            alt="DAVE"
            className="h-8 w-8 rounded-sm object-contain"
            onError={(e) => {
              // No logo file published yet: drop the empty frame too.
              const frame = (e.target as HTMLImageElement).parentElement;
              if (frame) frame.style.display = 'none';
            }}
          />
        </div>
        <div className="hidden sm:block h-5 w-px bg-slate-600" />
        <span
          className="hidden sm:block text-slate-300 text-xs tracking-widest uppercase font-semibold"
          style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", letterSpacing: "0.12em" }}
        >
          Multivrz Cable Schedule
        </span>
        <Link href="/sites">
          <span
            title="Switch site or open the site library"
            className={`inline-flex max-w-[9rem] sm:max-w-[14rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
              location === "/sites" ? "border-cyan-500 bg-cyan-600 text-white" : "border-slate-600 bg-slate-800 text-slate-100 hover:border-cyan-500"
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 15 15" fill="none" className="shrink-0"><path d="M2 13.5V3l5-1.5v12M7 5.5h5.5v8M4 5h1M4 7.5h1M4 10h1M9.5 8h1M9.5 10.5h1M1 13.5h13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            <span className="truncate">{activeSite().name}</span>
            <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 opacity-70"><path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round"/></svg>
          </span>
        </Link>
        <SharedBadge />
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-2" />

      {/* Nav tabs */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {NAV_ITEMS.map(({ href, label, mobileLabel, icon }) => {
          const active = location === href;
          return (
            <Link key={href} href={href}>
              <span
                className={`inline-flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? "bg-cyan-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-700"
                }`}
                style={{ fontFamily: "'Barlow Semi Condensed', sans-serif", letterSpacing: "0.04em" }}
                >
                  {icon}
                <span className="lg:hidden">{mobileLabel}</span>
                <span className="hidden lg:inline">{label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
