# AI-assisted: written with Claude Code (Anthropic); quoted strings come from the cited NASA documents.
"""Mission context by destination (Shape 3). Context only: it never changes the score or the NASA band.

Quoted text is from OCHMO-TB-007 (Mission Duration). The simulated one-way delay is the upper end of a
published range and is labelled as a simulation everywhere it is shown.
"""
from __future__ import annotations

MISSIONS = {
    "leo": {
        "name": "Low Earth orbit",
        "communication": "Near real-time communications (1-1.5 seconds)",
        "evacuation": "Evacuation capabilities; Distance from Earth / Evacuation: 1 day or less",
        "ground_support": "Reliance on Earth",
        "simulated_one_way_delay_s": 1.5,
        "delay_basis": "upper end of '1-1.5 seconds' (TB-007)",
        "sources": ["TB-007"],
    },
    "moon": {
        "name": "Lunar mission",
        "communication": "Minor communication latencies",
        "evacuation": "Evacuation capabilities (3-11 days)",
        "ground_support": "Restrictions in onboard medical capability",
        "simulated_one_way_delay_s": 14.0,
        "delay_basis": "upper end of 'Comm Latency 5-14 sec' (NTRS 20250002759)",
        "sources": ["TB-007", "NTRS-20250002759"],
    },
    "mars": {
        "name": "Mars mission",
        "communication": "Extended communication latencies (0-40 minutes)",
        "evacuation": "No evacuation capability",
        "ground_support": "Limited ground medical support/autonomous Medical Care",
        "simulated_one_way_delay_s": 2400.0,
        "delay_basis": "upper end of '0-40 minutes' (TB-007)",
        "sources": ["TB-007"],
    },
}


def fmt_seconds(s: float) -> str:
    if s < 60:
        return f"{s:g} s"
    return f"{s / 60:g} min"


def review_context(mission_id: str) -> dict:
    """Facts the crew and the ground see next to the score. No clinical advice."""
    if mission_id not in MISSIONS:
        raise ValueError(f"mission must be one of {sorted(MISSIONS)}")
    m = MISSIONS[mission_id]
    one_way = m["simulated_one_way_delay_s"]
    return {
        "mission": mission_id,
        "name": m["name"],
        "communication": m["communication"],
        "evacuation": m["evacuation"],
        "ground_support": m["ground_support"],
        "simulated_one_way_delay_s": one_way,
        "earliest_ground_reply_s": 2 * one_way,
        "summary": f"Simulated delay {fmt_seconds(one_way)} each way: the earliest ground reply comes {fmt_seconds(2 * one_way)} after sending.",
        "delay_basis": m["delay_basis"],
        "sources": m["sources"],
    }
