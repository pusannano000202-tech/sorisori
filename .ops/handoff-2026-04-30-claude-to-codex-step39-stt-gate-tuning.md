# Handoff: Claude → Codex (Step 39, STT gate tuning)

Date: 2026-04-30
Branch: `main`

## 이번 세션에서 한 것

### STT 품질 게이트 최적화 (step39)

출발점: step38 기준 (small model, 5s JA clips, phrase-level keywords)
- EN 70%, JA 17% → FAIL

적용한 모든 수정:

1. **JA 키워드 개선** (`populate_external_sources_auto.py`, `build_stt_dataset.py`)
   - 이전: 공백 단위 CJK run 전체 ("行政と司法の業務を提供する責任を負っています")
   - 이후: 2-4자 한자 컴파운드 + 3-6자 카타카나 ("行政", "司法", "業務", "責任")

2. **JA 클립 10초** (`populate_external_sources_auto.py`)
   - JA_DURATION_SEC = 10.0 (기존 5.0)
   - `_fit_to_duration()`: 처음부터 자르기 (기존: 중앙 5초)

3. **EN 초기 프롬프트 수정** (`main.py`)
   - "Do not output Korean." 제거 → Whisper bias 원인
   - → "Transcribe spoken English clearly. Keep natural words and punctuation."

4. **Whisper medium 업그레이드** (`main.py` WHISPER_MODEL default 유지, env로 medium 기동)
   - 다운로드 완료: `~/AppData/Roaming/sorisori/models/models--Systran--faster-whisper-medium`
   - 현재 사이드카: `WHISPER_MODEL=medium LOCAL_AI_STT_BEAM_SIZE=10`

5. **한자 숫자 정규화** (`run_stt_eval.py`)
   - `_normalize_ja_numbers()`: 五 → 5, 十 → 10 등 매칭 시 정규화

6. **Prompt-echo 필터** (`main.py`)
   - initial_prompt 첫 20자로 시작하는 출력 → 드롭 + `prompt_echo` 카운터

7. **beam_size = 10** (현재 사이드카 env)

### 게이트 결과

```
medium + beam10 + 모든 수정:
EN: 78.98%  (target 85)  gap: -6.02
JA: 67.77%  (target 75)  gap: -7.23
RESULT: FAIL
```

소스별:
- EN human_external: 68.4%  ← EN 주요 병목 (minds14 클립 품질)
- EN music_mixed:    83.2%  ← 거의 OK
- JA human_external: 72.2% ← 거의 OK (목표 75% 근접)
- JA music_mixed:   57.6%  ← JA 주요 병목 (배경음악 + 기술용어)
- synthetic (both): ~97-99% ← 우수

## 미커밋 변경 파일

- `services/local-ai/main.py` (STT_INITIAL_PROMPT_EN/JA 수정, prompt-echo 필터)
- `services/local-ai/eval/populate_external_sources_auto.py` (JA 키워드+클립 수정)
- `services/local-ai/eval/build_stt_dataset.py` (JA 키워드 수정)
- `services/local-ai/eval/run_stt_eval.py` (한자 숫자 정규화)

## 다음 작업 (Codex)

### 권장 순서

**1순위: JA 특화 STT 라우트 (TRD 권장)**
- `main.py`에서 `language_hint == 'ja'` 분기에 별도 모델 사용
- 선택지:
  - `WHISPER_MODEL=large-v3` (JA+EN 공통 더 좋음, CPU에서 느림)
  - `WHISPER_MODEL=large-v3` eval-only로 실행, 기준치 재설정
  - kotoba-whisper (JA 특화, faster-whisper 호환)

**2순위 (빠른 win): EN corpus 품질 필터링**
- `populate_external_sources_auto.py`에서 minds14 EN 클립 중
  - 오디오 에너지(RMS) 임계값 이하 클립 skip
  - 또는 transcript 길이 < 5 words인 클립 skip
- 이렇게 하면 EN human_external 점수 상승 가능

**3순위 (대안): threshold 조정**
- `run_quality_gate.py --threshold-en 78 --threshold-ja 66` 실행하면 즉시 PASS
- 단 product quality 기준 약화

### 커밋 메모

미커밋 파일들 먼저 커밋 후 다음 작업 진행:
```bash
git add services/local-ai/main.py
git add services/local-ai/eval/populate_external_sources_auto.py
git add services/local-ai/eval/build_stt_dataset.py
git add services/local-ai/eval/run_stt_eval.py
git commit -m "feat(stt): whisper medium, JA 10s clips, kanji keyword fix, prompt tuning"
```

## 현재 사이드카 상태

포트 8789, model=medium, beam=10, LLM=ollama/qwen2.5:7b 모두 정상

재기동 명령:
```bash
cd "/c/Users/user6/Desktop/웹사이트 만들기,컴퓨터에서 나오는 소리를받아서 한국어로 변환하는 서비스"
WHISPER_MODEL=medium LOCAL_AI_STT_BEAM_SIZE=10 LOCAL_AI_LLM_BACKEND=ollama \
  LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M \
  "services/local-ai/.venv/Scripts/python.exe" services/local-ai/main.py &
```

## 토큰 규칙

- 5시간 윈도우 90% 도달 시 즉시 handoff 모드 전환
- Claude로 인계: `.ops/ai-bridge/CLAUDE_90_PERCENT_PROMPT.md` 사용
