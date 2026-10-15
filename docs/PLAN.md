# PLAN — 개발 단계

> **현재 Phase: 2 완료 → 3**
> 각 Phase는 독립적으로 동작 확인이 가능해야 한다. 완료 기준을 통과하면 체크하고 다음으로.

## 열린 질문 (결정 필요하면 여기에 적을 것)
- [x] 브라우저 피치 추출기: CREPE tiny(TF.js) vs pitchy(McLeod, 모델 없음) — Phase 0 스파이크에서 실제 녹음본으로 비교 후 결정. CREPE가 TF.js로 안정적으로 안 돌면 pitchy로 시작하고 `extractPitch()` 뒤에서 교체
  - → **확정: CREPE tiny 기본, pitchy 폴백.** 합성 + 실제 인터페이스 녹음 2개(중음역·저음역)에서 둘 다 옥타브 에러 0, 99% 일치. CREPE 선택 근거는 confidence 의미가 안정적(pitchy clarity 중앙값은 파일마다 0.66~0.79로 흔들려 임계치 0.9가 불안정)이고 GPU에서 4분 곡 4~8초라 속도 부담 없음. 폰 녹음은 미검증 — 문제 생기면 그때 재검토 (`spike/README.md`)
- [ ] 임계치 초기값(SPEC C-5의 25/50 cent, 60/120 ms)은 추정치. Phase 3에서 실제 팀 녹음본 5개 이상으로 "담당자가 귀로 잡은 구간"과 비교해 조정
- [ ] 가이드가 파트당 여러 개일 때 비교 대상: 최신 1개 vs 담당자가 지정 — 일단 최신, 필요하면 Phase 4에서 지정 UI

---

## Phase 0 — 피치 추출 스파이크 (앱 없이, 단일 HTML)
- [x] `spike/pitch.html`: 파일 선택 → decodeAudioData → 16kHz 리샘플 → CREPE tiny(TF.js) → f0/confidence를 캔버스에 그림
- [x] 같은 페이지에서 pitchy도 돌려서 두 곡선 겹쳐 보기
- [x] 합성 보컬 + 정답으로 수치 검증 (`spike/gen-test-wav.mjs`, `spike/run-headless.mjs`): RPA 99%, 옥타브 에러 0, 중앙 오차 2~3¢
- [x] CPU-only(wasm threaded) 4분 곡 처리 시간: CREPE 96초, pitchy 5.5초
- [x] 실제 녹음본으로 옥타브 에러·무성 구간 판정 확인 — 인터페이스 녹음 2개(중음역 MIDI 61~72, 저음역 50~59). 둘 다 옥타브 에러 0. 폰 녹음·화음 파트는 파일이 없어 미검증
- [x] 데스크톱(GPU webgl) 4분 곡: CREPE 3.8~7.8초, pitchy 1.5~1.8초. 모바일은 미측정
- [x] 열린 질문 1번 확정

**완료 기준**: 폰 녹음본에서도 옥타브 튐 없이 f0 곡선이 나오고, 모바일에서 4분 곡 2분 이내 처리

**Claude Code 시작 프롬프트**:
> CLAUDE.md와 docs/를 읽고 Phase 0을 진행해줘. 앱 뼈대 만들지 말고 spike/pitch.html 하나로 CREPE tiny TF.js 로딩이 되는지부터 확인해줘. marl/crepe 저장소의 web 디렉토리에 변환된 모델이 있는지 먼저 찾아봐.

---

## Phase 1 — 뼈대 + 순수 분석 라이브러리
- [x] Next.js + TypeScript strict + pnpm 초기화, vitest 설정
- [x] Prisma 설치, SPEC 데이터 모델로 schema.prisma, 첫 마이그레이션 (로컬 Postgres는 `docker-compose.yml`)
  - 마이그레이션 SQL은 DB 없이 `prisma migrate diff --from-empty --script` 로 생성. 로컬에서 `pnpm prisma migrate dev` 하면 그대로 적용됨
- [x] `/lib/analysis/types.ts`: `PitchTrack`, `PhraseResult`, `ReportSummary`
- [x] `/lib/analysis/thresholds.ts`: 임계치 상수 + `THRESHOLDS_VERSION`
- [x] `/lib/analysis/phrases.ts`: 가이드 PitchTrack → 소절 분할
- [x] `/lib/analysis/dtw.ts`: 밴드 제한 DTW, 워핑 경로 반환
- [x] `/lib/analysis/compare.ts`: `compare(guide, submission) → Report` (phrases + summary + globalOffset)
- [x] 테스트: 합성 PitchTrack으로 (a) 동일 입력 → 전부 OK, (b) 한 소절 +60cent → 그 소절만 RERECORD/PITCH_SHARP, (c) 전체 +100ms 시프트 → globalOffsetMs ≈ 100, (d) 한 소절 무성 → UNRELIABLE — 18개, 4분 길이 입력 1초 이내 포함
- [x] `.env.example` (DATABASE_URL, GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET, BLOB_READ_WRITE_TOKEN)

