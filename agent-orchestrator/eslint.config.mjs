// typescript-eslint does not support TypeScript 7 yet, so linting resolves eslint,
// @eslint/js and typescript-eslint (with TypeScript 5) from the parent project's node_modules.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules/**", "logs/**", "scratchpad/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
