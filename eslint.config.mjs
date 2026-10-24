// @ts-check
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB = "apps/web/**/*.{ts,tsx}";

/** Scope a list of flat configs to the given file globs. */
function scoped(configs, files) {
  return configs.map((config) => ({ ...config, files }));
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/generated/**",
      "**/next-env.d.ts",
      ".data/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },
  ...scoped(nextVitals, [WEB]),
  {
    files: [WEB],
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      // Images come from user uploads / signed URLs; next/image adds little here.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // CLIs, seeds, dev scripts and the worker log to stdout by design.
    files: [
      "scripts/**",
      "**/scripts/**",
      "**/seed/**",
      "apps/worker/**",
      "packages/shared/src/logger.ts",
      "packages/email/src/providers.ts",
    ],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts", "**/testing/**", "**/e2e/**"],
    rules: { "no-console": "off" },
  },
  prettier,
);
