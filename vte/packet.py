# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Synthetic data only.
"""The packet the onboard agent hands to the ground (feature D).

It carries: the NASA score with its sources, the latest in-flight scan state, the symptom report, and the message the
crew was shown. The ground agent queues it for a flight surgeon and makes no clinical decision. The message is shown
onboard at once: it never waits for the ground.
"""
from __future__ import annotations

from vte.missions import review_context
from vte.score import next_scan, scan_schedule, score
from vte.sources import SOURCES
from vte.symptoms import assess
from vte.trend import scan_state

PACKET_PARTS = ["score", "score_sources", "scan_state", "symptom_report", "message_shown"]


def build_packet(case: dict, mission: str) -> dict:
    day = (case.get("inflight") or {}).get("mission_day", 0)
    result = score(case)
    report = assess(case.get("symptoms"))
    return {
        "from": "onboard-crew-medical-monitor",
        "sent_at_mission_s": day * 86400,
        "score": result,
        "score_sources": [{"id": i, "title": SOURCES[i]["title"], "url": SOURCES[i]["url"]} for i in sorted({it["source"] for it in result["items"]})],
        "schedule": scan_schedule(case["mission_days"]),
        "next_scan": next_scan(case["mission_days"], day + 1),
        "review_context": review_context(mission),
        "scan_state": scan_state(case.get("scans", [])),
        "symptom_report": report,
        "message_shown": report["message"],
    }
