// AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
// Component 6: medication safety and mission schedule connector. Human-governed: it shows NASA and FDA reference text,
// flags interactions and computes a countdown ONLY from a flight-surgeon-signed plan. It never starts, stops, holds,
// doses, restarts or reverses anything (spec v3.1 §10). Every change needs flight-surgeon sign-off.

const own = (obj, k) => typeof k === "string" && Object.hasOwn(obj, k);

export const REGIMENS = Object.freeze({
  none: { label: "No apixaban recorded", source: null },
  prophylaxis: { label: "Apixaban 2.5 mg twice a day (NASA prophylaxis dose)", source: "MTB-007-p12" },
  treatment: { label: "Apixaban treatment dose (NASA: 10 mg twice a day for 7 days, then 5 mg twice a day)", source: "MTB-007-p12" },
});

// NASA landing-hold references by guidance document. The documents differ for prophylaxis; the signed plan must name
// which one it follows. The app never picks and has no default.
export const LANDING_GUIDANCE = Object.freeze({
  "MTB-007": { label: "OCHMO-MTB-007 (8 Jan 2026)", source: "MTB-007-p13", hold_hours: { treatment: 48, prophylaxis: 24 } },
  "SP-20260005258": { label: "NASA/SP-20260005258 REV1 (July 2026, newer)", source: "SP-p11-landing", hold_hours: { treatment: 48, prophylaxis: 48 } },
});
export const LANDING_LABEL = "Illustrative countdown — flight-surgeon approval required. Do not change medication based on this display alone.";
export const EVA_HOLD = Object.freeze({ hours: 24, applies_to: "prophylaxis", source: "SP-p11-landing" });

// FDA label examples only. Anything not listed is UNRECONCILED, never "no interaction".
const INH = { class: "combined P-gp and strong CYP3A4 inhibitor", effect: "increases apixaban levels", source: "FDA-apixaban-7" };
const IND = { class: "combined P-gp and strong CYP3A4 inducer", effect: "decreases apixaban exposure", source: "FDA-apixaban-7" };
const BLEED = (cls) => ({ class: cls, effect: "increases bleeding risk", source: "FDA-apixaban-bleeding" });
export const INTERACTIONS = Object.freeze({
  ketoconazole: INH, itraconazole: INH, ritonavir: INH,
  clarithromycin: { class: "combined P-gp and strong CYP3A4 inhibitor (label 7.1: PK data suggest no dose adjustment)", effect: "label note only", source: "FDA-apixaban-7" },
  rifampin: IND, carbamazepine: IND, phenytoin: IND, st_johns_wort: IND,
  aspirin: BLEED("aspirin (antiplatelet)"), clopidogrel: BLEED("antiplatelet agent"), heparin: BLEED("heparin"), enoxaparin: BLEED("other anticoagulant"),
  tenecteplase: BLEED("fibrinolytic / thrombolytic agent"), ibuprofen: BLEED("NSAID (chronic use)"), naproxen: BLEED("NSAID (chronic use)"),
  sertraline: BLEED("SSRI"), escitalopram: BLEED("SSRI"), venlafaxine: BLEED("SNRI"),
});

