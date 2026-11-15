# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; rules signed by the team physician.
"""NASA VTE Risk Score for Astronauts, implemented word for word from NASA/SP-20260005258 REV1 (source id VTE-2026).

The score and the band are a REFERENCE for clinician review. This code does not diagnose, predict or prescribe.
Pure functions, no randomness, no network: the same input always gives the same output.

Input (one crew case, synthetic):
  preflight: age (years), family_history ("none" | "one_under_50" | "two_plus"),
             thrombophilia (list of codes in THROMBOPHILIA_POINTS), abo_non_o (bool),
             hormone ("none" | "low" | "some" | "moderate")
  inflight:  mission_day (int), ijv (dict side -> {"mean_peak_velocity_cm_s": float|None, "retrograde": bool}) or None
             if no scan yet, ddimer_baseline and ddimer_now (same units) or None if not measured.
"""
from __future__ import annotations

from typing import Any

SRC = "VTE-2026"

# Verbatim rule text from the report's table (page 8), kept with each item so the UI can show it.
RULE_AGE_40 = "Over 40 years of age: +1 point"
RULE_AGE_50 = "Over 50 years of age: +2 points"
RULE_FH_1 = "First-degree relative < 50 years of age with an unprovoked VTE: +1 points"
RULE_FH_2 = "Two+ first-degree relatives (at least one <50 years of age) with an unprovoked VTE: +2 points"
RULE_ABO = "Non-O allele of the ABO genotype: +1 point"
RULE_STASIS = "Stasis (less than 10 cm/s blood flow velocity) or retrograde flow: +4 points"
RULE_DDIMER = ">60% increase from established in-flight D-dimer baseline level: +2 points"
RULE_FVL_OTHER = "Factor V Leiden with other thrombophilia conditions: +10 points"

THROMBOPHILIA_POINTS = {
    "fvl_het": (2, "Factor V Leiden heterozygous: +2 points"),
    "fvl_hom": (8, "Factor V Leiden homozygous: +8 points"),
    "protein_c": (3, "Protein C deficiency: +3 point"),
    "protein_s": (3, "Protein S deficiency: +3 point"),
    "at3": (10, "Antithrombin III deficiency: +10 points"),
    "prothrombin_het": (2, "Prothrombin gene mutation, heterozygous: +2 point"),
}
FVL = frozenset({"fvl_het", "fvl_hom"})

HORMONE_POINTS = {
    "none": (0, "No hormone use: 0 points"),
    "low": (0, "Use of 'low/no increased risk' hormone: 0 points"),
    "some": (2, "Use of 'some increased risk' hormone: +2 points"),
    "moderate": (2, "Use of 'moderate increased risk' hormone: +2 points"),
}
FAMILY = {"none", "one_under_50", "two_plus"}

STASIS_CM_S = 10.0  # "less than 10 cm/s"
DDIMER_RISE = 0.60  # ">60% increase"

# Verbatim action bands. The report lists no band for 0 points; we say so instead of guessing.
BANDS = (
    (1, 1, "1 point = no additional action"),
    (2, 3, "2-3 points = increased monitoring"),
    (4, 6, "4-6 points = prophylactic apixaban"),
    (7, None, "> 6 points = need clinical assessment"),
)
NO_BAND_ZERO = "0 points: the report lists no band for 0; its lowest band is '1 point = no additional action'"


class InputError(ValueError):
    """Raised for input the published method cannot score (wrong type, unknown code, impossible value)."""


def _item(group: str, rule: str, points: int, value: Any) -> dict:
    return {"group": group, "rule": rule, "points": points, "value": value, "source": SRC}


def _num(x: Any, name: str, lo: float, hi: float) -> float:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or x != x:  # x != x catches NaN
        raise InputError(f"{name} must be a number")
    if not lo <= x <= hi:
        raise InputError(f"{name} must be between {lo} and {hi}")
    return float(x)


def band_for(total: int) -> str:
    if total <= 0:
        return NO_BAND_ZERO
    for lo, hi, text in BANDS:
        if total >= lo and (hi is None or total <= hi):
            return text
    raise AssertionError("unreachable")


def score_preflight(pre: dict) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    flags: list[str] = []
    age = _num(pre.get("age"), "age", 18, 90)
    if age > 50:
        items.append(_item("Age", RULE_AGE_50, 2, age))
    elif age > 40:
        items.append(_item("Age", RULE_AGE_40, 1, age))
    else:
        items.append(_item("Age", "40 or under: no points listed", 0, age))

    fh = pre.get("family_history", "none")
    if fh not in FAMILY:
        raise InputError(f"family_history must be one of {sorted(FAMILY)}")
    if fh == "one_under_50":
        items.append(_item("Family history", RULE_FH_1, 1, fh))
    elif fh == "two_plus":
        items.append(_item("Family history", RULE_FH_2, 2, fh))
    else:
        items.append(_item("Family history", "None reported: no points listed", 0, fh))

    codes = pre.get("thrombophilia", [])
    if not isinstance(codes, list) or any(c not in THROMBOPHILIA_POINTS for c in codes):
        raise InputError(f"thrombophilia must be a list of {sorted(THROMBOPHILIA_POINTS)}")
    codes = sorted(set(codes))
    if FVL.issubset(codes):
        raise InputError("Factor V Leiden cannot be both heterozygous and homozygous")
    fvl = [c for c in codes if c in FVL]
    other = [c for c in codes if c not in FVL]
    if fvl and other:
        items.append(_item("Thrombophilia", RULE_FVL_OTHER, 10, codes))
        flags.append("Factor V Leiden with another thrombophilia: the report's single +10 row is used, not a sum.")
    elif codes:
        for c in codes:
            pts, rule = THROMBOPHILIA_POINTS[c]
            items.append(_item("Thrombophilia", rule, pts, c))
        if len(other) > 1:
            flags.append("Two or more non-Factor V Leiden thrombophilias: the report does not say how to combine them; points are summed here. Clinician review.")
    else:
        items.append(_item("Thrombophilia", "None reported: no points listed", 0, []))

    abo = pre.get("abo_non_o", False)
    if not isinstance(abo, bool):
        raise InputError("abo_non_o must be true or false")
    items.append(_item("Blood type", RULE_ABO, 1, True) if abo else _item("Blood type", "O/O: no points listed", 0, False))

    hormone = pre.get("hormone", "none")
    if hormone not in HORMONE_POINTS:
        raise InputError(f"hormone must be one of {sorted(HORMONE_POINTS)}")
    pts, rule = HORMONE_POINTS[hormone]
    items.append(_item("Hormone use", rule, pts, hormone))
    return items, flags


