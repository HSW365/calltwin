/**
 * New Ark: NFPA water-based fire protection forms, built in as ready-to-fill templates.
 *
 *   form6  Inspection, Testing and Maintenance of Wet Pipe Sprinkler Systems   (NFPA Form 6)
 *   form5  Inspection, Testing and Maintenance of Dry Pipe Sprinkler Systems   (NFPA Form 5)
 *   form4  Contractor's Material and Test Certificate for Aboveground Piping   (NFPA Form 4)
 *   form3  Contractor's Material and Test Certificate for Underground Piping   (NFPA Form 3)
 *
 * The wording of every line is the wording on Joe's paper forms. One template object drives the owner page
 * (newark/forms.html), the AI fill (services/newarkNfpaAnalyze.js) and the PDF (services/newarkNfpaPdf.js).
 *
 * Field kinds
 *   ynna   Yes / No / N/A box, may carry readings:  { k, id, label, read?: [{ id, label, unit }] }
 *   yn     Yes / No box                              { k, id, label }
 *   yno    Yes / No / Other box                      { k, id, label }
 *   text   one line                                   { k, id, label, unit? }
 *   long   several lines                              { k, id, label }
 *   pick   one or more boxes from a list              { k, id, label, options: [...], multi? }
 *   table  rows x columns                             { k, id, label, cols: [{ id, label }], rows: n | rowLabels: [...] }
 *   note   printed text, nothing to fill              { k, text }
 *   sig    signature line (never filled by the AI)    { k, id, label }
 */
const y = (id, label, read) => ({ k: "ynna", id, label, ...(read ? { read } : {}) });
const yn = (id, label) => ({ k: "yn", id, label });
const tx = (id, label, unit) => ({ k: "text", id, label, ...(unit ? { unit } : {}) });
const lg = (id, label) => ({ k: "long", id, label });
const g = (title, items) => ({ title, items });
const psi = (a, b) => [{ id: a, label: "Static", unit: "psi" }, { id: b, label: "Residual", unit: "psi" }];

const COVERS = { k: "pick", id: "covers", label: "This report covers", options: ["Monthly", "Quarterly", "Annual", "Three-Year", "Five-Year"], multi: true };
const ITM_HEADER = [tx("propertyName", "Property name"), tx("propertyAddress", "Property address"), tx("phone", "Phone number"),
  tx("inspector", "Inspector"), tx("contractNo", "Contract no."), tx("date", "Date"), COVERS];
const ITM_FOOT = [lg("comments", "Comments"), { k: "sig", id: "signature", label: "Signature" }, tx("signDate", "Date"), tx("license", "License/Certification No.")];

const CONTROL_VALVES = (p) => g("Control Valves", [
  y(`${p}cvPosition`, "In the correct (open or closed) position"), y(`${p}cvSealed`, "Sealed, locked, or supervised"),
  y(`${p}cvAccessible`, "Accessible"), y(`${p}cvNoDamage`, "Free from damage or leaks"), y(`${p}cvSignage`, "Proper signage")]);
const SPRINKLERS = g("Sprinklers (visible)", [
  y("spNoDamage", "No damage or leaks"), y("spNoCorrosion", "Free of corrosion, foreign material, or paint"),
  y("spOrientation", "Installed in proper orientation"), y("spBulbs", "Fluid in glass bulbs"),
  y("spSpares", "Spare sprinklers—proper number and type. Complete with wrench?"), y("spHangers", "Hangers and seismic bracing—not damaged or loose")]);
const PRV_INSPECT = g("Pressure Reducing Valve", [y("prvOpen", "In the open position/not leaking"), y("prvDownstream", "Maintaining downstream pressure"), y("prvCondition", "In good condition")]);

