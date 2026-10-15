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
    url: process.env["DATABASE_URL"],
  },
});
