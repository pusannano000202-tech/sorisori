# Decision 0004 - Direct `ja->ko` Translation Strategy

- Date: 2026-04-23
- Status: In Progress
- Owner: Codex

## Context

현재 로컬 번역 스택은 다음처럼 동작한다.

- 영어 입력: `Argos en->ko` direct
- 일본어 입력: `Argos ja->en` 후 `Argos en->ko` bridge
- 영어 fallback: `MarianMT en->ko`

이 구조는 영어에는 최소한의 의미 전달이 가능하지만, 일본어에는 구조적으로 불리하다.

1. 일본어와 한국어는 어순과 문법이 가까워 direct 번역의 이점이 크다.
2. `ja->en->ko` bridge는 중간 단계에서 의미가 축약되거나 어조가 평평해진다.
3. 실측 결과 현재 일본어 샘플은 요약/축약 경향이 강하다.

## Verified Local Findings

### Argos package availability

로컬 패키지 인덱스를 직접 확인한 결과:

- 사용 가능: `en->ko`
- 사용 가능: `ja->en`
- 직접 확인되지 않음: `ja->ko`

즉, Argos만으로는 현재 direct `ja->ko` 경로를 바로 구성하기 어렵다.

### Direct model spike

로컬 캐시에 이미 존재하던 `facebook/nllb-200-distilled-600M`으로 `jpn_Jpan -> kor_Hang` direct 변환을 시험했다.

스파이크 시 `AutoTokenizer(..., use_fast=False)` 경로가 필요했다.

단일 샘플 기준:

- bridge 결과보다 의미 보존이 더 좋았고
- "모든 장면에서 오류를 볼 수 없다" 같은 왜곡이 줄었으며
- 한국어 문장 구조도 더 자연스러웠다

## Decision

일본어는 더 이상 `ja->en->ko` bridge를 최종 전략으로 보지 않는다.

다음 원칙으로 direct `ja->ko` 경로를 별도 구축한다.

1. 기본 추천안은 `NLLB-200 distilled 600M` direct `ja->ko` 스파이크다.
2. 현재 bridge 경로는 즉시 삭제하지 않고 fallback으로 유지한다.
3. direct 경로는 feature flag 또는 env flag 뒤에서 먼저 검증한다.
4. 영어 경로(`en->ko`)는 당장 건드리지 않는다.

## Implementation Status

Step 26-A first slice landed on `2026-04-23`.

- `services/local-ai/main.py`
  - direct `ja->ko` route added
  - env routing added: `LOCAL_AI_JA_TRANSLATION_MODE=auto|bridge|direct`
  - cached local NLLB snapshot auto-discovery added for dev/runtime stability
- `services/local-ai/model-download.py`
  - direct Japanese model download path added
- `services/local-ai/local-ai.spec`
  - NLLB/M2M100 hiddenimports added
- runtime validation:
  - `GET /health` now reports `translation_engines.ja_direct=true`
  - direct Japanese sample produced better fidelity than the old bridge path

## Recommended Step Plan

### Step 26-A - Direct engine spike

목표:

- `services/local-ai` 안에 direct `ja->ko` translator 함수 추가
- `source_lang == "ja"`일 때 direct 경로를 시도
- 실패 시 현재 bridge 경로로 fallback

후보:

- 1순위: `facebook/nllb-200-distilled-600M`
- 2순위: 다른 direct `ja->ko` Hugging Face 모델 조사

### Step 26-B - Routing and observability

목표:

- health 응답에 일본어 번역 엔진 상태 노출
- 번역 로그에 `engine=ja-ko-direct` / `engine=ja-en-ko-bridge` 태깅
- env 예시:
  - `LOCAL_AI_JA_TRANSLATION_MODE=auto`
  - `LOCAL_AI_JA_DIRECT_MODEL=facebook/nllb-200-distilled-600M`

### Step 26-C - Quality verification

최소 검증 세트:

- 일상 대화형 10문장
- 유튜브 강의형 10문장
- 게임/방송체 10문장

통과 기준:

- bridge보다 의미 누락이 줄어들 것
- 과도한 요약/축약이 줄어들 것
- 문장 단위 처리 시간은 현재 local-ai 체감 속도를 크게 해치지 않을 것

## File-by-File Implementation Plan

### `services/local-ai/main.py`

- direct `ja->ko` 모델 로더 추가
- direct translate helper 추가
- `translate()` 라우팅 우선순위 수정
  - `ja` + direct 준비됨 -> direct
  - direct 실패 -> bridge
  - 최종 실패 -> `422`

### `services/local-ai/model-download.py`

- direct `ja->ko` 모델 다운로드 옵션 추가
- Argos 패키지 설치와 direct 모델 다운로드를 분리

### `services/local-ai/local-ai.spec`

- direct 모델에 필요한 tokenizer/model hiddenimports 보강
- sidecar 번들링 시 direct 모델 경로가 문제 없는지 점검

### `services/local-ai/test_text_processing.py`

- 일본어 direct 우선 테스트 추가
- direct 실패 시 bridge fallback 테스트 추가

### Optional new files

- `services/local-ai/testdata/ja-ko-smoke.json`
- `services/local-ai/eval_ja_ko_models.py`

## Risks

1. `NLLB-200 distilled 600M`는 Argos보다 무거워 first-load가 느릴 수 있다.
2. direct 품질이 좋아도 sidecar 크기나 메모리 사용량이 올라갈 수 있다.
3. Japanese STT 자체가 아직 Whisper `task=translate`에 일부 의존하는 경우, 번역만 direct로 바꿔도 한계가 남을 수 있다.

## Immediate Next Step

Claude Code에게 요청할 것:

1. direct `ja->ko` 후보 모델 추가 조사
2. `NLLB direct`를 현재 local-ai 구조에 넣는 safest file plan 검토
3. first-slice 구현 범위를 `main.py + test + env` 수준으로 제한할지 판단
