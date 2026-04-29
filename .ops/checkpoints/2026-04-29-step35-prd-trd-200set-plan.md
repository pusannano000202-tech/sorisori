# Step 35 — PRD/TRD Replan for EN/JA 200-set Evaluation

Date: 2026-04-29

## Summary
- User requested formal replan:
  - EN 100 + JA 100 dataset
  - per-language split: 30 synthetic + 40 human external + 30 music-mixed (about 5s each)
  - quality gate:
    - EN keyword retention < 85% => fail
    - JA keyword retention < 75% => fail
  - fail => move to component replacement phase

## Updated docs
- `docs/PRD.md`
  - version/date bumped to v0.2 / 2026-04-29
  - scope clarified: EN/JA priority, ZH deferred
  - added Section 17:
    - 200-set composition
    - evaluation KPI/reporting
    - gate thresholds
    - data/license operational constraints

- `docs/TRD.md`
  - version/date bumped to v0.2 / 2026-04-29
  - updated recommendation to local-ai quality phase first
  - added Sections 15~19:
    - dataset schema/storage policy
    - tuning -> gate -> component replacement strategy
    - automation pipeline: collection -> normalization -> eval -> app-level validation
    - auto switch rule based on EN/JA thresholds
    - implementation roadmap artifacts

## Next immediate implementation step
1. Implement dataset ingestion/normalization scripts for 200-set build.
2. Expand `services/local-ai/eval/stt_corpus.json` to full EN/JA target counts.
3. Run first real baseline on non-synthetic clips and produce gate report.