**완료 기준**: `pnpm typecheck && pnpm test` 통과. 분석 라이브러리는 브라우저·DB 없이 순수 함수로 테스트됨

---

## Phase 2 — 인증 + 프로젝트/파트/가이드
- [x] NextAuth v5(Google) 로그인 — 어댑터 없이 JWT 세션, 로그인 시 `User` upsert (`lib/auth.ts`)
- [x] `/projects`: 내 프로젝트 목록, 생성
- [x] `/projects/[id]`: 파트 추가/삭제, 초대 링크(`/join/[inviteCode]`), 멤버 목록
- [x] `/lib/pitch/extract.ts`: Phase 0 결과를 모듈화. `extractPitch(file, onProgress) → { track, durationMs }` (브라우저 전용, tf.js dynamic import, 백엔드 webgl → wasm → cpu)
  - 모델은 `/public/models/crepe-tiny/`, wasm 바이너리는 `/public/tfjs-wasm/`. COOP/COEP 는 걸지 않음(Blob 오디오·아바타 같은 교차 출처 리소스를 막아서). wasm 은 단일 스레드 폴백
- [x] 가이드 업로드: 파트 선택 → 브라우저 피치 추출(진행률) → Blob client upload(`/api/blob/upload`) → `POST /api/guides` (PitchTrack 검증 `lib/analysis/validate.ts`)
- [x] 가이드 재생 (`<audio>` Blob URL)
- [ ] 로컬 실동작 확인 — `.env` 에 GOOGLE_CLIENT_ID/SECRET, NEXTAUTH_SECRET, BLOB_READ_WRITE_TOKEN, DATABASE_URL 넣고 `docker compose up -d && pnpm prisma migrate dev && pnpm dev`

**완료 기준**: 로그인 → 프로젝트 생성 → 파트 2개 → 각 파트에 가이드 업로드 → GuideTrack 행에 pitch jsonb 채워짐

---

## Phase 3 — 제출 + 리포트
- [ ] `/projects/[id]/submit`: 파트 선택 → 파일 선택 → 추출 → 업로드 → `POST /api/submissions` → 서버에서 `compare()` 실행 → Report 저장
- [ ] `/submissions/[id]`: 소절 타임라인(verdict 색상), 소절별 표, 상단 요약 + 전역 오프셋 첨언
- [ ] 소절 클릭 → 가이드/녹음본 해당 구간 A/B 재생
- [ ] 멤버 뷰: 내 제출 목록(테이크별)
- [ ] 실제 팀 녹음본 5개로 임계치 조정 (열린 질문 2번)

**완료 기준**: 멤버가 녹음본 올리고 1분 안에 리포트 봄. 담당자가 귀로 잡았던 "나간 구간"이 RERECORD/FIXABLE로 잡히고, 멀쩡한 구간이 RERECORD로 뜨는 거짓 양성이 소절 기준 10% 미만

**이 Phase에서 가장 중요한 것**: 거짓 양성. 멤버가 "여기 멀쩡한데 왜 재녹음이래" 한 번 겪으면 서비스를 안 믿는다. 임계치를 보수적으로(느슨하게) 잡고 시작해서 조인다.

---

## Phase 4 — 담당자 뷰 + 운영
- [ ] `/projects/[id]`에 파트별 × 멤버별 제출 매트릭스, 요약 배지(재녹음 N / 보정 N)
- [ ] 임계치 버전 올렸을 때 `POST /api/projects/[id]/recompute`로 전체 Report 재계산 (재업로드 없이)
- [ ] 오래된 테이크 삭제 (Blob + 행)
- [ ] 배포 (Vercel + Neon + Vercel Blob)

**완료 기준**: 실제 팀 1곡 작업을 이 서비스로 끝까지 진행

---

## 이후 백로그
- 서버 측 피치 추출(RMVPE on Modal) — `extractPitch()` 교체, 노이즈 많은 녹음 대응
- 반주 섞인 파일 자동 보컬 분리(Demucs)
- 전역 오프셋 자동 보정 (가정 1 완화)
- 브라우저 내 녹음 (가이드 들으며 바로 녹음)
- 비브라토·끝음 길이·호흡 위치 비교