const TEMPLATES = {
  form6: {
    id: "form6", form: "Form 6", short: "Wet pipe inspection",
    title: "Inspection, Testing, and Maintenance of Wet Pipe Sprinkler Systems",
    kicker: "Automatic Sprinkler Systems",
    header: ITM_HEADER,
    sections: [
      { title: "Inspections", parts: [
        { title: "Monthly", groups: [
          g("", [y("gauges", "Gauges—normal water pressure maintained")]),
          CONTROL_VALVES(""),
          g("Alarm Valves", [y("avNoDamage", "Free of damage"), y("avAccessible", "Accessible"), y("avDrains", "Retard chamber/alarm drains not leaking")]),
        ] },
        { title: "Quarterly", groups: [
          g("", [y("qAlarmDevices", "Alarm devices—free of damage"), y("qNameplate", "Hydraulic data nameplate—securely attached to riser/legible")]),
          g("Fire Department Connections", [y("fdcVisible", "Visible and accessible"), y("fdcCouplings", "Coupling/swivels operate correctly"), y("fdcPlugs", "Plugs/caps are in place"),
            y("fdcGaskets", "Gaskets are not damaged"), y("fdcSigns", "Identification signs are in place"), y("fdcBallDrip", "Ball drip valve is functional")]),
          PRV_INSPECT,
        ] },
        { title: "Annual", groups: [
          SPRINKLERS,
          g("Pipes and Fittings (visible)", [y("pfCondition", "In good condition/no external corrosion"), y("pfNoLeaks", "No leaks or mechanical damage"),
            y("pfAlignment", "Correct alignment—no external loads"), y("pfHoseRacks", "Hose racks—inspected per NFPA 1962"), y("pfFreezing", "Building—wet piping not exposed to freezing temperatures")]),
        ] },
        { title: "Five-Year", groups: [g("", [y("i5AlarmValve", "Alarm valve interior including strainers, filters, and restriction orifice"),
          y("i5CheckValve", "Check valve—internal moves freely, in good condition"), y("i5Obstruction", "Obstruction inspection—no foreign or obstructing material found")])] },
      ] },
      { title: "Test", parts: [
        { title: "Quarterly", groups: [g("", [y("tqGong", "Alarm devices—water motor gong"),
          y("tqMainDrain", "Main drain test—if the sole supply is through a backflow preventer", psi("tqStatic", "tqResidual")),
          y("tqDiffer", "Do results differ by more than 10% from previous test?")])] },
        { title: "Semi-annual", groups: [g("", [y("tsSupervisory", "Supervisory switch functions"), y("tsInspectorsTest", "Alarm devices—inspectors test or bypass opened/obstructed waterflow")])] },
        { title: "Annual", groups: [g("", [y("taMainDrain", "Main drain test", psi("taStatic", "taResidual")), y("taDiffer", "Do results differ by more than 10% from previous test?"),
          y("taValvesOperated", "All control valves operated through full range of motion and returned to normal position."),
          y("taAntifreeze", "Specific gravity or anti-freeze system (if present)"), y("taBackflowTest", "Backflow preventer—test"), y("taBackflowFlow", "Backflow preventer—flow test")])] },
        { title: "Three-Year", groups: [g("", [y("t3Hose", "Hose has been tested in accordance with NFPA 1962")])] },
        { title: "Five-Year", groups: [g("", [y("t5Gauges", "Gauges tested or replaced"), y("t5Prv", "Pressure reducing valve—flow test and comparable to previous results")])] },
        { title: "Routine Maintenance", groups: [g("", [y("rmSprinklers", "Sprinklers tested or replaced per appropriate testing schedule")])] },
      ] },
    ],
    footer: ITM_FOOT,
  },

  form5: {
    id: "form5", form: "Form 5", short: "Dry pipe inspection",
    title: "Inspection, Testing, and Maintenance of Dry Pipe Sprinkler Systems",
    kicker: "Automatic Sprinkler Systems",
    header: ITM_HEADER,
    sections: [
      { title: "Inspections", parts: [
        { title: "Monthly", groups: [
          g("", [y("gauges", "Gauges—normal air and water pressure maintained")]),
          CONTROL_VALVES(""),
          g("Dry Pipe Valves", [y("dpvExterior", "Exterior is free of damage, trim valves are in correct open or closed position, and intermediate chamber is not leaking")]),
        ] },
        { title: "Quarterly", groups: [
          g("", [y("qAlarmDevices", "Alarm devices—free of damage"), y("qNameplate", "Hydraulic data nameplate—securely attached to riser/legible")]),
          g("Fire Department Connections", [y("fdcVisible", "Visible and accessible"), y("fdcCouplings", "Coupling/swivels operate correctly"), y("fdcPlugs", "Plugs/caps are in place"),
            y("fdcGaskets", "Gaskets are not damaged"), y("fdcSigns", "Identification signs are in place"), y("fdcBallDrip", "Ball drip is functional"), y("fdcClapper", "FDC clapper is functional")]),
          PRV_INSPECT,
        ] },
        { title: "Annual", groups: [
          { ...SPRINKLERS, title: "Sprinklers" },
          g("Pipes and Fittings", [y("pfCondition", "In good condition/no external corrosion"), y("pfNoLeaks", "No leaks or mechanical damage"),
            y("pfAlignment", "Correct alignment—no external loads"), y("pfDpvInterior", "Dry pipe valve interior—following trip test"),
            y("pfFreezing", "Building—prior to onset of freezing weather—all openings are closed, no water-filled pipe is exposed to freezing temps")]),
        ] },
        { title: "Five-Year", groups: [g("", [y("i5Obstruction", "Obstruction inspection—no foreign or obstructing material found"),
          y("i5CheckValve", "Check valve—internal moves freely, in good condition"), y("i5DpvStrainers", "Dry pipe valve strainers, filters, and orifices internal inspection")])] },
      ] },
      { title: "Test", parts: [
        { title: "Quarterly", groups: [g("", [y("tqGong", "Alarm devices—water motor gong"),
          y("tqMainDrain", "Main drain test—if the sole supply is through a backflow preventer or pressure reducing valve", psi("tqStatic", "tqResidual")),
          y("tqDiffer", "Do results differ by more than 10% from previous test?"), y("tqPriming", "Priming water—test level"),
          y("tqLowAir", "Low air alarm—test per manufacturer's instructions"), y("tqQod", "Quick opening device tested")])] },
        { title: "Semi-annual", groups: [g("", [y("tsSupervisory", "Supervisory switch functions"), y("tsInspectorsTest", "Alarm devices—inspectors test or bypass opened/obstructed waterflow")])] },
        { title: "Annual", groups: [
          g("", [y("taMainDrain", "Main drain test", psi("taStatic", "taResidual")), y("taDiffer", "Do results differ by more than 10% from previous test?"),
            y("taValvesOperated", "All control valves operated through full range of motion and returned to normal position.")]),
          g("Dry pipe valve trip test (partial flow)", [
            { k: "table", id: "taTrip", label: "", cols: [{ id: "water", label: "Water pressure (psi)" }, { id: "air", label: "Air pressure (psi)" }, { id: "tripAir", label: "Tripping air pressure (psi)" }, { id: "tripSec", label: "Trip time (sec)" }], rows: 1 },
            y("taTripComparable", "Results comparable to previous tests"), y("taBackflowTest", "Backflow preventer—backflow test"), y("taBackflowFlow", "Backflow preventer—flow test")]),
        ] },
        { title: "Three-Year", groups: [g("", [
          y("t3FullTrip", "Dry pipe valve—full flow trip test"),
          { k: "table", id: "t3Trip", label: "", cols: [{ id: "water", label: "Water pressure (psi)" }, { id: "air", label: "Air pressure (psi)" }, { id: "tripAir", label: "Tripping air pressure (psi)" }, { id: "tripSec", label: "Trip time (sec)" }, { id: "delMin", label: "Water delivery (min)" }, { id: "delSec", label: "Water delivery (sec)" }], rows: 1 },
          y("t3Comparable", "Results comparable to previous years")])] },
        { title: "Five-Year", groups: [g("", [y("t5Gauges", "Gauges tested or replaced"), y("t5Prv", "Pressure reducing valve—flow test and comparable to previous results")])] },
        { title: "Routine Maintenance", groups: [g("", [y("rmSprinklers", "Sprinklers tested or replaced per appropriate testing schedule")])] },
      ] },
    ],
    footer: ITM_FOOT,
  },

  form4: {
    id: "form4", form: "Form 4", short: "Aboveground test certificate",
    title: "Contractor's Material and Test Certificate for Aboveground Piping",
    kicker: "Automatic Sprinkler Systems",
    procedure: "Upon completion of work, inspection and tests shall be made by the contractor's representative and witnessed by an owner's representative. All defects shall be corrected and system left in service before contractor's personnel finally leave the job.\nA certificate shall be filled out and signed by both representatives. Copies shall be prepared for approving authorities, owners, and contractor. It is understood the owner's representative's signature in no way prejudices any claim against contractor for faulty material, poor workmanship, or failure to comply with approving authority's requirements or local ordinances.",
    header: [tx("propertyName", "Property name"), tx("date", "Date"), tx("propertyAddress", "Property address")],
    sections: [{ title: "", parts: [
      { title: "Plans", groups: [g("", [tx("planAuthorities", "Accepted by approving authorities (names)"), tx("planAuthAddress", "Address"),
        yn("planConforms", "Installation conforms to accepted plans"), yn("planEquipApproved", "Equipment used is approved. If no, explain deviations"), lg("planDeviations", "Deviations")])] },
      { title: "Instructions", groups: [g("", [yn("insInstructed", "Has person in charge of fire equipment been instructed as to location of control valves and care and maintenance of this new equipment?"),
        lg("insInstructedWhy", "If no, explain"), yn("insCopiesLeft", "Have copies of the following been left on the premises?"),
        yn("insComponents", "1. System components instructions"), yn("insCare", "2. Care and maintenance instructions"), yn("insNfpa25", "3. NFPA 25")])] },
      { title: "Location of system", groups: [g("", [tx("supplies", "Supplies buildings")])] },
      { title: "Sprinklers", groups: [g("", [{ k: "table", id: "sprinklers", label: "", rows: 5,
        cols: [{ id: "make", label: "Make" }, { id: "model", label: "Model" }, { id: "year", label: "Year of manufacture" }, { id: "orifice", label: "Orifice size" }, { id: "qty", label: "Quantity" }, { id: "temp", label: "Temperature rating" }] }])] },
      { title: "Pipe and fittings", groups: [g("", [tx("pipeType", "Type of pipe"), tx("fittingType", "Type of fittings")])] },
      { title: "Alarm valve or flow indicator", groups: [g("", [{ k: "table", id: "alarmValves", label: "", rows: 2,
        cols: [{ id: "type", label: "Type" }, { id: "make", label: "Make" }, { id: "model", label: "Model" }, { id: "min", label: "Max time to operate (min)" }, { id: "sec", label: "Max time to operate (sec)" }] }])] },
      { title: "Dry pipe operating test", groups: [
        g("Dry valve", [tx("dvMake", "Make"), tx("dvModel", "Model"), tx("dvSerial", "Serial no.")]),
        g("Q.O.D.", [tx("qodMake", "Make"), tx("qodModel", "Model"), tx("qodSerial", "Serial no.")]),
        g("", [{ k: "table", id: "dryTest", label: "", rowLabels: ["Without Q.O.D.", "With Q.O.D."],
          cols: [{ id: "tripMin", label: "Time to trip (min)" }, { id: "tripSec", label: "Time to trip (sec)" }, { id: "water", label: "Water pressure (psi)" }, { id: "air", label: "Air pressure (psi)" },
            { id: "tripPoint", label: "Trip point air (psi)" }, { id: "outletMin", label: "Water at test outlet (min)" }, { id: "outletSec", label: "Water at test outlet (sec)" }, { id: "alarm", label: "Alarm operated properly (Yes/No)" }] },
          lg("dryTestWhy", "If no, explain")]),
      ] },
      { title: "Deluge and preaction valves", groups: [g("", [
        { k: "pick", id: "dlOperation", label: "Operation", options: ["Pneumatic", "Electric", "Hydraulic"], multi: true },
        yn("dlPipingSupervised", "Piping supervised"), yn("dlMediaSupervised", "Detecting media supervised"),
        yn("dlManualRemote", "Does valve operate from the manual trip, remote, or both control"), yn("dlTestFacility", "Is there an accessible facility in each circuit for testing?"),
        lg("dlTestWhy", "If no, explain"), tx("dlMake", "Make"), tx("dlModel", "Model"),
        yn("dlSupervisionAlarm", "Does each circuit operate supervision loss alarm?"), yn("dlValveRelease", "Does each circuit operate valve release?"),
        tx("dlReleaseMin", "Maximum time to operate release", "minutes"), tx("dlReleaseSec", "Maximum time to operate release", "seconds")])] },
      { title: "Pressure reducing valve test", groups: [g("", [{ k: "table", id: "prvTest", label: "", rows: 3,
        cols: [{ id: "location", label: "Location and floor" }, { id: "makeModel", label: "Make and model" }, { id: "setting", label: "Setting" }, { id: "sIn", label: "Static inlet (psi)" }, { id: "sOut", label: "Static outlet (psi)" },
          { id: "rIn", label: "Residual inlet (psi)" }, { id: "rOut", label: "Residual outlet (psi)" }, { id: "gpm", label: "Flow rate (gpm)" }] }])] },
      { title: "Test description", groups: [g("", [{ k: "note", text: "Hydrostatic: Hydrostatic tests shall be made at not less than 200 psi (13.6 bar) for 2 hours or 50 psi (3.4 bar) above static pressure in excess of 150 psi (10.2 bar) for 2 hours. Differential dry-pipe clappers shall be left open during the test to prevent damage. All aboveground piping leakage shall be stopped.\nPneumatic: Establish 40 psi (2.7 bar) air pressure and measure drop, which shall not exceed 1½ psi (0.1 bar) in 24 hours. Test pressure tanks at normal water level and air pressure and measure air pressure drop, which shall not exceed 1½ psi (0.1 bar) in 24 hours." }])] },
      { title: "Tests", groups: [g("", [
        tx("hydroPsi", "All piping hydrostatically tested at", "psi"), tx("hydroBar", "All piping hydrostatically tested at", "bar"), tx("hydroHours", "For", "hours"), lg("hydroWhy", "If no, state reason"),
        yn("pneumatic", "Dry piping pneumatically tested"), yn("equipOperates", "Equipment operates"),
        yn("noCorrosives", "Do you certify as the sprinkler contractor that additives and corrosive chemicals, sodium silicate or derivatives of sodium silicate, brine, or other corrosive chemicals were not used for testing systems or stopping leaks?"),
        tx("drainCutoff", "Drain test: reading of cutoff gauge located near water supply test connection", "psi"),
        tx("drainResidual", "Drain test: residual pressure with valve in test connection open wide", "psi"),
        lg("ugFlushed", "Underground mains and lead-in connections to system risers flushed before connection made to sprinkler piping"),
        { k: "yno", id: "ugCertVerified", label: "Verified by copy of the Contractor's Material and Test Certificate for Underground Piping" }, lg("ugCertExplain", "Explain"),
        yn("ugFlushedByInstaller", "Flushed by installer of underground sprinkler piping"),
        yn("powderFasteners", "If powder-driven fasteners are used in concrete, has representative sample testing been satisfactorily completed?"), lg("powderWhy", "If no, explain")])] },
      { title: "Blank testing gaskets", groups: [g("", [tx("gasketsUsed", "Number used"), tx("gasketLocations", "Locations"), tx("gasketsRemoved", "Number removed")])] },
      { title: "Welding", groups: [g("", [yn("welding", "Welding piping"),
        yn("weldProcedures", "If yes: Do you certify as the sprinkler contractor that welding procedures used complied with the minimum requirements of AWS B2.1, ASME Section IX Welding and Brazing Qualifications, or other applicable qualification standard as required by the AHJ?"),
        yn("weldOperators", "Do you certify that the welding was performed by welders or welding operators qualified in accordance with the minimum requirements of AWS B2.1, ASME Section IX Welding and Brazing Qualifications, or other applicable qualification standard as required by the AHJ?"),
        yn("weldQc", "Do you certify that the welding was conducted in compliance with a documented quality control procedure to ensure that (1) all discs are retrieved; (2) that openings in piping are smooth, that slag and other welding residue are removed; (3) the internal diameters of piping are not penetrated; (4) completed welds are free from cracks, incomplete fusion, surface porosity greater than 1/16 in. diameter, undercut deeper than the lesser of 25% of the wall thickness or 1/32 in.; and (5) completed circumferential butt weld reinforcement does not exceed 3/32 in.?")])] },
      { title: "Cutouts (discs)", groups: [g("", [yn("cutouts", "Do you certify that you have a control feature to ensure that all cutouts (discs) are retrieved?")])] },
      { title: "Hydraulic data nameplate", groups: [g("", [yn("nameplate", "Nameplate provided"), lg("nameplateWhy", "If no, explain")])] },
      { title: "Remarks", groups: [g("", [tx("inService", "Date left in service with all control valves open")])] },
    ] }],
    footer: [tx("contractorName", "Name of sprinkler contractor"),
      { k: "sig", id: "ownerSig", label: "Tests witnessed by: the property owner or their authorized agent (signed)" }, tx("ownerTitle", "Title"), tx("ownerDate", "Date"),
      { k: "sig", id: "contractorSig", label: "For sprinkler contractor (signed)" }, tx("contractorTitle", "Title"), tx("contractorDate", "Date"),
      lg("comments", "Additional explanations and notes")],
  },

  form3: {
    id: "form3", form: "Form 3", short: "Underground test certificate",
    title: "Contractor's Material and Test Certificate for Underground Piping",
    kicker: "Automatic Sprinkler Systems",
    procedure: "Upon completion of work, inspection and tests shall be made by the contractor's representative and witnessed by an owner's representative. All defects shall be corrected and system left in service before contractor's personnel finally leave the job.\nA certificate shall be filled out and signed by both representatives. Copies shall be prepared for approving authorities, owners, and contractor. It is understood the owner's representative's signature in no way prejudices any claim against contractor for faulty material, poor workmanship, or failure to comply with approving authority's requirements or local ordinances.",
    header: [tx("propertyName", "Property name"), tx("date", "Date"), tx("propertyAddress", "Property address")],
    sections: [{ title: "", parts: [
      { title: "Plans", groups: [g("", [tx("planAuthorities", "Accepted by approving authorities (names)"), tx("planAuthAddress", "Address"),
        yn("planConforms", "Installation conforms to accepted plans"), yn("planEquipApproved", "Equipment used is approved"), lg("planDeviations", "If no, state deviations")])] },
      { title: "Instructions", groups: [g("", [yn("insInstructed", "Has person in charge of fire equipment been instructed as to location of control valves and care and maintenance of this new equipment?"),
        lg("insInstructedWhy", "If no, explain"), yn("insCopiesLeft", "Have copies of appropriate instructions and care and maintenance charts been left on the premises?"), lg("insCopiesWhy", "If no, explain")])] },
      { title: "Location", groups: [g("", [tx("supplies", "Supplies buildings")])] },
      { title: "Underground pipes and joints", groups: [g("", [tx("pipeTypes", "Pipe types and class"), tx("jointType", "Type joint"),
        tx("pipeStandard", "Pipe conforms to (standard)"), yn("pipeConforms", "Pipe conforms to standard"),
        tx("fittingStandard", "Fittings conform to (standard)"), yn("fittingsConform", "Fittings conform to standard"), lg("pipesWhy", "If no, explain"),
        tx("anchorStandard", "Joints needed anchorage clamped, strapped, or blocked in accordance with (standard)"), yn("anchorage", "Joints needed anchorage clamped, strapped, or blocked in accordance with standard"), lg("anchorWhy", "If no, explain")])] },
      { title: "Test description", groups: [g("", [{ k: "note", text: "Flushing: Flow the required rate until water is clear as indicated by no collection of foreign material in burlap bags at outlets such as hydrants and blow-offs. Flush at flows not less than 390 gpm (1476 L/min) for 4 in. pipe, 880 gpm (3331 L/min) for 6 in. pipe, 1560 gpm (5905 L/min) for 8 in. pipe, 2440 gpm (9235 L/min) for 10 in. pipe, and 3520 gpm (13,323 L/min) for 12 in. pipe. When supply cannot produce stipulated flow rates, obtain maximum available.\nHydrostatic: All piping and attached appurtenances subjected to system working pressure shall be hydrostatically tested at 200 psi (13.8 bar) or 50 psi (3.4 bar) in excess of the system working pressure, whichever is greater, and shall maintain that pressure ± 5 psi for 2 hours.\nHydrostatic Testing Allowance: Where additional water is added to the system to maintain the test pressures required by 10.10.2.2.1, the amount of water shall be measured and shall not exceed the limits of the following equation: L = SD√P / 148,000, where L = testing allowance (makeup water) in gallons per hour, S = length of pipe tested in feet, D = nominal diameter of the pipe in inches, P = average test pressure during the hydrostatic test in psi." }])] },
      { title: "Flushing tests", groups: [
        g("New underground piping", [tx("flushStandard", "New underground piping flushed according to (standard)"), tx("flushCompany", "By (company)"), yn("flushed", "New underground piping flushed according to standard"), lg("flushWhy", "If no, explain"),
          { k: "pick", id: "flushSource", label: "How flushing was obtained", options: ["Public water", "Tank or reservoir", "Fire pump"] },
          { k: "pick", id: "flushOpening", label: "Through what type opening", options: ["Hydrant butt", "Open pipe"] }]),
        g("Lead-ins", [tx("leadStandard", "Lead-ins flushed according to (standard)"), tx("leadCompany", "By (company)"), yn("leadFlushed", "Lead-ins flushed according to standard"), lg("leadWhy", "If no, explain"),
          { k: "pick", id: "leadSource", label: "How flushing was obtained", options: ["Public water", "Tank or reservoir", "Fire pump"] },
          { k: "pick", id: "leadOpening", label: "Through what type opening", options: ["Y connection to flange and spigot", "Open pipe"] }]),
      ] },
      { title: "Hydrostatic test", groups: [g("", [tx("hydroPsi", "All underground piping hydrostatically tested at", "psi"), tx("hydroHours", "For", "hours"), yn("jointsCovered", "Joints covered")])] },
      { title: "Leakage test", groups: [g("", [tx("leakMeasured", "Total amount of leakage measured", "gallons"), tx("leakMeasuredHours", "Over", "hours"),
        tx("leakAllowed", "Allowable leakage", "gallons"), tx("leakAllowedHours", "Over", "hours")])] },
      { title: "Hydrants", groups: [g("", [tx("hydrantCount", "Number installed"), tx("hydrantMake", "Type and make"), yn("hydrantsOk", "All operate satisfactorily")])] },
      { title: "Control valves", groups: [g("", [yn("valvesOpen", "Water control valves left wide open"), lg("valvesWhy", "If no, state reason"),
        yn("threads", "Hose threads of fire department connections and hydrants interchangeable with those of fire department answering alarm")])] },
      { title: "Remarks", groups: [g("", [tx("inService", "Date left in service")])] },
    ] }],
    footer: [tx("contractorName", "Name of installing contractor"),
      { k: "sig", id: "ownerSig", label: "Tests witnessed by: for property owner (signed)" }, tx("ownerTitle", "Title"), tx("ownerDate", "Date"),
      { k: "sig", id: "contractorSig", label: "For installing contractor (signed)" }, tx("contractorTitle", "Title"), tx("contractorDate", "Date"),
      lg("comments", "Additional explanation and notes")],
  },
};

