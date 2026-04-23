# Handoff - GitHub push + laptop resume guide

- Date: 2026-04-23
- From: Codex
- For: future laptop session (Claude Code / Codex)
- Branch: `main`

## 1. Current repo state

### Latest important commits

- `cea8fce` `fix(desktop): harden sidecar startup and wasapi probe`
- `61ac5a2` `fix(desktop): resolve sidecar path for NSIS installed context`
- `02a70d4` `fix(desktop): add get_sidecar_status command for reliable startup diagnostics`
- `e36d704` `fix(desktop): surface sidecar startup failures and block UI until AI ready`
- `5ababa4` `feat(local-ai): add direct ja-ko translation path`
- `de524d3` `docs: hand off packaged installer debug`

### Current product state

- local/offline stack only
- English:
  - `Argos en->ko` primary
  - `MarianMT en->ko` fallback
- Japanese:
  - `NLLB direct ja->ko` primary
  - `ja->en->ko` bridge fallback
- current major blocker:
  - packaged/installed app still needs runtime debugging on a real installed path

### Important file paths

- installer:
  - `apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe`
- desktop release exe:
  - `apps/desktop/src-tauri/target/release/sorisori-desktop.exe`
- sidecar folder:
  - `apps/desktop/src-tauri/sidecar-bin/`
- main running notes:
  - `.ops/task-log.md`
- shared state:
  - `.ops/ai-bridge/shared-context.md`

## 2. Before pushing to GitHub

This repo currently has no remote configured.

First check status:

```powershell
git status --short
git log --oneline -8
```

At the time this guide was written, the only known non-essential leftovers were user-side files such as:

- `docs/image/`
- some old untracked handoff scratch files

If you do **not** want to push those, leave them out of `git add`.

## 3. Create GitHub repo and push

### A. Make the repo on GitHub

1. Log in to GitHub
2. `+` → `New repository`
3. name it `sorisori` (or whatever you want)
4. choose `Private`
5. **do not** initialize with README / `.gitignore`

### B. Connect this local repo

Replace the URL below with your own.

```powershell
git remote add origin https://github.com/YOUR_NAME/sorisori.git
git branch -M main
git push -u origin main
```

If `origin` already exists:

```powershell
git remote set-url origin https://github.com/YOUR_NAME/sorisori.git
git push -u origin main
```

## 4. Laptop setup from scratch

### Install first

- Node.js 24+
- Python 3.11+ or 3.12
- Rust / Cargo via `rustup`
- Visual Studio Build Tools (Desktop C++ workload)

### Clone

```powershell
git clone https://github.com/YOUR_NAME/sorisori.git
cd sorisori
```

### Install Node packages

```powershell
npm install
```

### Python venv

```powershell
cd services/local-ai
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd ..\..
```

## 5. Sidecar rebuild commands for laptop

`sidecar-bin/` is ignored by git, so on a fresh clone you **must** rebuild the sidecars.

### 5-A. local-ai sidecar

```powershell
services\local-ai\.venv\Scripts\python services\local-ai\model-download.py
services\local-ai\.venv\Scripts\pyinstaller services\local-ai\local-ai.spec --distpath apps\desktop\src-tauri\sidecar-bin --workpath services\local-ai\build --noconfirm
```

### 5-B. realtime sidecar

```powershell
npx esbuild services/realtime/src/entry.ts --bundle --platform=node --target=node18 --format=cjs --outfile=services/realtime/dist/bundle.cjs --external:ws
npx pkg services/realtime/dist/bundle.cjs --target node18-win-x64 --output apps/desktop/src-tauri/sidecar-bin/sorisori-realtime-x86_64-pc-windows-msvc.exe
```

### 5-C. pipeline sidecar

This command was locally re-verified in this repo.

```powershell
npx esbuild services/pipeline/src/server.ts --bundle --platform=node --target=node18 --format=cjs --outfile=services/pipeline/dist/bundle.cjs --external:ws --external:@prisma/client
npx pkg services/pipeline/dist/bundle.cjs --target node18-win-x64 --output apps/desktop/src-tauri/sidecar-bin/sorisori-pipeline-x86_64-pc-windows-msvc.exe
```

## 6. Run on laptop

### Dev mode

```powershell
npm run dev:desktop
```

### Release installer rebuild

```powershell
npm run build -w @sorisori/desktop
```

Installer output:

```text
apps/desktop/src-tauri/target/release/bundle/nsis/SoriSori Desktop_0.1.0_x64-setup.exe
```

## 7. Read these files first on laptop

Read in this order:

1. `.ops/ai-bridge/shared-context.md`
2. `.ops/task-log.md`
3. `docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md`
4. `.ops/handoff-2026-04-23-1955-codex-to-claude-step26a-direct-ja-ko.md`
5. `.ops/handoff-2026-04-23-2015-codex-to-claude-step26b-packaged-installer-debug.md`
6. `.ops/handoff-2026-04-23-2300-claude-to-claude-step26c-sidecar-debug.md`

## 8. Prompt for Claude on laptop

```text
프로젝트 루트에서 아래 파일들을 순서대로 읽고 현재 packaged installer/runtime 디버깅 상태를 이어받아줘.

.ops/ai-bridge/CLAUDE_START.md
.ops/ai-bridge/shared-context.md
.ops/task-log.md
docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md
.ops/handoff-2026-04-23-1955-codex-to-claude-step26a-direct-ja-ko.md
.ops/handoff-2026-04-23-2015-codex-to-claude-step26b-packaged-installer-debug.md
.ops/handoff-2026-04-23-2300-claude-to-claude-step26c-sidecar-debug.md

지금 우선순위는 설치본/패키지된 실행 파일이 왜 안 되는지 찾는 것이다.
사이드카 spawn, 설치 경로 해석, 모델 경로, sidecar 로그를 기준으로 이어서 디버깅해줘.
```

## 9. Prompt for Codex on laptop

```text
task-log와 최신 handoff들을 읽고 현재 상태 파악한 다음, packaged installer/runtime 디버깅을 이어서 해줘.

우선 읽을 파일:
.ops/task-log.md
.ops/ai-bridge/shared-context.md
docs/DECISIONS/0004-direct-ja-ko-translation-strategy.md
.ops/handoff-2026-04-23-2015-codex-to-claude-step26b-packaged-installer-debug.md
.ops/handoff-2026-04-23-2300-claude-to-claude-step26c-sidecar-debug.md

목표:
1. 설치본/릴리스 exe에서 sidecar가 왜 실패하는지 찾기
2. 필요한 로그를 추가하고
3. 수정 후 다시 빌드해서 테스트 가능 상태까지 만들기
```

## 10. What to do next after laptop setup

Recommended order:

1. clone + install
2. rebuild 3 sidecars
3. run `npm run dev:desktop`
4. check "고급 정보" / sidecar log panel
5. if dev mode works, build installer
6. test installed build
7. only then continue Japanese quality polish
