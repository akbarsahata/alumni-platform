import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Keep useful recommended diagnostics, but make lint advisory rather than strict.
function warnings(config) {
  return {
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules ?? {}).map(([rule, setting]) => {
        const [severity, ...options] = Array.isArray(setting) ? setting : [setting];
        return [rule, [severity === "off" || severity === 0 ? "off" : "warn", ...options]];
      })
    ),
  };
}

export default [
  {
    ignores: [
      "node_modules/**",
      "build/**",
      ".react-router/**",
      ".wrangler/**",
      ".mf/**",
      "test-results/**",
      "playwright-report/**",
      "worker-configuration.d.ts",
      ".agents/**",
    ],
  },
  {
    ...warnings(js.configs.recommended),
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...warnings(config),
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "max-len": [
        "warn",
        {
          code: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          ignoreRegExpLiterals: true,
        },
      ],
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": [
        "warn",
        { allowInterfaces: "with-single-extends" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
