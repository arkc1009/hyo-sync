import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma CLI는 .env를 자동으로 읽지 않는다
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // migrate 는 advisory lock 을 잡아야 해서 커넥션 풀러(pgbouncer)를 거치면 P1002 타임아웃이 난다.
    // Neon 연동이 주는 직접 연결 주소를 우선 쓴다. 앱 런타임(lib/db.ts)은 풀러 주소(DATABASE_URL) 그대로
    url:
      process.env["DATABASE_URL_UNPOOLED"] ??
      process.env["POSTGRES_URL_NON_POOLING"] ??
      process.env["DATABASE_URL"],
  },
});
