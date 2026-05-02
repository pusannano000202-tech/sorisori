# Handoff — Claude → Codex — Step 29 Live Verify (진행 중)

- Date: 2026-04-28 21:50 (KST)
- From: Claude (사용자 지시로 인계 모드 진입)
- To: Codex
- Branch: `main` (미커밋)

## 현재 라이브 한 줄 상태

사용자가 **지금 라이브 검증을 막 시작했다**. packaged NSIS 인스톨러로 깔린
`SoriSori Desktop`을 실행했고, 디버그 패널 "사이드카 상태/로그"에서 부팅 로그를
보고 있는 중. 자막은 아직 안 띄움.

핵심 발견:
- packaged 데스크톱 앱은 16:05 빌드된 옛날 사이드카를 spawn 하려고 시도
- 그러나 우리 dev LLM 사이드카가 이미 포트 8789를 점유 중
- 결과: packaged sidecar는 OSError로 죽고, **데스크톱 앱은 우리 LLM 사이드카에
  자동으로 붙음** → 디버그 화면 raw JSON에 `llm.ready: true` 보임 (2150 KST에
  curl로 확인 완료)

즉 빠른 검증 경로(①)가 **결과적으로 작동 중**. 사용자에게 이미 전달.

## 사용자가 다음에 할 것 (이미 안내했음)

1. 디버그 패널 raw JSON에서 `"llm": {"ready": true, ...}` 확인
2. 유튜브 영상 (영어 회화 / 일본어 인사) 틀고 자막 품질 보기
3. 4가지 평가:
   - (a) 자막 자연스러움 (chrF 점수만큼 좋아 보이는가)
   - (b) 1.5초 추가 지연 견딜 만한가
   - (c) 다국어 leak (中文/English 토큰 자막에 섞임) 빈도
   - (d) 안정성 (끊김 없이 지속되는가)

## 너(Codex)가 받을 다음 입력

사용자가 위 4가지 결과를 알려줄 것. 그 결과에 따라 후속 작업:

- **다 OK** → GitHub remote push 준비 (사용자가 레포 URL 줘야 함)
- **품질 부족** → option B: `ollama pull qwen2.5:14b-instruct-q4_K_M` →
  `services/local-ai/eval/run_eval.py --baseline ...` 재측정
- **콜드스타트 거슬림** → step28 체크포인트의 "Optional warmup" 두 패턴 중 선택
  - 사이드카: `_load_translation()` 끝에 `_translate_with_llm("hello", "en", "ko")` 한 번
  - 데스크톱: 세션 start 시 throwaway translate 1회
- **지연 너무 무거움** → `qwen2.5:3b-instruct-q4_K_M` eval 비교 또는 옵션 C 검토
- **일반 출하 준비** → option C-lite (앱 첫 실행 시 Ollama 자동 다운로드) 1일 작업

## 직전까지 끝낸 것 (재현하지 마)

전체 변경 파일 목록은 `.ops/checkpoints/2026-04-28-1900-step29-option-a-desktop-wiring.md`
참고. 요약:

- `services/local-ai/main.py` — LLM 경로 (env, probe, sanitize, translate,
  /health 노출, 3 새 drop counter)
- `services/local-ai/eval/run_eval.py` — UTF-8 stdout 강제
- `services/local-ai/eval/baseline-argos-nllb.json` — chrF 30.70 baseline
- `services/local-ai/eval/run-qwen25-7b.json` — chrF 51.22 (+20.52, 67% 개선)
- `apps/desktop/src-tauri/src/lib.rs` — LLM env 3개 주입
- `apps/desktop/src/main.js` — `formatHealthSummary()` + UI 요약
- `docs/ollama-setup.md` — 한국어 설치 가이드
- `.ops/ai-bridge/shared-context.md` — 진행 상황 + 90% 임계값 갱신
- `.ops/checkpoints/2026-04-28-1830-step28-llm-translate-path.md`
- `.ops/checkpoints/2026-04-28-1900-step29-option-a-desktop-wiring.md`
- `.ops/ai-bridge/CLAUDE_90_PERCENT_PROMPT.md` — 영구 codex→claude 인계
  프롬프트 (이전 93% 파일 갱신·이름 변경)
- `.ops/ai-bridge/CODEX_90_PERCENT_PROMPT.md` — 영구 claude→codex 인계
  프롬프트 (신규)

## 검증된 것

- `services/local-ai/.venv/Scripts/python.exe -m py_compile services/local-ai/main.py` OK
- `cargo check` (apps/desktop/src-tauri) OK
- `node --check apps/desktop/src/main.js` OK
- `curl /health` → `llm.ready=true, model=qwen2.5:7b-instruct-q4_K_M`
- eval re-run +20.52 chrF over baseline

## 라이브 사이드카 PID 정보

dev LLM 사이드카는 background bash task `bouabtgbe`로 띄워져 있음. 죽으면:

```bash
cd "/c/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스"
LOCAL_AI_LLM_BACKEND=ollama LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M \
  "services/local-ai/.venv/Scripts/python.exe" services/local-ai/main.py &
```

부팅 후 `/health`에 `whisper_ready: true, llm.ready: true` 둘 다 떠야 라이브
검증 가능.

## 미커밋 변경 — 건드리지 마

`.gitignore`, `.claude/`, `services/local-ai/test_text_processing.py` (step27
드롭 카운터 테스트), 두 `.docx` 파일, `.bkit/`, `.ops/image/`, `docs/image/`,
`apps/desktop/src-tauri/src/lib.rs` (LLM env 주입 라인 외 다른 변경 절대 X).

## 종료 규칙

- 라이브 검증 결과를 받아 후속 작업까지 끝나면
  `.ops/checkpoints/2026-04-28-XXXX-step30-*.md` 작성
- `shared-context.md` "다음 우선순위" 섹션 갱신
- 토큰 사용량 5h 윈도우 90% 도달 시 즉시 인계 모드 (Claude로 다시 인계는
  `.ops/ai-bridge/CLAUDE_90_PERCENT_PROMPT.md` 사용)
