import { buildRackPlan, MIN_NETWORK_PANELS } from "./rackPlanner";
import { defaultSiteDetails } from "./cableTypes";
import type { CableRow } from "./cableTypes";
import { FIBRE_PROVISION } from "./fibreProvision";
import { buildDestinationDrops } from "./destinationPlanner";
import { leadKindOf } from "./patchLeads";

export type MaterialStatus = "Specified" | "Ordered" | "Delivered" | "Installed" | "Surplus";
export type MaterialCategory = "Rack" | "Patch Panel" | "Keystone" | "Network Cable" | "GOP Box" | "Patch Lead" | "AV Lead" | "Speaker Cable" | "Speaker Connector" | "DMX Cable" | "DMX Connector" | "Containment" | "Fibre" | "Labelling" | "Other";

export interface MaterialItem {
  id: string;
  source: "calculated" | "manual";
  category: MaterialCategory;
  description: string;
  partNumber: string;
  specification: string;
  qty: number;
  unit: string;
  supplier: string;
  productLink: string;
  imageUrl: string;
  status: MaterialStatus;
  notes: string;
  required: boolean;
  /** Cable sold on drums: total metres needed (before wastage) and drum length. */
  metres?: number;
  drumLength?: number;
  wastagePercent?: number;
}

/** Drums needed for a cable item, including wastage. */
export function drumsFor(item: Pick<MaterialItem, "metres" | "drumLength" | "wastagePercent">) {
  if (!item.metres || !item.drumLength) return 0;
  return Math.ceil((item.metres * (1 + (item.wastagePercent ?? 20) / 100)) / item.drumLength);
}

export interface EndpointDrop {
  id: string;
  cableNumber: string;
  endpointType: "Network Point" | "GOP Box" | "Speaker" | "DMX / DALI" | "Fibre";
  location: string;
  rackLocation: string;
  cableType: string;
  signalType: string;
  length: string;
  boxRequirement: "None" | "2-way GOP" | "4-way GOP" | "TBC";
  notes: string;
  status: CableRow["status"];
}

export interface ConsumablesPlan {
  materials: MaterialItem[];
  endpoints: EndpointDrop[];
  summary: {
    scheduleRows: number;
    networkDrops: number;
    speakerDrops: number;
    dmxDrops: number;
    fibreDrops: number;
    networkLength: number;
    pendantSpeakerLength: number;
    subSpeakerLength: number;
    speakerLength: number;
    dmxLength: number;
    networkLocations: number;
    speakerPoints: number;
    dmxPoints: number;
    gopBoxes: number;
    patchLeads: number;
    missingLengths: { network: number; speaker: number; dmx: number };
    estimatedRuns: number;
  };
}

const EXCEL = "Excel Networking";

export const OFFICIAL_PRODUCT_LINKS = {
  panelFrame: "https://excel-networking.com/catalogue/product/100-095",
  keystone: "https://excel-networking.com/catalogue/product/100-181",
  gop2: "https://excel-networking.com/catalogue/product/350-639",
  gop4: "https://excel-networking.com/catalogue/product/350-640",
  wallRack: "https://excel-networking.com/catalogue/product/WB12.390SG-BK",
  cat6: "https://excel-networking.com/catalogue/product/100-071",
  cat6a: "https://excel-networking.com/catalogue/product/190-191-305M",
};

const NETWORK_TERMS = ["cat", "network", "rj45", "dante", "aoip"];
const DMX_TERMS = ["dmx", "dali", "xlr 5", "5-pin", "5 pin"];
const SPEAKER_TERMS = ["speaker", "audio", "xlr 3", "3-pin", "3 pin", "speakon"];
const FIBRE_TERMS = ["fibre", "fiber", "samsung led"];

function aggregate(cable: CableRow) {
  return `${cable.cableType} ${cable.signalType} ${cable.source} ${cable.destination} ${cable.notes}`.toLowerCase();
}

function includesAny(value: string, values: string[]) {
  return values.some((term) => value.includes(term));
}

