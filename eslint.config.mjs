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
    // third-party files copied in on install / generated from the backend's OpenAPI schema
    "public/vendor/**",
    "src/lib/chattogram/api-schema.d.ts",
    "backend/**",
  ]),
]);

export default eslintConfig;