export function medicationReview({ meds, plan, today, concern = false }) {
  const regimen = own(REGIMENS, meds?.regimen) ? meds.regimen : "none";
  const out = {
    regimen, regimen_label: REGIMENS[regimen].label, regimen_source: REGIMENS[regimen].source,
    recorded_by_role: meds?.recorded_by_role || null,
    interactions: [], landing: null, evas: [], inventory: [],
    bleeding_context: { text: "NASA's table (SP p.11) lists AVERROES (apixaban 5 mg vs aspirin): major bleeding 1.4% vs 1.2%. Terrestrial reference; different population and dose (not 2.5 mg prophylaxis); not an individual or spaceflight estimate.", source: "SP-p11-averroes" },
    signoff_required: true,
  };
  if (regimen !== "none") {
    for (const d of meds?.concomitant || []) {
      const hit = own(INTERACTIONS, d) ? INTERACTIONS[d] : null;
      out.interactions.push(hit
        ? { drug: d, class: hit.class, effect: hit.effect, flag: "Interaction flagged: flight-surgeon review needed.", source: hit.source,
            dose_note: hit === INH && regimen === "prophylaxis" ? "Label 7.1 reference: for patients on 2.5 mg twice daily, the label says to avoid coadministration with combined P-gp and strong CYP3A4 inhibitors." : null }
        : { drug: d, class: null, effect: null, flag: "UNRECONCILED: not in this app's reference list. This is not a statement that there is no interaction.", source: null, dose_note: null });
    }
  }
  // Landing countdown: only from a signed plan that names its guidance document.
  const g = plan && own(LANDING_GUIDANCE, plan.guidance_id) ? LANDING_GUIDANCE[plan.guidance_id] : null;
  const signed = !!(plan && plan.approved_by_role && g && Number.isFinite(plan.landing_day));
  if (regimen === "none") out.landing = { status: "NOT_APPLICABLE", text: "No apixaban recorded, so no landing hold applies." };
  else if (!signed) out.landing = { status: "PENDING_FLIGHT_SURGEON_APPROVAL", text: "No countdown: it needs a flight-surgeon-signed landing plan that names its NASA guidance document (MTB-007 and SP-20260005258 differ)." };
  else {
    const hold = g.hold_hours[regimen];
    const lastDay = plan.landing_day - hold / 24;
    out.landing = {
      status: "FROM_SIGNED_PLAN", label: LANDING_LABEL, guidance: g.label, source: g.source, hold_hours: hold, landing_day: plan.landing_day, no_later_than_day: lastDay,
      days_until: Number.isFinite(today) ? Math.round((lastDay - today) * 10) / 10 : null,
      approved_by_role: plan.approved_by_role,
      text: `Signed plan (${g.label}): reference is to stop at least ${hold} h before landing (no later than mission day ${lastDay}). The flight surgeon confirms every dose change.`,
      differs: Object.values(LANDING_GUIDANCE).some((x) => x.hold_hours[regimen] !== hold)
        ? "NASA's documents differ for this regimen: OCHMO-MTB-007 (Jan 2026) gives 24 h for prophylaxis; the newer NASA/SP-20260005258 REV1 (July 2026) gives 48 h for any apixaban use. The signed plan names the one used." : null,
    };
  }
  if (regimen === "prophylaxis" && signed) {
    for (const d of plan.eva_days || []) {
      if (Number.isFinite(today) && d < today) { out.evas.push({ eva_day: d, text: `EVA on day ${d} is in the past; no reference shown.`, source: null }); continue; }
      out.evas.push({ eva_day: d, text: `High-risk EVA on day ${d}: NASA reference is to stop prophylaxis 24 h before (no later than day ${d - 1}) or per an individual PK/PD plan, and restart after the EVA.${concern ? " Thrombosis not yet excluded; if found, NASA reference is no EVA or ARED for at least 30 days (MTB-007 p.12). The flight surgeon decides whether the EVA proceeds." : ""}`, source: EVA_HOLD.source });
    }
  }
  if (regimen === "treatment") {
    out.evas.push({ eva_day: null, text: "Treatment dose: NASA reference for crew with thrombosis is to restrict EVA and ARED for at least 30 days.", source: "MTB-007-p12-eva" });
  }
  out.inventory = (meds?.kit || []).map((k) => ({ ...k, note: k.note || "Inventory record only; not a recommendation to give it." }));
  out.inventory_notes = [
    { text: "Reversal agents are difficult to administer in space.", source: "MTB-007-p13-reversal" },
    { text: "Label: PCC, aPCC or rFVIIa may be considered but have not been evaluated in clinical studies; the effect persists at least 24 h after the last dose. Protamine and vitamin K are not expected to affect apixaban. No experience with tranexamic acid in people taking apixaban.", source: "FDA-apixaban-reversal" },
    { text: "Andexanet alfa: not assumed available. Its regulatory and mission status must be verified before it is listed.", source: null },
  ];
  return out;
}
