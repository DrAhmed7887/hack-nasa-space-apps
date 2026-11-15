# AI-assisted: written with Claude Code (Anthropic) for the NASA Space Apps 2026 entry. Reads public NASA OSDR files; writes GROUP SUMMARIES ONLY.
"""Summarise real Inspiration4 blood values from NASA's Open Science Data Repository as group statistics only.

Privacy rule: no per-person value, subject id or sex is ever written. For each analyte and timepoint the output has only
n, min, max and mean. The raw OSDR files are NOT in this repository: download them (open, no login) and pass the folder.

Inputs (original OSDR file names, from https://osdr.nasa.gov/osdr/data/osd/files/575 and /569):
  LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv   (OSD-575; Analyte, Concentration, Timepoint, ID, Unit)
  LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv           (OSD-569; ANALYTE, VALUE, UNITS, SUBJECT_ID, TEST_DATE)
Usage: python data/i4_summary.py <folder with the two files> [site/i4_context.json]
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

CREDIT = "Data are courtesy of the NASA Open Science Data Repository (https://osdr.nasa.gov/bio/repo)"
TIMEPOINTS = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"]
CV_FILE = "LSDS-8_Multiplex_serum.cardiovascular.EvePanel_SUBMITTED.csv"
CBC_FILE = "LSDS-7_Complete_Blood_Count_CBC.upload_SUBMITTED.csv"
# Publications that OSDR lists for both studies (the OSDR API does not expose a separate dataset DOI).
PUBLICATION_DOIS = ["10.1038/s41586-024-07639-y", "10.1038/s41467-024-48806-z"]
STUDIES = {
    "OSD-575": {"url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575", "dois": PUBLICATION_DOIS},
    "OSD-569": {"url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569", "dois": PUBLICATION_DOIS},
}
# id, label, study, file, name column, value column, unit column, timepoint column, analyte name in the file, decimals
SPECS = [
    ("fibrinogen", "Fibrinogen", "OSD-575", CV_FILE, "Analyte", "Concentration", "Unit", "Timepoint", "Fibrinogen", 0),
    ("pf4", "Platelet factor 4 (PF4)", "OSD-575", CV_FILE, "Analyte", "Concentration", "Unit", "Timepoint", "PF4", 0),
    ("platelets", "Platelet count", "OSD-569", CBC_FILE, "ANALYTE", "VALUE", "UNITS", "TEST_DATE", "PLATELET COUNT", 1),
]


# Physician decision (team, 15 Nov 2026): a platelet count below this floor is treated as a recording error and
# excluded. In the source file one L-92 value lies far below the lab's own range (140-400 Thousand/uL) and below
# every other value in the series.
PLAUSIBLE_MIN = {"platelets": 50.0}
NOTES = {"platelets": {"note": "One L-92 value far below the lab range (140-400 Thousand/uL) was excluded as a likely "
                               "recording error, so L-92 shows n = 3. All other values are as recorded."}}


def summarise(values: list[float], decimals: int) -> dict:
    """Group statistics only. Never returns the individual values."""
    return {"n": len(values), "min": round(min(values), decimals), "max": round(max(values), decimals),
            "mean": round(sum(values) / len(values), decimals)}


def build(folder: Path) -> dict:
    rows_by_file: dict[str, list[dict]] = {}
    analytes = []
    for aid, label, study, fname, ncol, vcol, ucol, tcol, name, dec in SPECS:
        if fname not in rows_by_file:
            with (folder / fname).open(encoding="utf-8-sig", newline="") as fh:
                rows_by_file[fname] = list(csv.DictReader(fh))
        rows = [r for r in rows_by_file[fname] if r[ncol] == name]
        units = {r[ucol] for r in rows}
        if len(units) != 1:
            raise ValueError(f"{name}: expected one unit, found {sorted(units)}")
        points = []
        for tp in TIMEPOINTS:
            floor = PLAUSIBLE_MIN.get(aid)
            vals = [float(r[vcol]) for r in rows if r[tcol] == tp and r[vcol].strip() != ""]
            vals = [v for v in vals if floor is None or v >= floor]
            if not vals:
                raise ValueError(f"{name} {tp}: no values")
            points.append({"timepoint": tp, **summarise(vals, dec)})
        analytes.append({"id": aid, "label": label, "unit": units.pop(), "study": study, "source_file": fname,
                         "study_url": STUDIES[study]["url"], "points": points, **NOTES.get(aid, {})})
    return {
        "_ai_assisted": "Group summaries computed by data/i4_summary.py (written with Claude Code) from public NASA OSDR files. No per-person values.",
        "credit": CREDIT,
        "what": "Inspiration4 (3-day orbital flight, 2021), 4 crew, blood drawn before (L-) and after (R+) flight, none in flight. Group n, min, max and mean only.",
        "timepoints": TIMEPOINTS,
        "studies": STUDIES,
        "analytes": analytes,
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    out = Path(argv[2] if len(argv) > 2 else "site/i4_context.json")
    doc = build(Path(argv[1]))
    out.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {out}: {len(doc['analytes'])} analytes x {len(TIMEPOINTS)} timepoints")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
