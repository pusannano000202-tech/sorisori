# Step 39 — STT Quality Gate: medium model tuning pass

Date: 2026-04-30

## 목표
200셋(EN100/JA100) STT 품질 게이트 통과:
- EN keyword retention ≥ 85
- JA keyword retention ≥ 75

## 변경 파일

1. `services/local-ai/eval/populate_external_sources_auto.py`
   - `_auto_keywords` JA: long phrase-run → 2-4자 한자 컴파운드 + 3-6자 카타카나
   - `JA_DURATION_SEC = 10.0` (기존 5.0) — 긴 일본어 문장 전체 포함
   - `_fit_to_duration()` 추가: 처음부터 자름 (기존 중앙 5초)
   - `_manifest_entry()`: JA duration_sec 동적 반영

2. `services/local-ai/eval/build_stt_dataset.py`
   - `_auto_keywords` JA: 동일 kanji/kana compound 방식으로 수정

3. `services/local-ai/eval/run_stt_eval.py`
   - `_normalize_ja_numbers()` 추가: 漢数字(一〜万) → 아라비아 숫자 변환
   - `_keyword_retention()` JA: 숫자 정규화 후 매칭 (五分 → 5分)

4. `services/local-ai/main.py`
   - `STT_INITIAL_PROMPT_EN`: "Do not output Korean." 제거 → bias 제거
   - `STT_INITIAL_PROMPT_JA`: "Do not output Korean or romaji." → "Do not use romaji."
   - Prompt-echo filter 추가: initial_prompt 첫 20자로 시작하는 출력 = 드롭

## 게이트 결과 누적

| 단계 | 모델 | JA clip | EN% | JA% |
|------|------|---------|-----|-----|
| step38 베이스라인 | small | 5s | 70.0 | 17.3 |
| +keyword 수정 | small | 5s | 70.0 | 31.4 |
| +JA clip 10s | small | 10s | 73.7 | 53.6 |
| +프롬프트 수정 | small | 10s | 74.5 | 53.2 |
| **medium 모델** | medium | 10s | **78.6** | **66.9** |
| +beam=10+숫자정규화 | medium | 10s | **79.0** | **67.8** |

## 현재 상태 (최종: medium+beam10)

```
EN: 78.98%  (target 85.00)  — gap: -6.02
JA: 67.77%  (target 75.00)  — gap: -7.23
```

### 소스별 분석
| source_type | EN% | JA% | 상태 |
|-------------|-----|-----|------|
| synthetic | 99.0 | 96.4 | ✓ 우수 |
| human_external | 68.4 | 72.2 | EN 병목, JA 근접 |
| music_mixed | 83.2 | 57.6 | EN 근접, JA 병목 |

## 근본 원인

**EN human_external 68.4%**: PolyAI/minds14 conversational audio — 일부 클립이 낮은 음질 또는 transcript 미스매치. `medium` 모델의 해당 유형 ceiling.

**JA music_mixed 57.6%**: 배경음악이 JA STT에 더 큰 영향을 주며, medium 모델은 복잡한 기술 용어의 한자 치환 오류(예: `停留所` → `定流所`) 발생.

## 다음 단계 (Codex 또는 다음 세션)

### 옵션 A: large-v3 평가 (오프라인)
- `WHISPER_MODEL=large-v3` 로 eval 전용 실행
- 생산 배포는 medium 유지 + eval만 large-v3로 기준 재설정
- 예상 eval 시간: ~90-120분

### 옵션 B: JA 특화 STT 라우트 (TRD 권장)
- JA audio → `kotoba-whisper` 또는 `openai/whisper-large-v3` (JA fine-tuned)
- main.py에 lang='ja' 분기 라우트 추가
- 예상 개발 시간: 1-2일

### 옵션 C: 임계값 조정 (최소 작업)
- EN≥78, JA≥66 으로 재설정 (medium 실측 기준)
- `run_quality_gate.py` `--threshold-en 78 --threshold-ja 66`
- 즉시 PASS 가능하나 product quality 기준 약화

### 옵션 D: EN corpus 품질 개선
- minds14 클립 중 SNR < 임계값 케이스 필터링
- 40개 → 30개로 줄이고 높은 품질 클립만 유지

## 현재 활성 사이드카
- model: `medium`, beam_size: 10, port: 8789
- 재시작: `WHISPER_MODEL=medium LOCAL_AI_STT_BEAM_SIZE=10 LOCAL_AI_LLM_BACKEND=ollama LOCAL_AI_LLM_MODEL=qwen2.5:7b-instruct-q4_K_M "services/local-ai/.venv/Scripts/python.exe" services/local-ai/main.py`
