# Step 43 Checkpoint (2026-05-01)

## Goal
JA music_mixed 69.49 → 85 달성을 위한 오디오 전처리 추가.

## Code changes
- `services/local-ai/main.py`
  - `_preprocess_ja_audio()` 함수 추가 (numpy only):
    - FFT high-pass filter: 0-80Hz → 0, 80-120Hz → ramp, >120Hz → 1
    - Pre-emphasis: y[n] = x[n] - 0.97*x[n-1]
    - RMS normalize to 0.1 (-20dBFS)
  - `/transcribe` 엔드포인트: `using_ja_model=True` 조건 시 전처리 적용

## Gate result
- Report: `services/local-ai/eval/reports/stt-gate-20260501-013217.json`
- EN: 90.30% (>=85) ✅
- JA: 86.36% (>=75) ✅
- JA human_external: 87.91%
- JA music_mixed: 84.00% (목표 85 기준 -1%)

## Comparison
| | step41 | step42 | step43 |
|---|---|---|---|
| JA music_mixed | 69.49 | 79.66 | **84.00** |
| JA 전체 | 79.80 | 85.35 | **86.36** |

## Remaining gap
- JA music_mixed 84.00 → 85 (-1%) → 추가 전처리 또는 beam_size 증가로 도달 가능성 있음
- 전체 게이트는 이미 충분한 마진으로 PASS
