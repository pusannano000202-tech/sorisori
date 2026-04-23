# Handoff — Step 26-C 사이드카 기동 실패 디버깅

- 작성일: 2026-04-23
- 작성자: Claude Code
- 수신자: Claude Code (노트북)
- 브랜치: `main` (커밋 e36d704)

## 현재 상황

설치본(NSIS) 기준으로 local-ai sidecar가 시작되지 않아 앱이 동작 안 함.

- 앱은 정상 켜짐
- "AI 서비스를 시작하지 못했습니다" 메시지 표시
- 시작 버튼 비활성 상태 유지

## 이번 세션에서 추가한 것 (커밋 e36d704)

1. `lib.rs` — 3개 sidecar stderr 캡처 → `sidecar-log` Tauri 이벤트 emit
2. `main.js` — 앱 시작 시 `http://127.0.0.1:8789/health` 3초 폴링, AI 준비 전 시작 버튼 비활성화
3. `index.html` — 고급 정보 탭에 "사이드카 상태/로그" 패널 추가
4. `main.py` — CORS 미들웨어 추가

## 다음 세션에서 해야 할 것

### Step 1: 사이드카 로그 확인

앱 실행 후 "고급 정보 (개발자용)" 탭 열어서 "사이드카 상태/로그" 패널 내용 확인.

예상 원인 후보:
1. **경로 오류** — `resource_dir()/sidecar-bin/...exe` 가 설치 위치에 없음
2. **Windows Defender 차단** — PyInstaller onefile exe가 antivirus에 의해 실행 차단
3. **모델 미존재** — `AppData\Roaming\sorisori\models\` 아래 Whisper/Argos 모델 없음
4. **DLL 누락** — PyInstaller가 onnxruntime 또는 ctranslate2 네이티브 DLL 빠뜨림
5. **시간 초과** — NLLB 2.4GB 로딩이 3분(60×3초) 초과

### Step 2: 로그 내용에 따른 대응

| 로그 내용 | 원인 | 해결 |
|-----------|------|------|
| "Failed to start local-ai" | 파일 없음 또는 경로 오류 | resource_dir 경로 확인, lib.rs에 경로 로그 추가 |
| "Access is denied" / 없음 | Defender 차단 | Windows Defender 예외 추가 안내 |
| "No such file" (모델) | 모델 없음 | model-download.py 실행 안내 |
| ImportError / DLL 오류 | PyInstaller 누락 | spec hiddenimports 추가 후 재빌드 |
| 로그가 아예 없음 | exe spawn 자체 실패 | lib.rs에 spawn 오류 이벤트 추가 |

### Step 3: 만약 경로 문제면

`lib.rs`의 `start_sidecars` 시작 부분에 경로 로그 추가:

```rust
let _ = app.emit("sidecar-log", SidecarLogEvent {
    sidecar: "system".to_string(),
    line: format!("resource_dir={:?}", resource_dir),
});
let _ = app.emit("sidecar-log", SidecarLogEvent {
    sidecar: "system".to_string(),
    line: format!("local_ai_exe exists={}", local_ai_exe.exists()),
});
```

### Step 4: 만약 시간 초과 문제면

`main.js`의 `waitForLocalAi`에서 폴링 횟수 60→120으로 늘리기 (6분 대기):

```javascript
for (let attempt = 0; attempt < 120; attempt++) {
```

## 파일 구조 요약

```
apps/desktop/src-tauri/src/lib.rs   — sidecar spawn + stderr 캡처
apps/desktop/src/main.js            — health 폴링
services/local-ai/main.py           — FastAPI (CORS 추가됨)
services/local-ai/local-ai.spec     — PyInstaller spec
```

## 노트북에서 시작하는 법

```bash
# 1. clone 후
npm install

# 2. sidecar 재빌드 (순서 중요)
cd services/local-ai
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python model-download.py   # 모델 다운로드 (~30분)
.venv/Scripts/pyinstaller local-ai.spec --distpath ../../apps/desktop/src-tauri/sidecar-bin --workpath build --noconfirm

cd ../realtime
npx esbuild src/entry.ts --bundle --platform=node --target=node18 --format=cjs --outfile=dist/bundle.cjs --external:ws
npx pkg dist/bundle.cjs --target node18-win-x64 --output ../../apps/desktop/src-tauri/sidecar-bin/sorisori-realtime-x86_64-pc-windows-msvc.exe

# 3. NSIS 빌드
cd ../../apps/desktop
npm run tauri build
```
