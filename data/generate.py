# AI-assisted: written with Claude Code (Anthropic). Synthetic crew cases only; no real astronaut data.
"""Write data/crew_cases.json: 10 synthetic crew cases designed to hit every NASA band and every boundary.

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

    def normal_v() -> float:  # comfortably above the 10 cm/s stasis line
        return round(rng.uniform(14.0, 30.0), 1)

    def ijv(left=None, right=None, left_retro=False):
        return {
            "left": {"mean_peak_velocity_cm_s": normal_v() if left is None else left, "retrograde": left_retro},
            "right": {"mean_peak_velocity_cm_s": normal_v() if right is None else right, "retrograde": False},
        }

    def base() -> int:
        return rng.randrange(150, 260, 10)

    P = lambda age, fh="none", th=None, non_o=False, h="none": {  # noqa: E731
        "age": age, "family_history": fh, "thrombophilia": th or [], "abo_non_o": non_o, "hormone": h}

    cases = [
        ("C01", "Young, no risk factors, normal scan, no D-dimer", P(34), {"mission_day": 30, "ijv": ijv()}),
        ("C02", "Age 45 only", P(45), {"mission_day": 30, "ijv": ijv()}),
        ("C03", "Age 52 and non-O blood type", P(52, non_o=True), {"mission_day": 60, "ijv": ijv()}),
        ("C04", "Retrograde flow in the left IJV", P(38, non_o=True), {"mission_day": 60, "ijv": ijv(left_retro=True)}),
        ("C05", "Several factors plus stasis and a D-dimer rise", P(47, th=["fvl_het"]),
         {"mission_day": 60, "ijv": ijv(left=8.5), "ddimer_baseline": 200, "ddimer_now": 340}),
        ("C06", "Borderline below every line (age 40, 10.0 cm/s, D-dimer +60%)", P(40, h="low"),
         {"mission_day": 30, "ijv": ijv(left=10.0), "ddimer_baseline": 200, "ddimer_now": 320}),
        ("C07", "Borderline just over every line (age 41, 9.9 cm/s, D-dimer +60.5%)", P(41),
         {"mission_day": 30, "ijv": ijv(left=9.9), "ddimer_baseline": 200, "ddimer_now": 321}),
        ("C08", "Pre-flight factors alone reach 4 points", P(50, fh="one_under_50", h="some"), {"mission_day": 60, "ijv": ijv()}),
        ("C09", "Factor V Leiden with protein C deficiency", P(36, th=["fvl_het", "protein_c"]), {"mission_day": 30, "ijv": ijv()}),
        ("C10", "Before the first in-flight scan", P(44), {"mission_day": 20, "ijv": None}),
    ]
    rows = []
    for cid, label, pre, inf in cases:
        b = base()
        inf.setdefault("ddimer_baseline", None)
        inf.setdefault("ddimer_now", None)
        if cid in ("C03", "C08"):  # measured, stable D-dimer (rise under 60%)
            inf["ddimer_baseline"], inf["ddimer_now"] = b, round(b * 1.2)
        rows.append({"id": cid, "label": label, "mission_days": MISSION_DAYS, "preflight": pre, "inflight": inf})
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
