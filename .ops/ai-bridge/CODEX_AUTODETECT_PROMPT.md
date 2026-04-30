# Codex 자동 감지 시작 프롬프트

> 이 파일 내용을 Codex 세션 시작 시 그대로 붙여넣으면 됩니다.

---

## 지시

너는 아래 프로젝트의 자동 실행 에이전트다.
권한 프롬프트 없이(자동 승인 모드) 즉시 아래 절차를 따라라.

### 마감
**2026-05-02 13:00 KST** 이후에는 새 작업을 시작하지 말 것.
마감 도달 시 → 진행 중 작업 중단 → checkpoint + codex-to-claude handoff 작성 → 종료.

### 프로젝트 경로
```
C:/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스
```

---

## 1단계: 신규 handoff 파일 감지

아래 명령을 실행해서 Claude→Codex 방향의 handoff 파일 중 가장 최신 파일을 확인해라:

```bash
ls -t "/c/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스/.ops/"handoff-*claude-to-codex*.md 2>/dev/null | head -5
```

현재 네가 이미 처리한 마지막 파일:
- `handoff-2026-04-30-claude-to-codex-step39-stt-gate-tuning.md`

> Claude가 이미 처리한 Codex→Claude 핸드오프:
> - `handoff-2026-04-30-codex-to-claude-step40-gate-pass.md`
> - `handoff-2026-04-30-codex-to-claude-step41-ja-loanword-followup.md`

위 파일보다 **최신 파일(날짜가 더 크거나, 같은 날짜면 step 번호가 더 큰 것)**이 있으면 → 즉시 그 파일을 읽고 3단계로.

신규 파일이 없으면 → 2단계(폴링 루프)로.

---

## 2단계: 자동 폴링 루프 설정 (신규 파일 없을 때)

`CronCreate` 툴이 있으면 아래 설정으로 30분마다 자동 감지 루프를 등록해라:

```
cron: "13,43 * * * *"
recurring: true
durable: true
prompt: (아래 내용 그대로)
```

**폴링 prompt 내용:**
```
자동 handoff 감지. 실행:
1. ls -t "/c/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스/.ops/"handoff-*claude-to-codex*.md | head -3
2. handoff-2026-04-30-claude-to-codex-step39-stt-gate-tuning.md 보다 최신 파일 있으면 읽고 작업 시작.
3. 없으면 "대기 중 HH:MM" 한 줄만 출력.
토큰 90% 도달 시 즉시 .ops/handoff-YYYY-MM-DD-codex-to-claude-<step>.md 작성 후 중단.
```

`CronCreate`가 없으면: `/loop` 명령으로 동적 루프 모드 진입 후 아래 지시대로 30분 간격 ScheduleWakeup 사용.

---

## 3단계: 신규 handoff 처리

1. 파일을 읽는다
2. "다음 작업", "Suggested next steps", "권장 순서" 섹션을 찾아 순서대로 실행
3. 작업 완료 후 반드시:
   - `.ops/checkpoints/YYYY-MM-DD-step<N>-<이름>.md` 작성
   - `.ops/handoff-YYYY-MM-DD-codex-to-claude-step<N>-<이름>.md` 작성
   - `.ops/ai-bridge/shared-context.md` "다음 우선순위" 섹션 갱신
   - 변경 파일 커밋

---

## 토큰 90% 규칙 (필수)

5시간 사용량 윈도우 기준 **90% 이상** 도달 시:
- 즉시 개발 중단
- `.ops/handoff-YYYY-MM-DD-codex-to-claude-step<N>-<진행상황>.md` 작성
- `.ops/checkpoints/` 에 현재 상태 기록
- `shared-context.md` 갱신
- 커밋

---

## 프로젝트 현재 상태 요약

- **STT**: faster-whisper `medium` 모델, beam=10, port 8789
- **번역**: Ollama + Qwen2.5-7B (chrF 51.22)
- **STT 게이트**: EN 90.30% / JA 79.80% (목표 EN≥85, JA≥75) — **PASS** ✅
  - 세부: EN human_external 88.61 / EN music_mixed 85.34 / JA human_external 82.61 / JA music_mixed 69.49
- **다음 작업**: 라이브 캡처 30분 검증 / JA music_mixed → large-v3 스파이크 (선택)
- **사이드카 재시작 명령**:
  ```bash
  cd "/c/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스"
  WHISPER_MODEL=medium LOCAL_AI_STT_BEAM_SIZE=10 LOCAL_AI_LLM_BACKEND=ollama \
    LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M \
    "services/local-ai/.venv/Scripts/python.exe" services/local-ai/main.py &
  ```
- **상세 컨텍스트**: `.ops/ai-bridge/shared-context.md`
- **최신 체크포인트**: `.ops/checkpoints/2026-04-30-step41-ja-loanword-normalization-and-gate.md`
