# Handoff: Codex -> Claude (Step 35, PRD/TRD 200-set plan)

Date: 2026-04-29

## Done
- Rewrote planning docs for user-requested quality program:
  - `docs/PRD.md` -> v0.2
  - `docs/TRD.md` -> v0.2
- Added explicit 200-set design:
  - EN 100, JA 100
  - each language: 30 synthetic + 40 human external + 30 music-mixed (~5 sec)
- Added gate rules:
  - EN keyword retention < 85 => fail
  - JA keyword retention < 75 => fail
  - fail => component replacement phase

## New planning docs sections
- PRD:
  - Section 17 STT quality program
- TRD:
  - Sections 15~19 dataset/automation/gate/component-switch strategy

## Added operation note
- checkpoint file:
  - `.ops/checkpoints/2026-04-29-step35-prd-trd-200set-plan.md`

## Next coding work (not started in this step)
1. Create data collection scripts for:
   - synthetic generation
   - external human corpus ingestion
   - music-mixed clip extraction
2. Expand `stt_corpus.json` to real 200-case manifests.
3. Execute baseline and output gate pass/fail report.
