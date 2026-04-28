# Checkpoint - Step 26-F Pipeline Sidecar Startup Fix

- Date: 2026-04-28 15:25 (KST)
- Topic: pipeline packaged binary exited immediately due ESM-only entry guard

## Scope

- Updated `services/pipeline/src/server.ts` to support both:
  - CJS execution (`require.main === module`)
  - ESM execution (`import.meta.url` check)
- Rebuilt pipeline sidecar binary (`esbuild + pkg`).

## Verification

- `npm run check -w @sorisori/pipeline` passed
- `npm run test -w @sorisori/pipeline` passed
- HTTP health:
  - `8787` realtime OK
  - `8788` pipeline OK
  - `8789` local-ai OK

## Next

1. Rebuild NSIS installer and validate installed runtime
2. Confirm sidecar logs/health in app debug panel
3. Keep handoff discipline if token usage approaches 93%+

