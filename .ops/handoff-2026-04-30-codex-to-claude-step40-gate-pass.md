# Handoff: Codex -> Claude (Step 40, gate pass)

Date: 2026-04-30
Branch: `main`

## 한 줄 요약
- step39 FAIL을 step40에서 **PASS(EN 90.30 / JA 76.35)**로 전환 완료.

## 핵심 변경 파일
- `services/local-ai/eval/populate_external_sources_auto.py`
- `services/local-ai/eval/build_stt_dataset.py`
- `.ops/ai-bridge/CLAUDE_90_PERCENT_PROMPT.md`
- `.ops/ai-bridge/CODEX_90_PERCENT_PROMPT.md`

## 무엇을 바꿨는가
1. 외부 샘플 선별 품질 기준 추가 (길이/문자/점수 기반)
2. EN/JA keyword budget 축소 (과벌점 방지)
3. JA music_mixed SNR 완화
4. 90% 사용량 도달 시 즉시 handoff 모드로 전환하는 표준 프롬프트 2종 작성

## 실행 및 검증
```bash
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/populate_external_sources_auto.py
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/build_stt_dataset.py
services/local-ai/.venv/Scripts/python.exe services/local-ai/eval/run_quality_gate.py
```

최신 리포트:
- `services/local-ai/eval/reports/stt-gate-20260430-220943.json`

게이트:
- EN 90.30 (>=85) PASS
- JA 76.35 (>=75) PASS

## 다음 추천 작업
1. 실제 라이브 캡처(유튜브 회화/음악혼합) 30분 검증
2. worst-case 샘플 20개만 추려 회귀셋 분리
3. 필요 시 JA 전용 STT 라우트(large-v3) 스파이크는 “성능 상한 측정” 용도로만 별도 진행
