#!/usr/bin/env python3
# AI-assisted: written with Claude Code. Read-only NASA OSDR metadata and PubMed evidence collector.
"""Collect NASA space-biology dataset metadata and PubMed VTE/spaceflight records.

This is a local, on-demand research assistant. It does not download human data,
change clinical rules, diagnose, or send alerts. Review each source before use.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


USER_AGENT = (
    "VTE-Watch-Evidence-Collector/0.1 "
    "(https://github.com/DrAhmed7887/hack-nasa-space-apps)"
)
PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
OSDR_BASE = "https://osdr.nasa.gov/osdr/data"
PUBMED_QUERY = (
    '((spaceflight[Title/Abstract] OR "space flight"[Title/Abstract] '
    'OR astronaut*[Title/Abstract]) AND '
    '(thrombosis[Title/Abstract] OR thrombus[Title/Abstract] '
    'OR jugular[Title/Abstract] OR DVT[Title/Abstract]))'
)
OSDR_TERMS = ("jugular", "venous thrombosis", "VTE", "ultrasound", "cardiovascular", "Inspiration4")
DIRECT_TERMS = ("jugular", "venous thromb", "thrombus", "thrombosis", "vte", "dvt", "blood clot")
ADJACENT_TERMS = ("ultrasound", "vascular", "cardiovascular", "blood flow", "hemodynamic")
CONTEXT_TERMS = ("inspiration4", "astronaut", "spaceflight", "space flight")


def get_bytes(url: str, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def get_json(url: str) -> dict[str, Any]:
    return json.loads(get_bytes(url).decode("utf-8"))


def node_text(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return " ".join("".join(node.itertext()).split())


def pubmed_search(limit: int) -> dict[str, Any]:
    params = urllib.parse.urlencode({
        "db": "pubmed", "term": PUBMED_QUERY, "retmax": limit,
        "sort": "pub date", "retmode": "json", "tool": "vte_watch_evidence_collector",
    })
    search_url = f"{PUBMED_BASE}/esearch.fcgi?{params}"
    search = get_json(search_url)["esearchresult"]
    ids = search.get("idlist", [])
    if not ids:
        return {"query": PUBMED_QUERY, "total_matches": int(search.get("count", 0)), "records": []}

    fetch_params = urllib.parse.urlencode({
        "db": "pubmed", "id": ",".join(ids), "retmode": "xml",
        "tool": "vte_watch_evidence_collector",
    })
    root = ET.fromstring(get_bytes(f"{PUBMED_BASE}/efetch.fcgi?{fetch_params}"))
    records = []
    for article in root.findall(".//PubmedArticle"):
        citation = article.find(".//MedlineCitation")
        article_node = article.find(".//Article")
        if citation is None or article_node is None:
            continue
        pmid = node_text(citation.find("PMID"))
        title = node_text(article_node.find("ArticleTitle"))
        journal = node_text(article_node.find("Journal/Title"))
        issue_date = article_node.find("Journal/JournalIssue/PubDate")
        pub_date = ""
        if issue_date is not None:
            year = node_text(issue_date.find("Year")) or node_text(issue_date.find("MedlineDate"))
            month = node_text(issue_date.find("Month"))
            day = node_text(issue_date.find("Day"))
            pub_date = " ".join(part for part in (year, month, day) if part)
        abstract_parts = []
        for part in article_node.findall(".//Abstract/AbstractText"):
            label = part.attrib.get("Label", "")
            value = node_text(part)
            abstract_parts.append(f"{label}: {value}" if label else value)
        identifiers = article.findall(".//PubmedData/ArticleIdList/ArticleId")
        doi = next((node_text(item) for item in identifiers if item.attrib.get("IdType") == "doi"), "")
        pub_types = [node_text(x) for x in article_node.findall(".//PublicationType")]
        abstract = " ".join(x for x in abstract_parts if x)
        records.append({
            "pmid": pmid,
            "doi": doi,
            "title": title,
            "journal": journal,
            "publication_date": pub_date,
            "publication_types": pub_types,
            "abstract": abstract,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        })
    return {
        "query": PUBMED_QUERY,
        "total_matches": int(search.get("count", 0)),
        "sort": "PubMed publication date, newest first",
        "records": records,
    }


def osdr_evidence_tier(title: str) -> str | None:
    lowered = title.lower()
    if any(term in lowered for term in DIRECT_TERMS):
        return "direct VTE/IJV"
    if any(term in lowered for term in ADJACENT_TERMS):
        return "title keyword: vascular/ultrasound"
    if any(term in lowered for term in CONTEXT_TERMS):
        return "spaceflight context"
    return None


def osdr_search() -> dict[str, Any]:
    candidates: dict[str, dict[str, Any]] = {}
    searches = []
    for term in OSDR_TERMS:
        params = urllib.parse.urlencode({"term": term, "from": 0, "size": 50, "type": "alsda,cgene"})
        url = f"{OSDR_BASE}/search?{params}"
        try:
            result = get_json(url)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            searches.append({"term": term, "error": str(exc)})
            continue
        hits = result.get("hits", {})
        searches.append({"term": term, "total_matches": hits.get("total", 0)})
        for hit in hits.get("hits", []):
            source = hit.get("_source", {})
            data_source = str(source.get("Data Source Type", "")).lower()
            if data_source not in {"alsda", "cgene"}:
                continue
            accession = str(source.get("Accession") or hit.get("_id") or "")
            if not accession:
                continue
            title = str(source.get("Study Title") or source.get("Project Title") or "")
            description = str(source.get("Study Description") or "")
            tier = osdr_evidence_tier(title)
            if tier is None:
                continue
            existing = candidates.get(accession)
            source_url = str(source.get("Project Link") or source.get("Authoritative Source URL") or "")
            if not source_url.startswith("https://") and accession.startswith("OSD-"):
                source_url = f"https://osdr.nasa.gov/bio/repo/data/studies/{accession}"
            record = {
                "accession": accession,
                "title": title,
                "data_source_type": source.get("Data Source Type", ""),
                "project_type": source.get("Project Type", ""),
                "mission": (source.get("Mission") or {}).get("Name", "")
                if isinstance(source.get("Mission"), dict) else "",
                "description_excerpt": " ".join(description.split())[:600],
                "evidence_tier": tier,
                "url": source_url,
                "access_note": "Metadata only. Check the NASA study page for file-level access status.",
            }
            if existing is None or (tier == "direct VTE/IJV" and existing["evidence_tier"] != tier):
                candidates[accession] = record
        time.sleep(0.15)
    order = {"direct VTE/IJV": 0, "title keyword: vascular/ultrasound": 1, "spaceflight context": 2}
    ordered = sorted(candidates.values(), key=lambda row: (order[row["evidence_tier"]], row["title"]))
    counts = {tier: sum(1 for row in ordered if row["evidence_tier"] == tier) for tier in order}
    return {
        "searches": searches,
        "records": ordered[:50],
        "counts_by_relevance": counts,
        "interpretation": (
            "These searches did not surface a NASA OSDR dataset title directly matching "
            "VTE or jugular surveillance. This is not proof that no such mission data exist; "
            "investigate the NASA Life Sciences Portal and its access process. Tiers come from "
            "title keywords only: a 'vascular/ultrasound' match can be a cell-culture study, "
            "not human ultrasound data."
        ),
        "access_limit": (
            "This search returns study metadata only. NASA human-derived files can have "
            "file-level access controls; the collector does not download raw data."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect public NASA dataset metadata and PubMed VTE records.")
    parser.add_argument("--limit", type=int, default=30, help="Maximum PubMed records to retrieve (default: 30).")
    parser.add_argument(
        "--output", type=Path,
        default=Path("private/research-agent/vte-evidence-latest.json"),
        help="JSON output path (default: ignored local private/ folder).",
    )
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100:
        parser.error("--limit must be between 1 and 100")

    report: dict[str, Any] = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "scope": "Read-only source discovery; not a clinical decision system.",
        "pubmed": {},
        "nasa_osdr": {},
        "official_context_sources": [
            {
                "title": "NASA VTE Risk Score for Astronauts Algorithm (2026)",
                "url": "https://www.nasa.gov/organizations/ochmo/establishing-a-vte-risk-score-for-astronauts-algorithm/",
            },
            {
                "title": "NASA request for spaceflight VTE monitoring and validation approaches",
                "url": "https://www.nasa.gov/researchers-help-nasa-prevent-blood-clot-formation-in-space/",
            },
        ],
    }
    try:
        report["pubmed"] = pubmed_search(args.limit)
    except (urllib.error.URLError, TimeoutError, ET.ParseError, json.JSONDecodeError) as exc:
        report["pubmed"] = {"error": str(exc), "records": []}
    try:
        report["nasa_osdr"] = osdr_search()
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        report["nasa_osdr"] = {"error": str(exc), "records": []}

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    papers = report.get("pubmed", {}).get("records", [])
    studies = report.get("nasa_osdr", {}).get("records", [])
    print(f"Saved evidence report: {args.output}")
    print(f"PubMed: {len(papers)} records returned from {report.get('pubmed', {}).get('total_matches', 0)} matches")
    for paper in papers[:8]:
        print(f"  PMID {paper['pmid']} · {paper['publication_date']} · {paper['title']}\n    {paper['url']}")
    counts = {tier: sum(1 for row in studies if row["evidence_tier"] == tier)
              for tier in ("direct VTE/IJV", "title keyword: vascular/ultrasound", "spaceflight context")}
    print(f"NASA OSDR: {len(studies)} candidate study records (direct/related/context {counts}); metadata only")
    for study in studies[:8]:
        print(f"  [{study['evidence_tier']}] {study['accession']} · {study['title']}\n    {study['url'] or 'Review NASA OSDR search result'}")
    if not papers and not studies:
        print("No records were returned; inspect the saved report for API errors.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
