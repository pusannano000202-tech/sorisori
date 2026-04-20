# Command Cheatsheet

이 문서는 Claude가 Codex 스타일 구현 요청을 만들 때 참고하는 요약이다.

## 자주 쓰는 명령

- 웹 타입체크: `npm run typecheck -w @sorisori/web`
- 웹 린트: `npm run lint -w @sorisori/web`
- 웹 빌드: `npm run build -w @sorisori/web`
- 데스크톱 체크: `npm run check -w @sorisori/desktop`
- 데스크톱 테스트: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- Cargo 포맷: `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml`

## 경로 기준

- 웹 앱: `apps/web`
- 데스크톱 앱: `apps/desktop`
- 공통 계약: `packages/contracts`
- 운영 로그: `.ops/task-log.md`
- 체크포인트: `.ops/checkpoints/`

## 요청 문장 예시

- `docs/TRD.md와 apps/desktop/src-tauri/src/audio/*.rs를 읽고, 장시간 loopback worker로 승격하는 설계를 리뷰해줘.`
- `responses/에 결론, 리스크, Codex용 바로 실행 가능한 액션으로 남겨줘.`
