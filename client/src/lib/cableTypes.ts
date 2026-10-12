// AV Cable Schedule — Data types and helpers

export type CableStatus = "Pending" | "Installed" | "Tested" | "Fault";

export type SignalType =
  | "HDMI"
  | "SDI"
  | "XLR (Audio)"
  | "XLR (DMX)"
  | "DMX"
  | "DALI"
  | "Cat6"
  | "Cat6A"
  | "Fibre"
  | "VGA"
  | "DisplayPort"
  | "USB"
  | "Speakon"
  | "RJ45"
  | "Coax"
  | "Dante/AoIP"
  | "Other";

export type CableType =
  | "HDMI 2.0"
  | "HDMI 2.1"
  | "SDI (75Ω)"
  | "HD-SDI"
  | "3G-SDI"
  | "12G-SDI"
  | "XLR 3-Pin"
  | "XLR 5-Pin"
  | "Cat6 UTP"
  | "Cat6 STP"
  | "Cat6A UTP"
  | "Cat6A STP"
  | "FST"
  | "VGA"
  | "DisplayPort 1.4"
  | "USB-C"
  | "USB-A"
  | "Twin Speaker"
  | "RG6 Coax"
  | "RG59 Coax"
  | "Other";

export interface CableRow {
  id: string;
  cableNumber: string;
  cableType: string;
  signalType: string;
  source: string;
  destination: string;
  length: string;
  patchLocation: string;
  status: CableStatus;
  notes: string;
  /**
   * Fixed rack position, e.g. "network-4:18" or "audio-01:9" (panel id : port).
   * "none" = not terminated on the rack (e.g. a speaker-to-speaker link).
   * Blank = allocated automatically.
   */
  rackPort?: string;
  /**
   * Outlet at the remote end (GOP box, network plate or field plug), e.g. "GOP-CI1-01".
   * Cables with the same outlet share one box. Unset = the site's outlet register;
   * blank = no shared outlet.
   */
  outlet?: string;
  /** Patch lead from the 47U rack switch to this cable's 12U rack port. */
  patchLeadColour?: string;
  patchLeadLength?: string;
  /** Leads needed at the destination end (part numbers). */
  destPatchCable?: string;
  destHdmi?: string;
  destUsb?: string;
  destPatchLength?: string;
  destHdmiLength?: string;
  destUsbLength?: string;
}

export interface SiteDetails {
  siteName: string;
  jobNumber: string;
  date: string;
  engineer: string;
  client: string;
  revision: string;
}

export const CABLE_TYPES: CableType[] = [
  "HDMI 2.0", "HDMI 2.1", "SDI (75Ω)", "HD-SDI", "3G-SDI", "12G-SDI",
  "XLR 3-Pin", "XLR 5-Pin", "Cat6 UTP", "Cat6 STP", "Cat6A UTP", "Cat6A STP",
  "FST", "VGA", "DisplayPort 1.4",
  "USB-C", "USB-A",   "Twin Speaker", "RG6 Coax", "RG59 Coax", "Other",
];

export const SIGNAL_TYPES: SignalType[] = [
  "HDMI", "SDI", "XLR (Audio)", "XLR (DMX)", "DMX", "DALI", "Cat6", "Cat6A",
  "Fibre", "VGA", "DisplayPort", "USB", "Speakon", "RJ45", "Coax", "Dante/AoIP", "Other",
];

export const STATUS_OPTIONS: CableStatus[] = ["Pending", "Installed", "Tested", "Fault"];

export const STATUS_CLASS: Record<CableStatus, string> = {
  Pending:   "status-pending",
  Installed: "status-installed",
  Tested:    "status-tested",
  Fault:     "status-fault",
};

export function createEmptyRow(index: number): CableRow {
  return {
    id: `cable-${Date.now()}-${index}`,
    cableNumber: String(index + 1).padStart(3, "0"),
    cableType: "",
    signalType: "",
    source: "",
    destination: "",
    length: "",
    patchLocation: "",
    status: "Pending",
    notes: "",
  };
}

export function createInitialRows(count = 100): CableRow[] {
  return Array.from({ length: count }, (_, i) => createEmptyRow(i));
}

export const defaultSiteDetails: SiteDetails = {
  siteName: "",
  jobNumber: "",
  date: new Date().toISOString().split("T")[0],
  engineer: "",
  client: "",
  revision: "A",
};
