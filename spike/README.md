# Phase 0 — 브라우저 피치 추출 스파이크

앱 코드가 아니다. "브라우저에서 CREPE tiny가 돌아가는가, pitchy 대비 얼마나 나은가, 4분 곡이 몇 초 걸리는가"를 확인하는 용도.
여기서 확인된 것을 Phase 2에서 `/lib/pitch/extract.ts`로 옮긴다.

## 실행
```sh
cd spike
pnpm install          # playwright (브라우저는 별도 설치 필요: pnpm exec playwright install chromium)
pnpm gen              # testdata/ 에 합성 WAV + 정답 생성
pnpm test             # 헤드리스 Chromium으로 전부 분석, results/summary.json
node run-headless.mjs --backend=wasm clean low   # 백엔드·케이스 지정
pnpm serve            # http://localhost:8080/pitch.html 을 브라우저에서 직접 열기 (실제 녹음본 테스트)
```

브라우저에서 직접 열 때: 파일 고르고 "분석". 정답 JSON은 선택. 결과 JSON 저장 가능.
`?backend=wasm` / `?backend=cpu` 로 백엔드 강제.

### Vercel에 올리기 (폰 테스트용)
정적 파일뿐이라 빌드 없이 그대로 올라간다. `vercel.json`이 wasm 스레드용 COOP/COEP 헤더를 건다.
```sh
cd spike && npx vercel --prod      # 또는 Vercel 대시보드에서 Root Directory = spike, Framework = Other
```
`.vercelignore`가 node_modules / testdata / 스크립트를 제외한다. 올라가는 건 html·js·vendor·model ≈ 5MB.

