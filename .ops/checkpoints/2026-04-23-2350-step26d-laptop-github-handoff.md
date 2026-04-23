# Checkpoint - Step 26-D laptop/GitHub handoff

- Date: 2026-04-23
- Author: Codex
- Focus: preserve packaged-installer debug status and laptop resume path

## What was preserved

- Claude Step 26-D runtime fixes were validated and committed as:
  - `cea8fce` `fix(desktop): harden sidecar startup and wasapi probe`
- Fresh-clone rebuild commands were rechecked for:
  - `services/local-ai`
  - `services/realtime`
  - `services/pipeline`
- Laptop resume master handoff was written:
  - `.ops/handoff-2026-04-23-codex-to-laptop-github-resume.md`

## Current known state

- Local/offline stack only
- Japanese translation:
  - primary: `NLLB direct ja->ko`
  - fallback: `ja->en->ko`
- Packaged installer still needs real installed-path debugging
- `sidecar-bin/` is ignored, so fresh clones must rebuild sidecars locally
- GitHub remote is still unset in this working copy

## Resume order on laptop

1. Create private GitHub repo
2. Add `origin` and push current branch
3. Clone on laptop
4. Install Node / Python / Rust / VS Build Tools
5. Rebuild 3 sidecars
6. Run `npm run dev:desktop`
7. Rebuild installer and retest installed app

## Primary docs to read

1. `.ops/ai-bridge/shared-context.md`
2. `.ops/task-log.md`
3. `.ops/handoff-2026-04-23-codex-to-laptop-github-resume.md`
4. `.ops/handoff-2026-04-23-2300-claude-to-claude-step26c-sidecar-debug.md`
