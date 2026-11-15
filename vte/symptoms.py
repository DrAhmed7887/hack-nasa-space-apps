# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry; the rule below was signed by the team physician (15 Nov 2026).
"""Daily symptom-report checklist (feature B). It adds NO points to the NASA VTE score and is shown apart from it.

NASA basis: OCHMO-MTB-007 says eyelid oedema, mydriasis, headache and SANS symptoms "should be considered as part of the
risk assessment"; NASA/SP-20260005258 REV1 describes sinus-clot cases presenting with symptoms. NASA gives no points for them.

Signed rule (checked in this order):
  1. any ticked symptom tagged emergency (face, arm/grip strength, speech, vision, hearing, pupil size, confusion)
     OR the "sudden or severe" box ticked  -> EMERGENCY_MESSAGE
  2. else any symptom ticked               -> REPORT_MESSAGE
  3. else "Checklist done today" on        -> NONE_MESSAGE
  4. else                                  -> NOT_DONE_MESSAGE (nothing was reported either way)
Pure functions, no randomness. site/symptoms.js is the browser port; tests/test_symptoms.py checks they agree.
"""
from __future__ import annotations

from typing import Any

from vte.score import InputError

EMERGENCY_MESSAGE = "Start your onboard medical emergency procedure now; do not wait for this app or a ground reply."
REPORT_MESSAGE = "Report today through your mission medical procedure."
NONE_MESSAGE = "No listed symptoms reported. This does not exclude thrombosis."
NOT_DONE_MESSAGE = "Checklist not done today. No symptom information has been reported."

# id, plain-words label, emergency tag (signed 15 Nov 2026)
SYMPTOMS = (
    {"id": "neck_swelling", "label": "New neck swelling", "emergency": False},
    {"id": "vision_change", "label": "New change in vision", "emergency": True},
    {"id": "headache", "label": "New or worse headache", "emergency": False},
    {"id": "puffy_face", "label": "Puffy eyelids or face", "emergency": False},
    {"id": "pupil_larger", "label": "One pupil larger", "emergency": True},
    {"id": "hearing_change", "label": "New hearing change", "emergency": True},
    {"id": "face_drooping", "label": "Face drooping", "emergency": True},
    {"id": "weak_grip", "label": "Weak grip or arm on one side", "emergency": True},
    {"id": "speech_trouble", "label": "New trouble speaking", "emergency": True},
    {"id": "confusion", "label": "Confusion", "emergency": True},
)
_BY_ID = {s["id"]: s for s in SYMPTOMS}


def empty_report() -> dict:
    return {"ticked": [], "sudden_or_severe": False, "checklist_done": False}


def assess(report: dict | None) -> dict:
    """Apply the signed rule. Returns the level, the message shown and the ticked symptoms. Never touches the score."""
    report = empty_report() if report is None else report
    if not isinstance(report, dict):
        raise InputError("symptom report must be an object")
    ticked = report.get("ticked", [])
    if not isinstance(ticked, list) or any(not isinstance(t, str) or t not in _BY_ID for t in ticked):
        raise InputError(f"ticked must be a list of {[s['id'] for s in SYMPTOMS]}")
    severe, done = report.get("sudden_or_severe", False), report.get("checklist_done", False)
    if not isinstance(severe, bool) or not isinstance(done, bool):
        raise InputError("sudden_or_severe and checklist_done must be true or false")
    ticked = sorted(set(ticked), key=[s["id"] for s in SYMPTOMS].index)
    if severe or any(_BY_ID[t]["emergency"] for t in ticked):
        level, message = "emergency", EMERGENCY_MESSAGE
    elif ticked:
        level, message = "report_today", REPORT_MESSAGE
    elif done:
        level, message = "none_reported", NONE_MESSAGE
    else:
        level, message = "not_done", NOT_DONE_MESSAGE
    return {
        "level": level,
        "message": message,
        "ticked": ticked,
        "ticked_labels": [_BY_ID[t]["label"] for t in ticked],
        "sudden_or_severe": severe,
        "checklist_done": done,
        "adds_points": 0,
    }