const ORDER = ["form6", "form5", "form4", "form3"];

/** Every fillable field in a template, flattened, with the section path it sits under (for the AI and the page). */
function fields(t) {
  const out = [];
  const walk = (it, path) => { if (it.k !== "note") out.push({ ...it, path }); if (it.read) it.read.forEach((r) => out.push({ k: "reading", id: r.id, label: `${it.label}: ${r.label}`, unit: r.unit, path })); };
  t.header.forEach((it) => walk(it, "Header"));
  for (const s of t.sections) for (const p of s.parts) for (const gr of p.groups) for (const it of gr.items) walk(it, [s.title, p.title, gr.title].filter(Boolean).join(" / "));
  t.footer.forEach((it) => walk(it, "Sign-off"));
  return out;
}

const clean = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const YNNA = ["yes", "no", "na"], YN = ["yes", "no"], YNO = ["yes", "no", "other"];

/** One answer, checked against its field. Returns undefined when the value doesn't fit the field. */
function cleanValue(f, v) {
  if (v == null || v === "") return undefined;
  switch (f.k) {
    case "ynna": case "yn": case "yno": {
      const s = String(v).toLowerCase().replace(/[^a-z]/g, "");
      const m = s === "n/a" || s === "na" || s === "notapplicable" ? "na" : s === "y" ? "yes" : s === "n" ? "no" : s;
      return (f.k === "ynna" ? YNNA : f.k === "yn" ? YN : YNO).includes(m) ? m : undefined;
    }
    case "text": case "reading": { const s = clean(v, 200); return s || undefined; }
    case "long": case "sig": { const s = clean(v, 2000); return s || undefined; }
    case "pick": {
      const want = (Array.isArray(v) ? v : [v]).map((x) => clean(x, 80).toLowerCase());
      const got = f.options.filter((o) => want.includes(o.toLowerCase()));
      if (!got.length) return undefined;
      return f.multi ? got : got[0];
    }
    case "table": {
      const n = f.rowLabels ? f.rowLabels.length : f.rows;
      const rows = (Array.isArray(v) ? v : []).slice(0, n).map((r) => {
        const o = {};
        for (const c of f.cols) { const s = clean(r && r[c.id], 80); if (s) o[c.id] = s; }
        return o;
      });
      while (rows.length < n) rows.push({});
      return rows.some((r) => Object.keys(r).length) ? rows : undefined;
    }
    default: return undefined;
  }
}