## 구성
- `pitch.html` / `pitch.js` — 디코딩(`decodeAudioData` → 16kHz 모노) → CREPE tiny / pitchy → PitchTrack(SPEC 형식) → 캔버스·표
- `vendor/` — tf.js 4.22.0, tf wasm 백엔드, pitchy 4.1.0 (esbuild IIFE 번들)
- `model/` — CREPE tiny, [marl/crepe gh-pages](https://github.com/marl/crepe/tree/gh-pages/model) 의 TF.js 변환본 (MIT). 2.0MB
- `gen-test-wav.mjs` — 합성 보컬(배음 + 비브라토 + 호흡 간격 + 노이즈/리버브) 생성
- `run-headless.mjs` — Playwright 자동 실행 + 정답 대비 채점

## 결과 (합성 데이터, 이 컨테이너 CPU, 2026-10-15)

| case | 설명 | method | 처리 ms | ×실시간 | RPA % | 옥타브에러 % | 보이싱 recall % | 거짓 보이싱 % | 중앙 오차 ¢ |
|---|---|---|---|---|---|---|---|---|---|
| clean | 중음역, 깨끗, 30s | crepe (wasm) | 20,390 | 1.5 | 98.9 | 0 | 99.2 | 3.2 | 2.2 |
| | | pitchy | 636 | 47 | 96.9 | 0 | 99.3 | 6.8 | 3.1 |
| low | 저음역 MIDI 40~52 | crepe (wasm, threaded) | 11,171 | 2.7 | 99.0 | 0 | 99.3 | 1.0 | 3.4 |
| | | pitchy | 823 | 36 | 96.8 | 0 | 98.1 | 0.7 | 2.6 |
| noisy | SNR 10dB + 60Hz 험 | crepe | 11,268 | 2.7 | 99.2 | 0 | 99.4 | 3.8 | 2.3 |
| | | pitchy | 667 | 45 | 95.1 | 0 | 97.3 | 1.1 | 3.0 |
| octave | 기본파 약함 + 저음역 | crepe | 12,308 | 2.4 | 99.2 | 0 | 99.6 | 1.0 | 2.5 |
| | | pitchy | 507 | 59 | 95.1 | 0 | 97.5 | 1.5 | 2.8 |
| reverb | 1.2s 꼬리 + SNR 15dB | crepe | 12,139 | 2.5 | 98.8 | 0 | 99.2 | **76.1** | 3.1 |
| | | pitchy | 747 | 40 | 96.4 | 0 | 97.4 | 9.1 | 4.1 |
| long | **4분**, SNR 25dB | crepe | **95,852** | 2.5 | 99.3 | 0 | 99.5 | 5.2 | 2.6 |
| | | pitchy | **5,547** | 43 | 97.6 | 0 | 99.3 | 6.7 | 3.0 |

- RPA = 정답 유성 프레임 중 ±50¢ 안에 맞춘 비율. 옥타브에러 = ±1200¢ 근처로 튄 비율
- 임계치: CREPE confidence ≥ 0.5, pitchy clarity ≥ 0.9, 공통 에너지 게이트 상위 5% RMS 대비 −30dB
- clean 1행은 COOP/COEP 헤더 없이(단일 스레드 wasm) 잰 것. 이후는 헤더 넣어 threaded-simd. 약 1.8배 차이
- webgl 백엔드는 이 컨테이너에선 SwiftShader(소프트웨어 GL)라 0.1×실시간으로 의미 없음. 실제 GPU에서는 wasm보다 훨씬 빠를 것으로 기대하지만 **실측 필요**

## 확인된 것
1. **CREPE tiny는 TF.js 4.x에서 그대로 로딩된다.** 2018년 tfjs 0.8 포맷 model.json을 `tf.loadLayersModel`로 읽는 데 문제 없음. 가중치 2.0MB
2. **수치적으로 맞다.** 합성 정답 대비 중앙 오차 2~3¢, 옥타브 에러 0. 프레이밍(center=True, 1024 윈도우, 10ms hop)·정규화·디코딩(argmax ±4빈 가중평균)이 python crepe와 같다
3. **4분 곡 처리 시간**: CPU-only(wasm threaded) 96초. pitchy는 5.5초. 데스크톱 GPU/모바일 실측은 아직
4. **`decodeAudioData`가 리샘플까지 해 준다.** `OfflineAudioContext(1, 1, 16000).decodeAudioData()` 로 16kHz 버퍼가 바로 나옴. ffmpeg 불필요
5. **합성 데이터로는 CREPE와 pitchy를 가를 수 없다.** 옥타브 트랩 케이스에서도 둘 다 0%. 합성음은 배음이 정직해서 자기상관이 잘 먹는다. 실제 목소리(브레시, 포먼트, 지터)에서 갈릴 것 — **실제 녹음본 테스트가 결정 근거**
6. **리버브 꼬리는 에너지 게이트로 못 거른다.** 꼬리가 최대 대비 −8~−17dB인데 실제 보컬 다이내믹도 그 범위라 게이트를 조이면 약하게 부른 구간이 죽는다. CREPE는 꼬리에서도 피치를 잡아 "유성"으로 보고함(음향적으로는 맞음). → 가정 3을 "**드라이** 보컬(리버브 없이)"로 강화. 소절 분할은 담당자가 올리는 가이드 기준이므로 멤버 녹음본의 꼬리는 coverage만 약간 올릴 뿐 판정엔 큰 영향 없음

## 잠정 결정 (열린 질문 1번)
**CREPE tiny를 기본으로, pitchy는 폴백.**
- 합성에서도 RPA가 2~4%p 높고, confidence(0~1)가 "이 프레임이 유성일 확률"로 해석 가능해 SPEC 가정 4의 "판정 불가" 로직과 맞물림. pitchy의 clarity는 노이즈에서 0.9 위로 올라가는 경우가 있어 임계치가 불안정
- 96초/4분은 진행률 표시로 감당 가능한 수준. GPU 있으면 훨씬 줄어듦
- 폴백 조건: wasm/webgl 둘 다 초기화 실패하거나, 처리 시간이 ×1.0 아래로 떨어지는 기기(구형 폰)에서는 pitchy
- **실제 녹음본 3개(인터페이스/폰/화음) 테스트 결과에 따라 뒤집을 수 있음.** 이 페이지를 그대로 쓰면 됨

## Phase 2로 가져갈 것
- `extractPitch(file, onProgress) → PitchTrack` = `decodeTo16kMono` + `runCrepe` + `toPitchTrack` (+ 에너지 게이트)
- 백엔드 순서: webgl → wasm → cpu. wasm threaded를 쓰려면 Next.js `headers()`에 `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`
- 모델·wasm 바이너리는 `/public/models/crepe-tiny/`, `/public/tfjs-wasm/` 정적 배포 (CDN 의존 없음)
- UI 양보: 배치 256프레임마다 `setTimeout(0)`. Web Worker로 옮기면 더 매끄럽지만 MVP엔 불필요
