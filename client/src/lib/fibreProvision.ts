export const FIBRE_PROVISION = {
  quantity: 2,
  lengthMetres: 50,
  controller: "Samsung AAE Snow Box LED Controller",
  cableType: "Pre-terminated LC–LC OM4 bend-insensitive multimode fibre (BIMMF)",
  panelPosition: "U4 Fibre / Vortex panel, positions 1–2",
  rearTermination: "LC duplex fibre feedthroughs at the rear of the U4 Fibre / Vortex D-series panel",
  compatibilityNote: "This 50 m OM4 LC–LC selection is compatible with the AAE Snow Box specification, which allows OM3 or OM4 bend-insensitive multimode fibre up to 100 m. If the final controller is CS4B rather than AAE, reconfirm the link before ordering: CS4B uses either LC / OS2 single-mode fibre for LR4 or Type B female MPO multimode fibre for SR4.",
  sourceNote: "Samsung JMU / RAF / AAE / CS4B crib sheet v8",
  sourceDocumentUrl: "assets/JMU-RAF-AAE-CS4B-CV4BCribSheetv8.pdf",
} as const;

export const FIBRE_LINK_DESCRIPTION = `${FIBRE_PROVISION.quantity} × ${FIBRE_PROVISION.lengthMetres} m ${FIBRE_PROVISION.cableType} links`;
