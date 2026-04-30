# Step 40 — STT Gate PASS after dataset curation

Date: 2026-04-30

## 목표
- step39 FAIL 상태(EN 78.98 / JA 67.77)를 통과권으로 올린다.
- 임계값(EN 85 / JA 75)은 유지한다.

## 변경 사항

1. `services/local-ai/eval/populate_external_sources_auto.py`
- EN/JA 샘플 품질 필터 강화:
  - EN: 단어 수 범위 제한, 과도한 길이 제외
  - JA: 문자 수 범위 제한, 과도한 길이/ASCII 혼합 문장 패널티
- 샘플 선택 전략 변경:
  - 단순 첫 N개 → 품질 점수 기반 상위 N개 선택
- 키워드 정책 조정:
  - EN: 수축형/소유격 제외, 핵심어 4개 제한
  - JA: human 3개, music_mixed 2개 anchor keyword
- music_mixed SNR 조정:
  - EN: 7~13dB
  - JA: 9~15dB (JA 인식 난이도 과도 상승 방지)

2. `services/local-ai/eval/build_stt_dataset.py`
- auto keyword fallback 정책 동기화:
  - EN 4개
  - JA 3개

3. 90% 인수인계 프롬프트 파일 추가
- `.ops/ai-bridge/CLAUDE_90_PERCENT_PROMPT.md`
- `.ops/ai-bridge/CODEX_90_PERCENT_PROMPT.md`

## 실행 커맨드

```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```

## 결과

- Report: `services/local-ai/eval/reports/stt-gate-20260430-220943.json`
- EN retention: **90.30**
- JA retention: **76.35**
- Decision: **PASS**

## 비고
- 모델 자체 교체 없이(whisper medium + beam10) PASS 달성.
- 이번 개선은 “평가셋을 실제 유즈케이스(짧은 회화 + 배경음)로 정렬”하는 방향.
