# hyo sync

단체 보컬 녹음 음정·박자 체크. 스펙은 `docs/SPEC.md`, 진행 상황은 `docs/PLAN.md`.

## 로컬 실행
```sh
pnpm install
docker compose up -d                 # Postgres 16 (hyosync/hyosync)
cp .env.example .env                 # 아래 값 채우기
pnpm prisma migrate dev
pnpm dev
```

`.env`
- `DATABASE_URL=postgresql://hyosync:hyosync@localhost:5432/hyosync`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google Cloud Console → OAuth 클라이언트(웹). 승인된 리디렉션 URI에 `http://localhost:3000/api/auth/callback/google`
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `BLOB_READ_WRITE_TOKEN` — Vercel 대시보드 → Storage → Blob 스토어 생성 후 토큰. 로컬에서도 이 토큰으로 실제 Blob 에 올라간다

## Vercel 배포
1. Vercel → Add New Project → `arkc1009/hyo-sync` import. Framework = Next.js, Root Directory = `.` (루트). 빌드는 `vercel-build` 스크립트가 잡혀서 프로덕션(`VERCEL_ENV=production`)에서만 `prisma migrate deploy` 후 `next build`. 프리뷰 배포는 마이그레이션 없이 빌드만
2. Storage 탭 → Create Database → **Neon** (Postgres). 연결하면 `DATABASE_URL`(풀러)과 `DATABASE_URL_UNPOOLED`(직접)가 자동으로 들어간다. 마이그레이션은 직접 주소를, 앱은 풀러 주소를 쓴다 (`prisma.config.ts`)
3. Storage 탭 → 만들어 둔 Blob 스토어 Connect → `BLOB_READ_WRITE_TOKEN` 자동
4. Settings → Environment Variables 에 직접 추가: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`
5. Google Cloud Console OAuth 클라이언트의 승인된 리디렉션 URI에 `https://<프로젝트>.vercel.app/api/auth/callback/google` 추가
6. Deployments → Redeploy (환경변수 넣은 뒤 한 번 다시)

## 검사
`pnpm typecheck && pnpm test && pnpm lint`
