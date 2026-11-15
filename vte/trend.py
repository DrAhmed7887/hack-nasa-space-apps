# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic scans only.
"""Scan trend (feature A): internal jugular vein (IJV) flow at baseline, L+30, L+60 and R-42, as neutral labels.

Velocity and direction are stored separately. The labels describe observations; they neither diagnose nor exclude
thrombosis. NASA's stasis criterion (SP-20260005258 REV1): "mean peak velocity is less than 10 cm/s anterograde";
score row: "Stasis (less than 10 cm/s blood flow velocity) or retrograde flow" (+4).

The +4 in the score is DERIVED from the latest recorded in-flight scan of this same series (`ijv_from_scans`), so the
trend and the score cannot disagree. The baseline scan is pre-flight and is never scored.

Scan: {"label", "day", "in_flight": bool, "recorded": bool, "left": Side, "right": Side}
Side: {"mean_peak_velocity_cm_s": float|None, "direction": "anterograde"|"retrograde"|None}
"""
from __future__ import annotations

from vte.score import InputError, STASIS_CM_S, _num

FORWARD = "Forward flow"
LOW = "Low velocity (mean peak <10 cm/s anterograde)"
RETRO = "Retrograde flow"
NOT_MEASURED = "Not measured"
TREND_NOTE = "These observations neither diagnose nor exclude thrombosis."
DIRECTIONS = ("anterograde", "retrograde")
SIDES = ("left", "right")


def classify(side: dict | None) -> str:
    """Neutral label for one side of one scan. Retrograde wins; below 10.0 cm/s (strictly) is low velocity."""
    side = side or {}
    v, d = side.get("mean_peak_velocity_cm_s"), side.get("direction")
    if d == "retrograde":
        return RETRO
    if v is None:
        return NOT_MEASURED  # no velocity measured: never label it forward flow
    if v is not None and v < STASIS_CM_S:
        return LOW
    return FORWARD


def _check_scan(scan: dict) -> None:
    if not isinstance(scan, dict) or not isinstance(scan.get("recorded"), bool) or not isinstance(scan.get("in_flight"), bool):
        raise InputError("each scan needs 'recorded' and 'in_flight' set to true or false")
    for side in SIDES:
        s = scan.get(side) or {}
        if s.get("direction") not in (None, *DIRECTIONS):
            raise InputError(f"{side} direction must be one of {list(DIRECTIONS)} or null")
        if s.get("mean_peak_velocity_cm_s") is not None:
            _num(s["mean_peak_velocity_cm_s"], f"{side} mean peak velocity", 0, 200)


def validate(scans: list) -> None:
    if not isinstance(scans, list):
        raise InputError("scans must be a list")
    for scan in scans:
        _check_scan(scan)


def latest_in_flight(scans: list) -> dict | None:
    """The newest recorded in-flight scan with at least one side measured, or None."""
    validate(scans)
    for scan in reversed(scans):
        if scan["in_flight"] and scan["recorded"] and any(classify(scan.get(s)) != NOT_MEASURED for s in SIDES):
            return scan
    return None


def ijv_from_scans(scans: list) -> dict | None:
    """The score's `ijv` input, taken from the latest recorded in-flight scan (None = no in-flight scan yet)."""
    scan = latest_in_flight(scans)
    if scan is None:
        return None
    out = {}
    for side in SIDES:
        s = scan.get(side) or {}
        if classify(s) != NOT_MEASURED:
            out[side] = {"mean_peak_velocity_cm_s": s.get("mean_peak_velocity_cm_s"), "retrograde": s.get("direction") == "retrograde"}
    return out


def scan_state(scans: list) -> dict:
    """Latest scan state for the flight-surgeon packet."""
    scan = latest_in_flight(scans)
    if scan is None:
        return {"label": None, "left": NOT_MEASURED, "right": NOT_MEASURED, "note": "No in-flight scan recorded yet. " + TREND_NOTE}
    return {"label": scan["label"], "day": scan["day"], "left": classify(scan["left"]), "right": classify(scan["right"]),
            "left_velocity_cm_s": scan["left"].get("mean_peak_velocity_cm_s"), "right_velocity_cm_s": scan["right"].get("mean_peak_velocity_cm_s"),
            "left_direction": scan["left"].get("direction"), "right_direction": scan["right"].get("direction"), "note": TREND_NOTE}


def trend_rows(scans: list) -> list[dict]:
    """One row per scan slot with neutral labels; a slot that is not recorded reads 'Not measured'."""
    validate(scans)
    rows = []
    for scan in scans:
        rec = scan["recorded"]
        rows.append({"label": scan["label"], "day": scan["day"], "in_flight": scan["in_flight"], "recorded": rec,
                     "left": classify(scan["left"]) if rec else NOT_MEASURED, "right": classify(scan["right"]) if rec else NOT_MEASURED})
    return rows
