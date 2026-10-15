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

## 검사
`pnpm typecheck && pnpm test && pnpm lint`