/** A saved form from the page, made safe: only known fields, only allowed values. */
function normalizeForm(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const t = TEMPLATES[d.template] || TEMPLATES.form6;
  const values = {}, ai = {};
  const inV = d.values && typeof d.values === "object" ? d.values : {};
  const inAi = d.ai && typeof d.ai === "object" ? d.ai : {};
  for (const f of fields(t)) {
    const v = cleanValue(f, inV[f.id]);
    if (v !== undefined) values[f.id] = v;
    if (v !== undefined && inAi[f.id]) ai[f.id] = clean(typeof inAi[f.id] === "string" ? inAi[f.id] : "From the job photos", 240);
  }
  return {
    template: t.id,
    number: clean(d.number, 40),
    values, ai,
    photos: (Array.isArray(d.photos) ? d.photos : []).slice(0, 8)
      .filter((p) => p && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(String(p.src || "")) && String(p.src).length <= 900000)
      .map((p) => ({ src: p.src, caption: clean(p.caption, 120) })),
    showPhotos: d.showPhotos !== false,
    email: clean(d.email, 160),
  };
}

/** Counts for the page and the saved list: how much is filled, how much the AI filled, what still needs Joe. */
function progress(doc) {
  const t = TEMPLATES[doc.template];
  const boxes = fields(t).filter((f) => ["ynna", "yn", "yno"].includes(f.k));
  const done = boxes.filter((f) => doc.values[f.id]).length;
  return { boxes: boxes.length, done, open: boxes.length - done, fromAi: Object.keys(doc.ai || {}).length };
}

/** What the page needs: every template, in order, without the server-only helpers. */
const catalog = () => ORDER.map((id) => TEMPLATES[id]);

module.exports = { TEMPLATES, ORDER, fields, cleanValue, normalizeForm, progress, catalog };