function parseMetres(value: string) {
  const matched = value.match(/[0-9]+(?:\.[0-9]+)?/);
  return matched ? Number(matched[0]) : 0;
}

function roundedUp(value: number, packSize: number) {
  return value ? Math.ceil(value / packSize) : 0;
}

function product(
  id: string,
  category: MaterialCategory,
  description: string,
  partNumber: string,
  specification: string,
  qty: number,
  unit: string,
  productLink: string,
  notes = "",
  required = true,
  supplier = EXCEL,
): MaterialItem {
  return {
    id,
    source: "calculated",
    category,
    description,
    partNumber,
    specification,
    qty,
    unit,
    supplier,
    productLink,
    imageUrl: "",
    status: "Specified",
    notes,
    required,
  };
}

function isFibre(cable: CableRow) {
  return /fibre|fiber/.test(`${cable.cableType} ${cable.signalType}`.toLowerCase()) || (cable.rackPort ?? "").startsWith("fibre");
}

function isDmx(cable: CableRow) {
  if (isFibre(cable)) return false;
  return (cable.rackPort ?? "").startsWith("dmx") || leadKindOf(cable) === "dmx" || includesAny(`${cable.cableType} ${cable.signalType}`.toLowerCase(), DMX_TERMS);
}

function isSpeaker(cable: CableRow) {
  if (isFibre(cable) || isDmx(cable)) return false;
  return (cable.rackPort ?? "").startsWith("audio") || leadKindOf(cable) === "speaker" || includesAny(`${cable.cableType} ${cable.signalType}`.toLowerCase(), SPEAKER_TERMS);
}

function isNetwork(cable: CableRow) {
  if (isFibre(cable) || isDmx(cable) || isSpeaker(cable)) return false;
  return (cable.rackPort ?? "").startsWith("network") || includesAny(aggregate(cable), NETWORK_TERMS);
}

/** Terminates on the connection rack (rather than speaker-to-speaker etc.). */
function onRack(cable: CableRow) {
  return Boolean(cable.rackPort) ? cable.rackPort !== "none" : true;
}

function hasLength(cable: CableRow) {
  return parseMetres(cable.length || "") > 0;
}

function fmtLen(value?: string) {
  const m = parseMetres(value || "");
  return m ? `${m} m` : "length TBC";
}

/** Group cables by a key and count them. */
function groupCount<T extends string>(cables: CableRow[], key: (c: CableRow) => T | null) {
  const map = new Map<T, CableRow[]>();
  cables.forEach((c) => {
    const k = key(c);
    if (k === null) return;
    map.set(k, [...(map.get(k) ?? []), c]);
  });
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
}

function cableList(cables: CableRow[], max = 8) {
  const nums = cables.map((c) => c.cableNumber).filter(Boolean);
  return nums.length > max ? `${nums.slice(0, max).join(", ")} +${nums.length - max} more` : nums.join(", ");
}

function displayLocation(cable: CableRow) {
  return cable.destination.trim() || cable.source.trim() || "Location to be confirmed";
}

function gopRequirement(cable: CableRow): EndpointDrop["boxRequirement"] {
  const value = aggregate(cable);
  if (!isNetwork(cable)) return "None";
  if (value.includes("gop 4") || value.includes("4-way") || value.includes("4 way")) return "4-way GOP";
  return "2-way GOP";
}

