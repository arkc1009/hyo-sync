import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // pnpm prisma generate 결과물
    "lib/generated/**",
    // Phase 0 스파이크 (앱 코드 아님, vendor 번들 포함)
    "spike/**",
  ]),
]);

export default eslintConfig;
