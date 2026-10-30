# SPEC — hyo sync

단체 보컬 녹음(합창/떼창 파트)에서 멤버 녹음본이 가이드 보컬과 **음정·박자가 얼마나 벗어났는지**를 자동으로 잡아주는 서비스.
담당자 한 명이 모든 파일을 귀로 듣고 피드백하던 병목을 없애는 것이 목적.

## 범위 (MVP)
- 입력: 가이드 보컬 파일(파트별 1개) + 멤버 녹음 파일. 둘 다 **드라이 보컬**(반주 없음), **싱크 맞춰진 상태**로 업로드된다고 가정
- 출력: 소절(phrase) 단위 리포트 — 음정 편차(cent), 타이밍 편차(ms), 판정(OK / 보정 가능 / 재녹음)
- 분석 위치: **피치 추출은 브라우저**, 비교·판정은 서버(순수 TS). Python·GPU·별도 분석 서버 없음
- 저장: 원본 오디오는 Vercel Blob, 분석 결과는 Postgres. 담당자가 문제 구간을 클릭해서 들어볼 수 있어야 함
- 로그인: Google OAuth
- LLM 사용 안 함

## 가정 (사용자가 지켜야 하는 것)
1. 가이드와 녹음본의 시작점이 맞춰져 있다 (전역 오프셋 0). 전체적으로 밀린 경우 리포트에 "전체 +80ms 늦음"처럼 **첨언만** 하고 보정하지 않는다
2. 화음 파트는 파트별로 가이드를 따로 올린다. 멤버는 제출 시 파트를 고른다
3. 파일은 **드라이** 보컬만 들어 있다 (반주·리버브 없음). 반주 분리는 하지 않는다. 리버브 꼬리는 에너지 게이트로 걸러지지 않아 무성 구간을 메워 버린다 (Phase 0 확인)
4. 녹음 환경 편차(폰/인터페이스)는 피치 추출기의 confidence로 다룬다. 신뢰도 낮은 구간은 판정하지 않고 "판정 불가"로 표시

## 역할
- **담당자**(프로젝트 생성자): 프로젝트(곡) 생성, 파트별 가이드 업로드, 초대 링크 공유, 모든 제출 리포트 열람, 문제 구간 재생
- **멤버**: 초대 링크로 참여, 파트 선택 → 녹음본 업로드 → 본인 리포트 확인. 같은 프로젝트의 다른 멤버 제출도 볼 수 있음 (팀 작업이므로 숨기지 않음)

## 데이터 모델 (Prisma 기준 초안)
```
User          id, email, name, image
Project       id, title, ownerId, inviteCode, createdAt
ProjectMember id, projectId, userId, joinedAt            @@unique([projectId, userId])
Part          id, projectId, name("멜로디"|"화음1"|…), order
GuideTrack    id, partId, blobUrl, durationMs, sampleRate,
              pitch(jsonb: PitchTrack), uploadedById, createdAt
Submission    id, partId, userId, blobUrl, durationMs, take(int),
              pitch(jsonb: PitchTrack),
              status(UPLOADED|ANALYZED|FAILED), createdAt
Report        id, submissionId(unique), guideTrackId, thresholdsVersion,
              globalOffsetMs, summary(jsonb: ReportSummary),
              phrases(jsonb: PhraseResult[]), createdAt
Instrumental  id, projectId, blobUrl, durationMs, uploadedById, createdAt   (확장 A: 믹서용 반주, 최신 1개 사용)
TrackComment  id, submissionId, authorId, startMs, endMs, body, createdAt   (확장 A: 담당자 구간 피드백)
```

`PitchTrack` (브라우저에서 추출, 그대로 저장):
```ts
{ hopMs: 10, frames: number, f0Cents: (number|null)[], confidence: number[] }
// f0Cents: A4=440Hz 기준 cent (MIDI 69 = 6900). confidence < VOICED_MIN이면 null
// 4분 곡 ≈ 24,000프레임 ≈ 300KB. jsonb로 충분
```

`PhraseResult`:
```ts
{
  index: number,
  guideStartMs: number, guideEndMs: number,     // 가이드 기준 소절 구간
  subStartMs: number,   subEndMs: number,       // 녹음본에서 대응되는 구간 (DTW 결과)
  pitch:  { medianCents: number, meanAbsCents: number },
  timing: { onsetMs: number, medianMs: number },  // +면 늦음, −면 빠름
  coverage: number,                             // 판정에 쓴 유성 프레임 비율 0~1
  verdict: 'OK' | 'FIXABLE' | 'RERECORD' | 'UNRELIABLE',
  reasons: string[]                             // ['PITCH_FLAT', 'TIMING_LATE', ...]
}
```

## 파이프라인