function endpointFromCable(cable: CableRow): EndpointDrop | null {
  if (isFibre(cable)) {
    return {
      id: `endpoint-${cable.id}`,
      cableNumber: cable.cableNumber,
      endpointType: "Fibre",
      location: displayLocation(cable),
      rackLocation: cable.patchLocation,
      cableType: cable.cableType,
      signalType: cable.signalType,
      length: cable.length,
      boxRequirement: "TBC",
      notes: cable.notes,
      status: cable.status,
    };
  }

  if (isDmx(cable)) {
    return {
      id: `endpoint-${cable.id}`,
      cableNumber: cable.cableNumber,
      endpointType: "DMX / DALI",
      location: displayLocation(cable),
      rackLocation: cable.patchLocation,
      cableType: cable.cableType,
      signalType: cable.signalType,
      length: cable.length,
      boxRequirement: "None",
      notes: cable.notes,
      status: cable.status,
    };
  }

  if (isSpeaker(cable)) {
    return {
      id: `endpoint-${cable.id}`,
      cableNumber: cable.cableNumber,
      endpointType: "Speaker",
      location: displayLocation(cable),
      rackLocation: onRack(cable) ? cable.patchLocation || "Connection rack" : `Linked from ${cable.source}`,
      cableType: cable.cableType,
      signalType: cable.signalType,
      length: cable.length,
      boxRequirement: "None",
      notes: cable.notes,
      status: cable.status,
    };
  }

  if (isNetwork(cable)) {
    return {
      id: `endpoint-${cable.id}`,
      cableNumber: cable.cableNumber,
      endpointType: "GOP Box",
      location: displayLocation(cable),
      rackLocation: cable.patchLocation,
      cableType: cable.cableType,
      signalType: cable.signalType,
      length: cable.length,
      boxRequirement: gopRequirement(cable),
      notes: cable.notes,
      status: cable.status,
    };
  }

  return null;
}

/** Estimated run length (m) for a cable without one in the schedule, e.g. measured from the floor plan. */
export type LengthEstimator = (cable: CableRow) => number | null;

