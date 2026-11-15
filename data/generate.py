# AI-assisted: written with Claude Code (Anthropic). Synthetic crew cases only; no real astronaut data.
"""Write data/crew_cases.json: 11 synthetic crew cases designed to hit every NASA band and every boundary.

Boundary values (age 40/41/50, velocity 9.9/10.0, D-dimer +60%/+60.5%) are fixed by design. Values that only need
to look plausible (normal IJV velocities, D-dimer baselines) come from a seeded generator, so reruns are identical.
Expected totals are written by hand in tests/test_score.py, before any run.
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

SEED = 20261115
MISSION_DAYS = 180


def main(out: Path) -> None:
    rng = random.Random(SEED)

    # Normal (non-boundary) flow values are drawn from NASA's reported no-stasis range for astronauts.
    # Source: NASA/SP-20260005258 REV1, section "Left IJV Peak Flow Velocities Mapped to Anatomical Asymmetry Assessment":
    # "The remainder (8/16 individuals) experienced peak flow velocities of 18-70 cm/s" (and "<1.55 ... peak flow between
    # 18-46 cm/s"). NASA reports PEAK velocities; our field is MEAN peak velocity, so these are values drawn from NASA's
    # reported no-stasis peak-flow range, nothing more. Boundaries stay fixed by design (9.9 / 10.0 cm/s: the "<10 cm/s" rule).
    NASA_NO_STASIS_CM_S = (18.0, 70.0)

    def normal_v() -> float:
        return round(rng.uniform(*NASA_NO_STASIS_CM_S), 1)

    def side(v, direction="anterograde"):
        return {"mean_peak_velocity_cm_s": v, "direction": direction}

    def ijv(left=None, right=None, left_retro=False, prev_left=None):
        return lambda day: _series(day, left, right, left_retro, prev_left)

    def _series(day, left, right, left_retro, prev_left):
        """A scan series: baseline (pre-flight), L+30, L+60, R-42. Slots after the case's mission day are not recorded.

        The newest recorded in-flight scan carries the values given; earlier ones are seeded normal flow
        (`prev_left` fixes the one just before it, to show a trend). The score reads only that newest scan.
        """
        slots = [("Baseline", 0, False), ("L+30 days", 30, True), ("L+60 days", 60, True), ("R-42 days", MISSION_DAYS - 42, True)]
        recorded = [not fl or d <= day for _, d, fl in slots]
        newest = max((i for i, (_, d, fl) in enumerate(slots) if fl and d <= day), default=None)
        previous = max((i for i, (_, d, fl) in enumerate(slots) if fl and newest is not None and d < slots[newest][1]), default=None)
        scans = []
        for i, (label, d, fl) in enumerate(slots):
            if not recorded[i]:
                l, r = side(None, None), side(None, None)
            elif i == newest:
                l = side(normal_v() if left is None else left, "retrograde" if left_retro else "anterograde")
                r = side(normal_v() if right is None else right)
            else:
                l = side(prev_left if (i == previous and prev_left is not None) else normal_v())
                r = side(normal_v())
            scans.append({"label": label, "day": d, "in_flight": fl, "recorded": recorded[i], "left": l, "right": r})
        return scans

    case_day = [0]
    def base() -> int:
        return rng.randrange(150, 260, 10)

    P = lambda age, fh="none", th=None, non_o=False, h="none": {  # noqa: E731
        "age": age, "family_history": fh, "thrombophilia": th or [], "abo_non_o": non_o, "hormone": h}

    cases = [
        ("C01", "Young, no risk factors, normal scan, no D-dimer", P(34), {"mission_day": 30, "ijv": ijv()}),
        ("C02", "Age 45 only", P(45), {"mission_day": 30, "ijv": ijv()}),
        ("C03", "Age 52 and non-O blood type", P(52, non_o=True), {"mission_day": 60, "ijv": ijv()}),
        ("C04", "Retrograde flow in the left IJV (normal speed)", P(38, non_o=True), {"mission_day": 60, "ijv": ijv(left_retro=True)}),
        ("C05", "Several factors plus stasis and a D-dimer rise", P(47, th=["fvl_het"]),
         {"mission_day": 60, "ijv": ijv(left=8.5, prev_left=21.5), "ddimer_baseline": 200, "ddimer_now": 340}),
        ("C06", "Borderline below every line (age 40, 10.0 cm/s, D-dimer +60%)", P(40, h="low"),
         {"mission_day": 30, "ijv": ijv(left=10.0), "ddimer_baseline": 200, "ddimer_now": 320}),
        ("C07", "Borderline just over every line (age 41, 9.9 cm/s, D-dimer +60.5%)", P(41),
         {"mission_day": 30, "ijv": ijv(left=9.9), "ddimer_baseline": 200, "ddimer_now": 321}),
        ("C08", "Pre-flight factors alone reach 4 points", P(50, fh="one_under_50", h="some"), {"mission_day": 60, "ijv": ijv()}),
        ("C09", "Factor V Leiden with protein C deficiency", P(36, th=["fvl_het", "protein_c"]), {"mission_day": 30, "ijv": ijv()}),
        ("C10", "Before the first in-flight scan", P(44), {"mission_day": 20, "ijv": ijv()}),
        ("C11", "Demo case: low score (1 point), then a new change in vision", P(43), {"mission_day": 60, "ijv": ijv()}),
    ]
    symptoms = {"C11": {"ticked": ["vision_change"], "sudden_or_severe": False, "checklist_done": True}}
    rows = []
    for cid, label, pre, inf in cases:
        b = base()
        scans = inf.pop("ijv")(inf["mission_day"])  # replaces the old single `ijv` snapshot
        inf.setdefault("ddimer_baseline", None)
        inf.setdefault("ddimer_now", None)
        if cid in ("C03", "C08"):  # measured, stable D-dimer (rise under 60%)
            inf["ddimer_baseline"], inf["ddimer_now"] = b, round(b * 1.2)
        rows.append({"id": cid, "label": label, "mission_days": MISSION_DAYS, "preflight": pre, "inflight": inf, "scans": scans,
                     "symptoms": symptoms.get(cid, {"ticked": [], "sudden_or_severe": False, "checklist_done": True})})
    doc = {
        "_ai_assisted": "Synthetic cases generated with Claude Code (Anthropic). Not real astronaut data.",
        "seed": SEED,
        "cases": rows,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {len(rows)} cases to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "data/crew_cases.json"))
