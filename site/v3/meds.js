// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 6: medication safety and mission schedule connector. Human-governed: it shows NASA and FDA reference text,
// flags interactions and computes a countdown ONLY from a clinician-approved plan. It never starts, stops, doses or
// reverses anything. Every change needs flight-surgeon sign-off.

export const REGIMENS = Object.freeze({
  none: { label: "No apixaban recorded", source: null },
  prophylaxis: { label: "Apixaban 2.5 mg twice a day (NASA prophylaxis dose)", source: "MTB-007-p12" },
  treatment: { label: "Apixaban treatment dose (NASA: 10 mg twice a day for 7 days, then 5 mg twice a day)", source: "MTB-007-p12" },
});

// NASA landing-hold references by guidance document. The two NASA documents differ for prophylaxis: the clinician's plan
// must name which one it follows; the app never picks.
export const LANDING_GUIDANCE = Object.freeze({
  "MTB-007": { label: "OCHMO-MTB-007 (8-Jan-26)", source: "MTB-007-p13", hold_hours: { treatment: 48, prophylaxis: 24 } },
  "SP-20260005258": { label: "NASA/SP-20260005258 REV1 (July 2026)", source: "SP-p11-landing", hold_hours: { treatment: 48, prophylaxis: 48 } },
});
export const EVA_HOLD = Object.freeze({ hours: 24, applies_to: "prophylaxis", source: "SP-p11-landing" });

// FDA label section 7 examples only. Anything not listed is "not in the reference list", never "no interaction".
export const INTERACTIONS = Object.freeze({
  ketoconazole: { class: "combined P-gp and strong CYP3A4 inhibitor", effect: "increases apixaban levels" },
  itraconazole: { class: "combined P-gp and strong CYP3A4 inhibitor", effect: "increases apixaban levels" },
  ritonavir: { class: "combined P-gp and strong CYP3A4 inhibitor", effect: "increases apixaban levels" },
  clarithromycin: { class: "combined P-gp and strong CYP3A4 inhibitor (label: PK data suggest no dose adjustment)", effect: "label note only" },
  rifampin: { class: "combined P-gp and strong CYP3A4 inducer", effect: "decreases apixaban exposure" },
  carbamazepine: { class: "combined P-gp and strong CYP3A4 inducer", effect: "decreases apixaban exposure" },
  phenytoin: { class: "combined P-gp and strong CYP3A4 inducer", effect: "decreases apixaban exposure" },
  st_johns_wort: { class: "combined P-gp and strong CYP3A4 inducer", effect: "decreases apixaban exposure" },
});

const hoursToDays = (h) => h / 24;

export function medicationReview({ meds, plan, today }) {
  const regimen = REGIMENS[meds?.regimen] ? meds.regimen : "none";
  const out = {
    regimen, regimen_label: REGIMENS[regimen].label, regimen_source: REGIMENS[regimen].source,
    recorded_by_role: meds?.recorded_by_role || null,
    interactions: [], landing: null, evas: [], reversal_register: [],
    bleeding_context: { text: "AVERROES (apixaban 5 mg vs aspirin): major bleeding 1.4% vs 1.2% per year. Context for the flight surgeon, not a prediction for this crew member.", source: "SP-p11-averroes" },
    signoff_required: true,
  };
  if (regimen !== "none") {
    for (const d of meds?.concomitant || []) {
      const hit = INTERACTIONS[d];
      out.interactions.push(hit
        ? { drug: d, class: hit.class, effect: hit.effect, flag: "Interaction flagged: flight-surgeon review needed (FDA label section 7).", source: "FDA-apixaban-7" }
        : { drug: d, class: null, effect: null, flag: "Not in this app's reference list. This is not a statement that there is no interaction.", source: null });
    }
  }
  // Landing countdown: only from a clinician-approved plan that names its guidance document.
  const g = plan && LANDING_GUIDANCE[plan.guidance_id];
  const approved = !!(plan && plan.approved_by_role && g && Number.isFinite(plan.landing_day));
  if (regimen === "none") out.landing = { status: "NOT_APPLICABLE", text: "No apixaban recorded, so no landing hold applies." };
  else if (!approved) out.landing = { status: "UNAVAILABLE", text: "Countdown unavailable: it needs a clinician-approved landing plan that names its NASA guidance document." };
  else {
    const hold = g.hold_hours[regimen];
    const holdFromDay = plan.landing_day - hoursToDays(hold);
    out.landing = {
      status: "FROM_APPROVED_PLAN", guidance: g.label, source: g.source, hold_hours: hold, landing_day: plan.landing_day, hold_from_day: holdFromDay,
      days_until_hold: Number.isFinite(today) ? Math.round((holdFromDay - today) * 10) / 10 : null,
      approved_by_role: plan.approved_by_role,
      text: `Approved plan (${g.label}): reference hold begins ${hold} h before landing, on mission day ${holdFromDay}. The flight surgeon confirms every dose change.`,
      differs: Object.values(LANDING_GUIDANCE).some((x) => x.hold_hours[regimen] !== hold) ? "NASA's two documents give different hold times for this regimen; the approved plan names the one used." : null,
    };
  }
  if (regimen === "prophylaxis" && approved) {
    for (const d of plan.eva_days || []) {
      out.evas.push({ eva_day: d, hold_from_day: d - hoursToDays(EVA_HOLD.hours), text: `High-risk EVA on day ${d}: NASA reference hold of prophylaxis begins ${EVA_HOLD.hours} h before.`, source: EVA_HOLD.source });
    }
  }
  out.reversal_register = (meds?.kit || []).map((k) => ({ ...k, note: "Inventory record only." }));
  out.reversal_notes = [
    { text: "Reversal agents are difficult to administer in space.", source: "MTB-007-p13-reversal" },
    { text: "Label: PCC, aPCC or rFVIIa may be considered but have not been evaluated in clinical studies; effect persists at least 24 h after the last dose.", source: "FDA-apixaban-reversal" },
  ];
  return out;
}