export function buildConsumablesPlan(cables: CableRow[], estimate?: LengthEstimator): ConsumablesPlan {
  const network = cables.filter(isNetwork);
  const speaker = cables.filter(isSpeaker);
  const dmx = cables.filter(isDmx);
  const fibre = cables.filter(isFibre);

  // Network drops are grouped by destination, exactly as on the AV Drops page.
  const drops = buildDestinationDrops(cables).filter((d) => d.networkCableCount > 0);
  const gopByDestination = new Map(drops.map((d) => [d.label.trim().toLowerCase(), d.gopType]));
  const endpoints = cables
    .map(endpointFromCable)
    .filter((endpoint): endpoint is EndpointDrop => Boolean(endpoint))
    .map((endpoint) => {
      if (endpoint.endpointType !== "GOP Box") return endpoint;
      const gop = gopByDestination.get(endpoint.location.trim().toLowerCase());
      return { ...endpoint, boxRequirement: gop === "4-way GOP" || gop === "Multiple 4-way GOP" ? "4-way GOP" : "2-way GOP" } as EndpointDrop;
    });
  const twoWayGop = drops.filter((d) => d.gopType === "2-way GOP").reduce((n, d) => n + d.gopQuantity, 0);
  const fourWayGop = drops.filter((d) => d.gopType !== "2-way GOP").reduce((n, d) => n + d.gopQuantity, 0);

  const sumLength = (list: CableRow[]) => list.reduce((sum, cable) => sum + parseMetres(cable.length || ""), 0);
  const networkLength = sumLength(network);
  const speakerLength = sumLength(speaker);
  const dmxLength = sumLength(dmx);
  const missing = (list: CableRow[]) => list.filter((c) => !hasLength(c)).length;
  const unmeasured = (list: CableRow[]) => list.filter((c) => !hasLength(c) && (estimate?.(c) ?? null) === null).length;
  const lengthNote = (list: CableRow[], total: number, what: string) => {
    const gaps = missing(list);
    return gaps
      ? `${total} m from ${list.length - gaps} of ${list.length} ${what} with a length in the schedule; ${gaps} still need a length (${cableList(list.filter((c) => !hasLength(c)))}).`
      : `${total} m across ${list.length} ${what}.`;
  };

  /** Metres for a set of cables: schedule length where given, otherwise the plan estimate. */
  const runMetres = (list: CableRow[]) => {
    let fromSchedule = 0, fromPlan = 0, planCount = 0, unknown: CableRow[] = [];
    list.forEach((c) => {
      const len = parseMetres(c.length || "");
      if (len) { fromSchedule += len; return; }
      const est = estimate?.(c) ?? null;
      if (est !== null) { fromPlan += est; planCount += 1; } else unknown.push(c);
    });
    const total = Math.round(fromSchedule + fromPlan);
    const parts = [
      fromSchedule ? `${Math.round(fromSchedule)} m from ${list.length - planCount - unknown.length} schedule lengths` : "",
      planCount ? `${Math.round(fromPlan)} m estimated from the floor plan for ${planCount} runs (rack → drop along right-angle routes +10%, plus 7 m for rack rise, drop and termination)` : "",
      unknown.length ? `${unknown.length} runs have no length and no plan position (${cableList(unknown)})` : "",
    ].filter(Boolean);
    return { total, note: parts.join("; ") + "." };
  };
  const drumItem = (id: string, category: MaterialCategory, description: string, partNumber: string, specification: string, list: CableRow[], drumLength: number, link: string, supplier: string) => {
    const { total, note } = runMetres(list);
    const item = product(id, category, description, partNumber, specification, 0, `${drumLength} m drums`, link,
      `${total} m needed across ${list.length} runs + 20% wastage. ${note}`, true, supplier);
    item.metres = total;
    item.drumLength = drumLength;
    item.wastagePercent = 20;
    item.qty = drumsFor(item);
    return item;
  };

  const pendantSpeaker = speaker.filter((cable) => /pendant/i.test(aggregate(cable)));
  const subSpeaker = speaker.filter((cable) => /subwoofer|\bsub\b/i.test(aggregate(cable)));
  const generalSpeaker = speaker.filter((c) => !pendantSpeaker.includes(c) && !subSpeaker.includes(c));
  const pendantSpeakerLength = sumLength(pendantSpeaker);
  const subSpeakerLength = sumLength(subSpeaker);

  const networkOnRack = network.filter(onRack);
  const speakerOnRack = speaker.filter((c) => (c.rackPort ?? "").startsWith("audio") || (onRack(c) && !c.rackPort));
  const dmxOnRack = dmx.filter(onRack);
  // Rack hardware is counted from the Connection Rack layout itself.
  const rack = buildRackPlan(cables, defaultSiteDetails, false);
  const panelsOf = (kind: string) => rack.panels.filter((p) => p.kind === kind);
  const portsOf = (connector: string) => rack.panels.flatMap((p) => (p.ports ?? []).filter((port) => port.connector === connector));
  const usedPorts = (connector: string) => portsOf(connector).filter((port) => port.circuit && !port.circuit.planned).length;
  const networkPanels = Math.max(MIN_NETWORK_PANELS, panelsOf("network").length);
  const speakerPanels = panelsOf("speaker").length;
  const dmxPanels = panelsOf("dmx").length;
  const speakonPositions = portsOf("speakon").length;
  const xlrPositions = portsOf("xlr5").length;
  const speakonUsed = usedPorts("speakon");
  const xlrUsed = usedPorts("xlr5");
  const keystonePositions = networkPanels * 24;

  const materials: MaterialItem[] = [
    product(
      "excel-wall-rack",
      "Rack",
      "Excel WR390 Wall Rack Network Data Cabinet 15U 390 mm Deep Black",
      "TBC (12U was WB12.390SG-BK)",
      "15U, 390 mm deep, 19-inch wall rack to suit 5 keystone panels plus audio, DMX, fibre and lighting panels. Confirm the 15U part number before ordering.",
      1,
      "rack",
      OFFICIAL_PRODUCT_LINKS.wallRack,
      "Site connection rack (the 12U rack the patch leads run to from the 47U equipment rack).",
    ),
  ];

  // ── Network cabling and drops ───────────────────────────────────────────
  if (network.length) {
    materials.push(
      product("excel-panel-frame", "Patch Panel", "Excel Unloaded 24 Port Keystone Patch Panel Frame 1U Black", "100-095",
        "1U black 19-inch panel for 24 modules; rear cable management, hinged label holder and earthing kit.",
        networkPanels, "panels", OFFICIAL_PRODUCT_LINKS.panelFrame,
        `${networkPanels} × 1U 24-port keystone panels on the Connection Rack (${keystonePositions} positions, ${networkOnRack.length} used, ${keystonePositions - networkOnRack.length} spare).`),
      product("excel-keystone", "Keystone", "Excel Cat6A FTP Screened Low Profile Keystone Jack Toolless Silver", "100-181",
        "Toolless screened Cat6A FTP RJ45 8(8) keystone; 360° shielded; supports 10 Gigabit Ethernet.",
        networkOnRack.length * 2, "jacks", OFFICIAL_PRODUCT_LINKS.keystone,
        `Two per network cable: ${networkOnRack.length} at the rack panels and ${networkOnRack.length} in the GOP boxes at the drops.`),
      drumItem("excel-cat6a-cable", "Network Cable", "Cat6A shielded installation cable (Excel U/FTP LSOH, 305 m box)", "190-191-305M",
        "Solid copper AWG23 Cat6A U/FTP shielded, LSOH, B2ca-s1a,d1,a1, supplied in 305 m boxes / drums.",
        network, 305, OFFICIAL_PRODUCT_LINKS.cat6a, EXCEL),
    );
  }
  if (twoWayGop) {
    materials.push(product("excel-gop-2way", "GOP Box", "Excel 2 Way GOP Box Plus 25 mm (10-Pack)", "350-639",
      "2-way GOP box with 25 mm conduit knockout; accepts Cat5e/Cat6/Cat6A modules; supplied as a 10-pack.",
      roundedUp(twoWayGop, 10), "10-packs", OFFICIAL_PRODUCT_LINKS.gop2,
      `${twoWayGop} network drop locations with 1–2 cables (from the AV Drops page).`));
  }
  if (fourWayGop) {
    materials.push(product("excel-gop-4way", "GOP Box", "Excel 4 Way GOP Box Plus 25 mm (10-Pack)", "350-640",
      "4-way GOP box with 25 mm conduit knockout; accepts Cat5e/Cat6/Cat6A modules; supplied as a 10-pack.",
      roundedUp(fourWayGop, 10), "10-packs", OFFICIAL_PRODUCT_LINKS.gop4,
      `${fourWayGop} four-way GOP box(es) for drop locations with 3 or more network cables.`));
  }

  // ── Leads: 47U equipment rack → 12U connection rack ─────────────────────
  const rackLeads = cables.filter((c) => c.patchLeadColour || c.patchLeadLength);
  groupCount(rackLeads, (c) => {
    const kind = leadKindOf(c);
    if (kind === "speaker") return null;
    return `${kind}|${c.patchLeadColour || "Colour TBC"}|${fmtLen(c.patchLeadLength)}` as string;
  }).forEach(([key, list]) => {
    const [kind, colour, len] = key.split("|");
    const isDmxLead = kind === "dmx";
    materials.push(product(
      `lead-rack-${slug(key)}`, "Patch Lead",
      isDmxLead ? `Shielded DMX 5-pin XLR patch lead — ${colour}, ${len}` : `Cat6A S/FTP patch lead — ${colour}, ${len}`,
      "TBC",
      isDmxLead ? "5-pin XLR male–female, screened DMX cable. 47U equipment rack → 12U DMX panel." : "Cat6A shielded RJ45 patch lead. 47U rack switch → 12U rack keystone, bundled in cable sock.",
      list.length, "leads", "",
      `Cables ${cableList(list)}.`, true, "Supplier to be selected"));
  });
  const networkWithoutLead = networkOnRack.filter((c) => !c.patchLeadColour);
  if (networkWithoutLead.length) {
    materials.push(product("lead-rack-unassigned", "Patch Lead", "Cat6A S/FTP patch lead — colour not yet chosen", "TBC",
      "47U rack switch → 12U rack keystone, 7 m standard.", networkWithoutLead.length, "leads", "",
      `Network cables without a lead colour yet: ${cableList(networkWithoutLead, 12)}.`, false, "Supplier to be selected"));
  }
  if (rackLeads.length) {
    materials.push(product("cable-sock", "Containment", "Braided cable sock for the 47U → 12U patch lead bundle", "TBC",
      "Expandable braided sleeving sized for the bundled patch leads between the 47U equipment rack and the 12U connection rack.",
      1, "run", "", "Length to suit the 7 m patch lead route; confirm diameter for the bundle size.", true, "Supplier to be selected"));
  }

  // ── Leads at the destination (patch, HDMI, USB) ─────────────────────────
  const destGroups: [string, keyof CableRow, keyof CableRow, string, string][] = [
    ["patch", "destPatchCable", "destPatchLength", "Cat6A patch lead at destination", "RJ45 patch lead from the GOP outlet to the device."],
    ["hdmi", "destHdmi", "destHdmiLength", "HDMI lead at destination", "HDMI lead from the player / receiver to the display."],
    ["usb", "destUsb", "destUsbLength", "USB lead at destination", "USB lead from the Hive player to the touch display."],
  ];
  destGroups.forEach(([kind, partField, lengthField, label, spec]) => {
    const list = cables.filter((c) => c[partField] || c[lengthField]).filter((c) => kind !== "patch" || isNetwork(c));
    groupCount(list, (c) => `${String(c[partField] ?? "") || "TBC"}|${fmtLen(String(c[lengthField] ?? ""))}`).forEach(([key, group]) => {
      const [part, len] = key.split("|");
      materials.push(product(`lead-dest-${kind}-${slug(key)}`, "AV Lead", `${label} — ${len}`, part, spec,
        group.length, "leads", "", `Cables ${cableList(group)}.`, true, "Supplier to be selected"));
    });
  });

  // ── Speaker cabling, panels and drops ───────────────────────────────────
  if (speaker.length) {
    const standardSpeaker = speaker.filter((c) => !subSpeaker.includes(c));
    if (standardSpeaker.length) {
      materials.push(drumItem("van-damme-speaker-15", "Speaker Cable", "Van Damme installation speaker cable 1.5 mm²", "TBC",
        "Van Damme install-grade twin 1.5 mm² loudspeaker cable for the speaker circuits and speaker-to-speaker links.", standardSpeaker, 100, "", "Van Damme"));
    }
    if (subSpeaker.length) {
      materials.push(drumItem("van-damme-sub-speaker", "Speaker Cable", "Van Damme installation speaker cable 2.5 mm² — subwoofer", "TBC",
        "Van Damme install-grade twin 2.5 mm² loudspeaker cable for the subwoofer circuit.", subSpeaker, 100, "", "Van Damme"));
    }
    materials.push(
      product("speakon-panel", "Patch Panel", "1U 12-way D-series SpeakON panel", "TBC",
        "1U 19-inch D-series panel punched for 12 SpeakON chassis connectors (Audio 01–02).", speakerPanels, "panels", "",
        `${speakerPanels} audio panels on the Connection Rack: ${speakonPositions} SpeakON positions, ${speakonUsed} used.`, true, "Supplier to be selected"),
      product("speakon-chassis", "Speaker Connector", "SpeakON 4-pole chassis connector, D-series (Neutrik NL4MP or equal)", "TBC",
        "Panel-mount SpeakON for the Audio panels.", speakonUsed, "connectors", "",
        `One per scheduled speaker circuit on the rack: ${cableList(speakerOnRack)}.`, true, "Supplier to be selected"),
      product("speakon-chassis-spare", "Speaker Connector", "SpeakON 4-pole chassis connector — spare positions", "TBC",
        "Fit to fully populate the Audio panels, or use D-series blanking plugs instead.", Math.max(0, speakonPositions - speakonUsed), "connectors", "",
        "Optional: unused SpeakON positions on the Audio panels.", false, "Supplier to be selected"),
      product("speakon-cable", "Speaker Connector", "SpeakON 4-pole cable connector (Neutrik NL4FX or equal)", "TBC",
        "Cable-mount SpeakON to mate with the panel connectors.", speakonUsed, "connectors", "",
        "One per rack speaker circuit for the amplifier-side connection; confirm against the amplifier outputs.", false, "Supplier to be selected"),
    );
  }

  // ── DMX cabling, panels and connectors ──────────────────────────────────
  if (dmx.length) {
    materials.push(
      drumItem("van-damme-dmx", "DMX Cable", "6-core shielded DMX cable", "TBC",
        "6-core shielded data cable for the 5-pin XLR DMX circuits.", dmx, 100, "", "Supplier to be selected"),
      product("dmx-panel", "Patch Panel", "1U 12-way D-series 5-pin XLR DMX panel", "TBC",
        "1U 19-inch D-series panel punched for 12 × 5-pin XLR chassis connectors (DMX 01–02).", dmxPanels, "panels", "",
        `${dmxPanels} DMX panels on the Connection Rack: ${xlrPositions} XLR positions, ${xlrUsed} used.`, true, "Supplier to be selected"),
      product("xlr5-chassis", "DMX Connector", "5-pin XLR female chassis connector, D-series (Neutrik NC5FD-L-1 or equal)", "TBC",
        "Panel-mount 5-pin XLR for the DMX panels.", xlrUsed, "connectors", "",
        `One per scheduled DMX circuit on the rack: ${cableList(dmxOnRack)}.`, true, "Supplier to be selected"),
      product("xlr5-chassis-spare", "DMX Connector", "5-pin XLR chassis connector — spare positions", "TBC",
        "Fit to fully populate the DMX panels, or use D-series blanking plugs instead.", Math.max(0, xlrPositions - xlrUsed), "connectors", "",
        "Optional: unused 5-pin XLR positions on the DMX panels.", false, "Supplier to be selected"),
      product("xlr5-cable", "DMX Connector", "5-pin XLR cable connector (Neutrik NC5MXX or equal)", "TBC",
        "Cable-mount 5-pin XLR to terminate DMX runs at the fixture / node end.", dmx.length, "connectors", "",
        `One per DMX run at the destination: ${cableList(dmx)}. Confirm male/female against the fixtures.`, true, "Supplier to be selected"),
    );
  }

  // ── Other rack hardware (from the Connection Rack layout) ───────────────
  const lighting = panelsOf("lighting");
  const blankXlr = portsOf("xlrBlank").length;
  const freeU = Math.max(0, rack.capacityU - rack.usedU);
  materials.push(
    product("rack-cable-manager", "Rack", "1U horizontal cable manager", "TBC", "1U 19-inch cable management bar with fingers / D-rings.",
      panelsOf("management").length, "units", "", "U10 on the Connection Rack.", true, "Supplier to be selected"),
    product("rack-brush-entry", "Rack", "1U brush cable entry panel", "TBC", "1U 19-inch brush strip panel for cable entry.",
      panelsOf("entry").length, "units", "", "U9 on the Connection Rack.", true, "Supplier to be selected"),
    product("rack-fibre-panel", "Patch Panel", "1U 12-way D-series panel — Fibre / Vortex", "TBC", "1U 19-inch D-series panel for the LC duplex fibre feedthroughs.",
      panelsOf("fibre").length, "panels", "", "U4: 2 × LC duplex fitted, remaining positions blanked.", true, "Supplier to be selected"),
    ...(lighting.length ? [product("rack-lighting-panel", "Patch Panel", "1U 12-way D-series panel — Lighting provision", "TBC", "1U 19-inch D-series panel with blank XLR positions for future lighting circuits.",
      lighting.length, "panels", "", `U3: ${blankXlr} blank XLR positions (fit D-series blanking plugs).`, true, "Supplier to be selected")] : []),
    product("rack-dseries-blanks", "Rack", "D-series blanking plug", "TBC", "Blanks unused D-series holes on the fibre and lighting panels.",
      blankXlr + portsOf("blank").length, "plugs", "", "Optional if the spare SpeakON / XLR positions are fitted with connectors.", false, "Supplier to be selected"),
    product("rack-blank-plate", "Rack", "1U blanking plate", "TBC", "1U 19-inch blanking plate for unused rack spaces.",
      freeU, "plates", "", `${freeU} free U on the ${rack.capacityU}U rack.`, false, "Supplier to be selected"),
    product("rack-cage-nuts", "Rack", "M6 cage nuts, screws and washers", "TBC", "Rack fixings: 4 per 1U item.",
      rack.usedU * 4, "sets", "", `${rack.usedU}U of fitted equipment × 4.`, true, "Supplier to be selected"),
  );

  // ── Fibre ───────────────────────────────────────────────────────────────
  materials.push(
    product("samsung-aae-om4-fibre-links", "Fibre", `Pre-terminated OM4 BIMMF LC–LC duplex fibre assembly — ${FIBRE_PROVISION.lengthMetres} m`, "TBC",
      `${FIBRE_PROVISION.controller}: OM4 bend-insensitive multimode fibre, LC–LC interface, ${FIBRE_PROVISION.lengthMetres} m pre-terminated length. AAE supports OM3 or OM4 BIMMF up to 100 m.`,
      FIBRE_PROVISION.quantity, "links", "", `Terminate at the rear of the U4 Fibre / Vortex panel, positions 1–2. ${FIBRE_PROVISION.compatibilityNote}`, true, "Supplier to be selected"),
    product("samsung-aae-lc-fibre-feedthrough", "Fibre", "LC duplex D-series fibre feedthrough / bulkhead adapter", "TBC",
      "D-series-compatible LC duplex fibre feedthrough for the U4 Fibre / Vortex panel.", FIBRE_PROVISION.quantity, "adapters", "",
      "Fit at U4 Fibre / Vortex panel positions 1–2.", true, "Supplier to be selected"),
  );

  materials.push(product("cable-labels", "Labelling", "Cable identifier labels", "TBC",
    "Heat-shrink or wrap-around identification labels for each scheduled cable at both termination ends.",
    cables.length * 2, "labels", "", "One label at each end of every scheduled cable.", true, "Supplier to be selected"));

  return {
    materials,
    endpoints,
    summary: {
      scheduleRows: cables.length,
      networkDrops: network.length,
      speakerDrops: speaker.length,
      dmxDrops: dmx.length,
      fibreDrops: fibre.length,
      networkLength: runMetres(network).total,
      pendantSpeakerLength,
      subSpeakerLength,
      speakerLength: runMetres(speaker).total,
      dmxLength: runMetres(dmx).total,
      networkLocations: drops.length,
      speakerPoints: new Set(speaker.map((c) => c.destination.trim().toLowerCase())).size,
      dmxPoints: new Set(dmx.map((c) => c.destination.trim().toLowerCase())).size,
      gopBoxes: twoWayGop + fourWayGop,
      patchLeads: rackLeads.filter((c) => leadKindOf(c) !== "speaker").length,
      missingLengths: { network: unmeasured(network), speaker: unmeasured(speaker), dmx: unmeasured(dmx) },
      estimatedRuns: [...network, ...speaker, ...dmx].filter((c) => !hasLength(c) && estimate?.(c) != null).length,
    },
  };
}

export function createManualMaterial(): MaterialItem {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: "manual",
    category: "Other",
    description: "",
    partNumber: "",
    specification: "",
    qty: 1,
    unit: "each",
    supplier: "",
    productLink: "",
    imageUrl: "",
    status: "Ordered",
    notes: "",
    required: true,
  };
}

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  "Rack",
  "Patch Panel",
  "Keystone",
  "Network Cable",
  "GOP Box",
  "Patch Lead",
  "AV Lead",
  "Containment",
  "Speaker Cable",
  "Speaker Connector",
  "DMX Cable",
  "DMX Connector",
  "Fibre",
  "Labelling",
  "Other",
];
