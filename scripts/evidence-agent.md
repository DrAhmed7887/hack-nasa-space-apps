# VTE evidence agent

The local evidence agent searches PubMed for spaceflight VTE and jugular-vein
papers, and NASA OSDR for related dataset metadata. It saves a cited JSON review
queue for the team. It does not download astronaut data, update clinical rules,
diagnose, or send alerts.

## Run the collector

Run the command from the repository root. It uses Python's standard library
and public NASA and NCBI endpoints; no API key or extra package is required.

```sh
python3 scripts/evidence_agent.py
```

The default run retrieves up to 30 PubMed records and searches NASA OSDR. To
retrieve up to 100 PubMed records, set `--limit`. To change the output path, set
`--output`.

```sh
python3 scripts/evidence_agent.py --limit 60
python3 scripts/evidence_agent.py --output /path/to/report.json
```

## Review the output

The default JSON report is written to
`private/research-agent/vte-evidence-latest.json`. The `private/` directory is
ignored by Git. PubMed records include the title, journal, publication date,
PMID, DOI, abstract, and citation link. NASA records include the accession,
title, project type, source type, a description excerpt, and the NASA study
link. NASA results are labelled direct VTE/IJV, title keyword:
vascular/ultrasound, or spaceflight context. The labels come from title
keywords only: they rank search relevance, not clinical evidence quality, and
a "vascular/ultrasound" match can be a cell-culture study.

## Access and clinical limits

The NASA search retrieves metadata only. NASA applies access controls to some
human-derived files, so review each study page before seeking data access. The
collector never downloads raw files or assumes that astronaut-level records are
available. PubMed abstracts and NASA records are source leads for human review;
they do not automatically change VTE Watch's rules or validate its trend
thresholds.

The 15 Nov 2026 run (14:39 UTC) found no NASA OSDR dataset title directly
matching VTE or jugular surveillance. Three titles matched vascular keywords,
and all three are cell-culture studies (OSD-344 and OSD-541, cardiovascular
progenitor cells; OSD-635, vascular smooth-muscle cells), not human vascular or
ultrasound data. The other 27 are broader spaceflight context. Use NASA's Life Sciences Portal and
its access process to investigate individual mission records.

## Sources

- NASA OSDR public search endpoint the script calls: `https://osdr.nasa.gov/osdr/data/search`
- [NASA OSDR access FAQ](https://science.nasa.gov/reference/osdr-faq/)
- [NASA controlled-access data process](https://www.nasa.gov/reference/osdr-tutorials-requesting-controlled-access-datasets/)
- [NCBI E-utilities reference](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
- [NASA's 2026 VTE score summary](https://www.nasa.gov/organizations/ochmo/establishing-a-vte-risk-score-for-astronauts-algorithm/)
- [NASA's request for spaceflight VTE monitoring and validation approaches](https://www.nasa.gov/researchers-help-nasa-prevent-blood-clot-formation-in-space/)
