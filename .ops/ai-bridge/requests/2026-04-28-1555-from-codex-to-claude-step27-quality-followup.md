# Request - Step 27 Quality Follow-up (EN/JA)

- Date: 2026-04-28 15:55 (KST)
- From: Codex
- To: Claude Code

## Scope

Continue EN/JA quality improvements after initial path hardening.
Chinese remains deferred.

## Starting point

- Step 27 pass 1 has been applied:
  - locked language guard
  - JA direct path hardening
  - chunk flush relaxation
- See:
  - `.ops/handoff-2026-04-28-1555-codex-to-claude-step27-en-ja-quality-pass1.md`
  - `.ops/checkpoints/2026-04-28-1555-step27-en-ja-quality-pass1.md`

## Next actions requested

1. Reproduce with user-style conversation videos (EN and JA teaching clips)
2. Implement small phrase post-edit layer for high-frequency idioms/transport phrases
3. Add observability counters for dropped chunks/transcripts
4. Rebuild installer and validate runtime behavior end-to-end