def score_inflight(inf: dict | None) -> tuple[list[dict], list[str]]:
    items: list[dict] = []
    flags: list[str] = []
    inf = inf or {}
    ijv = inf.get("ijv")
    if ijv is None:
        items.append(_item("IJV flow", "No in-flight ultrasound yet: not scored", 0, None))
        flags.append("In-flight IJV ultrasound not done yet: the total covers pre-flight factors only.")
    else:
        if not isinstance(ijv, dict) or not ijv or any(s not in ("left", "right") for s in ijv):
            raise InputError("ijv must map 'left' and/or 'right' to a scan result")
        hits = []
        for side in sorted(ijv):
            scan = ijv[side] or {}
            v = scan.get("mean_peak_velocity_cm_s")
            retro = scan.get("retrograde", False)
            if not isinstance(retro, bool):
                raise InputError(f"{side} retrograde must be true or false")
            if v is not None:
                v = _num(v, f"{side} mean peak velocity", 0, 200)
            if retro:
                hits.append(f"{side}: retrograde flow")
            elif v is not None and v < STASIS_CM_S:
                hits.append(f"{side}: {v:g} cm/s")
            if v is None and not retro:
                flags.append(f"{side} IJV velocity not recorded.")
        if hits:
            items.append(_item("IJV flow", RULE_STASIS, 4, "; ".join(hits)))
        else:
            items.append(_item("IJV flow", "No stasis (<10 cm/s) or retrograde flow found: 0 points", 0, "no stasis or retrograde flow"))

    base, now = inf.get("ddimer_baseline"), inf.get("ddimer_now")
    if base is None or now is None:
        items.append(_item("D-dimer", "Not measured: not scored", 0, None))
        flags.append("D-dimer not measured. The report: 'NASA does not routinely test D-dimer levels in astronauts. There are no existing adequate in-flight testing methods'.")
    else:
        base = _num(base, "D-dimer baseline", 1e-9, 1e6)
        now = _num(now, "D-dimer now", 0, 1e6)
        rise = (now - base) / base
        pts = 2 if rise > DDIMER_RISE else 0
        rule = RULE_DDIMER if pts else "Rise of 60% or less from the in-flight baseline: 0 points"
        items.append(_item("D-dimer", rule, pts, f"{rise * 100:+.1f}% from baseline"))
    return items, flags


def score(case: dict) -> dict:
    """Score one crew case. Returns items, total, the NASA reference band and review flags."""
    if not isinstance(case, dict) or not isinstance(case.get("preflight"), dict):
        raise InputError("case must be an object with a 'preflight' object")
    pre_items, pre_flags = score_preflight(case["preflight"])
    inflight = case.get("inflight")
    if "scans" in case:  # the +4 comes from the latest recorded in-flight scan, the same one the trend shows
        from vte.trend import ijv_from_scans  # local import: vte.trend imports this module
        inflight = {**(inflight or {}), "ijv": ijv_from_scans(case["scans"])}
    in_items, in_flags = score_inflight(inflight)
    items = pre_items + in_items
    total = sum(i["points"] for i in items)
    return {
        "case_id": case.get("id"),
        "items": items,
        "preflight_points": sum(i["points"] for i in pre_items),
        "inflight_points": sum(i["points"] for i in in_items),
        "total": total,
        "nasa_reference_band": band_for(total),
        "flags": pre_flags + in_flags,
        "note": "Reference for clinician review, following NASA's published method. Not a diagnosis, prediction or prescription.",
        "source": SRC,
    }


# IJV ultrasound schedule, OCHMO-MTB-007: "Example Schedule based on 180-day ISS mission:
# L-12/3 m, L+30 days; L+60 days; R-42 days, R+0/45d, as clinically indicated (ACI)."
def scan_schedule(mission_days: int) -> list[dict]:
    if isinstance(mission_days, bool) or not isinstance(mission_days, int) or not 1 <= mission_days <= 1500:
        raise InputError("mission_days must be a whole number from 1 to 1500")
    rows = [{"day": d, "label": f"L+{d} days"} for d in (30, 60) if d < mission_days]
    r42 = mission_days - 42
    if r42 > 0 and all(r42 != r["day"] for r in rows):
        rows.append({"day": r42, "label": "R-42 days"})
    rows.sort(key=lambda r: r["day"])
    for r in rows:
        r["source"] = "MTB-007"
    return rows


def next_scan(mission_days: int, today: int) -> dict | None:
    return next((r for r in scan_schedule(mission_days) if r["day"] >= today), None)