### A. 피치 추출 (브라우저, `/lib/pitch`)
1. `<input type=file>` → `AudioContext.decodeAudioData` (mp3/wav/m4a 네이티브 디코딩, ffmpeg 불필요)
2. 모노 믹스다운 → `OfflineAudioContext`로 **16kHz 리샘플**
3. CREPE tiny (TF.js) 로 10ms hop f0 + confidence 추출
   - 가중치 ~2MB, 모델은 `/public/models/crepe-tiny/`에 정적 배포
   - 4분 곡 기준 데스크톱 10~20초, 모바일 30~60초 예상 → 진행률 표시 필수
4. 후처리: confidence < `VOICED_MIN`(0.5) → null, 3프레임 median filter, Hz → cent
5. 결과 `PitchTrack` JSON + 원본 오디오를 서버로

### B. 업로드 (브라우저 → Vercel Blob / API)
- 오디오: Vercel Blob **client upload** (`handleUpload` 토큰 방식). API 라우트 4.5MB 바디 한도 우회
- PitchTrack: `POST /api/submissions` (수백 KB JSON, 한도 내)
- 가이드도 같은 경로. 가이드는 파트당 여러 개 올릴 수 있고 최신 것이 기본 비교 대상

### C. 비교·판정 (서버, `/lib/analysis` 순수 TS, 외부 의존성 없음)
1. 가이드·녹음본 PitchTrack 로드 (같은 hop)
2. **소절 분할**: 가이드의 무성 구간이 `PHRASE_GAP_MS`(300ms) 이상이면 경계. 소절 길이 < 400ms는 앞 소절에 합침
3. **DTW**: cent 곡선 두 개, cost = |Δcent| (한쪽만 무성이면 `UNVOICED_PENALTY`), Sakoe-Chiba 밴드 ±`DTW_BAND_MS`(1000ms)
   - 가정 1 덕분에 밴드가 좁아도 됨. 24k × 200 ≈ 5M 셀, 서버리스에서 1초 이내
4. 워핑 경로에서 소절별로:
   - `timing.onsetMs` = 녹음본 소절 시작 − 가이드 소절 시작
   - `timing.medianMs` = 소절 내 경로의 대각선 이탈량 중앙값
   - `pitch.medianCents` = 경로상 Δcent 중앙값 (부호 있음: +샤프, −플랫)
   - `pitch.meanAbsCents` = |Δcent| 평균
   - `coverage` = 양쪽 다 유성인 프레임 / 가이드 유성 프레임
5. **판정** (`/lib/analysis/thresholds.ts` 한 곳에서 관리, `thresholdsVersion` 올려서 재판정 가능):
   | 항목 | OK | FIXABLE | RERECORD |
   |---|---|---|---|
   | \|pitch.medianCents\| | < 25 | 25 ~ 50 | ≥ 50 |
   | \|timing.onsetMs\| | < 60 | 60 ~ 120 | ≥ 120 |
   | coverage | ≥ 0.5 이면 판정, 미만이면 `UNRELIABLE` |
   - 소절 verdict = 항목 중 최악
6. `globalOffsetMs` = 전 소절 `timing.onsetMs` 중앙값. |값| ≥ 60ms면 리포트 상단에 첨언
7. `summary` = { ok, fixable, rerecord, unreliable 소절 수, worstPhrases: 상위 3개 }

비교는 서버에서 하는 이유: 임계치를 바꾸면 **재업로드 없이** 전체 리포트를 다시 계산할 수 있어야 하고, 순수 함수라 vitest로 테스트하기 쉬움.

### D. 리포트 화면
- 소절 타임라인: 색상 = verdict. 클릭 → 해당 구간 가이드/녹음본 A/B 재생 (Blob URL, `<audio>` + `currentTime`)
- 소절별 표: 음정 편차(cent, ♯/♭ 표시), 타이밍(ms, 빠름/늦음), 판정, 사유
- 상단 요약: 재녹음 N소절 / 보정 가능 N소절, 전역 오프셋 첨언
- 담당자 뷰: 파트별 × 멤버별 제출 목록 + 요약 배지

## 비용
- Claude API: 없음
- Vercel Blob: 녹음본 1개 ≈ 5MB(mp3) ~ 40MB(wav). 프로젝트당 멤버 8명 × 테이크 3개 ≈ 1GB 이내. Hobby 한도 안에서 시작, 넘으면 오래된 테이크 삭제 정책 추가
- Postgres: PitchTrack jsonb 300KB × 제출 수. Neon 무료 티어로 충분

## 하지 않는 것 (MVP 제외)
- 전역 싱크 자동 보정 (가정 1) — 첨언만
- 반주 분리(Demucs 등) — 2단계
- 서버 측 피치 추출(RMVPE/Modal) — `extractPitch()` 시그니처만 고정해 두고 2단계에서 교체 가능하게
- LLM 자연어 피드백
- 브라우저 내 녹음 (파일 업로드만)
- 비브라토·호흡·발음 분석
