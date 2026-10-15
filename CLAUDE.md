# CLAUDE.md

## 프로젝트
단체 보컬 녹음용 음정·박자 체크 서비스. 멤버가 녹음본을 올리면 가이드 보컬과 비교해 소절별로 "OK / 보정 가능 / 재녹음"을 판정한다.
제품 스펙은 `docs/SPEC.md`, 개발 단계는 `docs/PLAN.md`를 먼저 읽을 것. 현재 진행 중인 Phase는 PLAN.md 상단에 표시돼 있다.

## 기술 스택
- Next.js (App Router), TypeScript strict, pnpm
- Prisma + PostgreSQL
- 피치 추출: 브라우저 (TF.js CREPE tiny 또는 pitchy — PLAN 열린 질문 1번)
- 저장: Vercel Blob (오디오), Postgres (분석 결과)
- 테스트: vitest
- LLM·Python·GPU 서버 없음

## 명령
- `pnpm dev` / `pnpm build` / `pnpm test` / `pnpm typecheck` / `pnpm lint`
- 스키마 변경 후 반드시 `pnpm prisma generate` → `pnpm prisma migrate dev`

## 규칙
- 마이그레이션 파일은 삭제하지 않는다
- 컴포넌트는 `/components`, API 라우트는 `/app/api`
- 비교·판정 로직은 `/lib/analysis` 하위에만 둔다. **순수 TS, 외부 의존성·DOM·DB 접근 금지** — vitest로 합성 데이터 테스트가 가능해야 한다
- 피치 추출은 `/lib/pitch` 하위에만 둔다. 브라우저 전용(`'use client'`), 서버 컴포넌트에서 import 금지
- 임계치는 `/lib/analysis/thresholds.ts` 한 곳에서만 정의하고, 바꿀 때 `THRESHOLDS_VERSION`을 올린다. 코드 곳곳에 숫자를 직접 쓰지 않는다
- 피치 추출기를 바꿔도 `extractPitch(file, onProgress) → PitchTrack` 시그니처는 유지한다
- 오디오 파일은 API 라우트 바디로 받지 않는다 (4.5MB 한도). 반드시 Blob client upload
- 환경변수는 `.env.example`에 키 이름만 적고, 실제 값은 커밋하지 않는다

## 작업 방식
- Phase 하나를 끝낼 때마다 `pnpm typecheck && pnpm test`가 통과해야 완료로 본다
- 완료하면 PLAN.md의 체크박스를 갱신하고 커밋한다
- 스펙에 없는 결정이 필요하면 임의로 진행하지 말고 PLAN.md의 "열린 질문"에 적고 물어본다

## 커밋
- 한국어, 마침표 없이, 첫 줄 50자 이내
