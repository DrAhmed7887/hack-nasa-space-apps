# AI-assisted: written with Claude Code (Anthropic); every string below is quoted from the cited NASA document.
"""The NASA documents this tool follows. Each rule in score.py and missions.py points to one of these ids."""

SOURCES = {
    "VTE-2026": {
        "title": "NASA Risk of Venous Thromboembolism in Spaceflight. Outcomes of Working Group Meeting - April 2026 (NASA/SP-20260005258, REV1, 2 July 2026)",
        "url": "https://www.nasa.gov/wp-content/uploads/2026/06/risk-venous-thromboembolism-assessment-sp20260005258.pdf",
        "used_for": "VTE Risk Score for Astronauts: points per risk factor and the four action bands",
    },
    "MTB-007": {
        "title": "NASA OCHMO Medical Technical Brief OCHMO-MTB-007, Venous Thrombosis in Spaceflight",
        "url": "https://www.nasa.gov/wp-content/uploads/2026/01/ochmo-mtb-007-venous-thrombosis-in-spaceflight.pdf",
        "used_for": "Internal jugular vein screening schedule (example for a 180-day ISS mission)",
    },
    "TB-007": {
        "title": "NASA-STD-3001 Technical Brief OCHMO-TB-007, Mission Duration (Rev A, 12 Dec 2023)",
        "url": "https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-007-mission-duration.pdf",
        "used_for": "Mission context: communication latency and evacuation by destination",
    },
    "NTRS-20250002759": {
        "title": "NASA, IMM vs IMPACT, Artemis II (AsMA 2025 slides, NTRS 20250002759)",
        "url": "https://ntrs.nasa.gov/citations/20250002759",
        "used_for": "Lunar communication latency figure (5-14 s), used only to set the simulated delay",
    },
}
