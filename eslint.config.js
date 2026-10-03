import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import eslintConfigPrettier from "eslint-config-prettier"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "vite.config.ts", "stats.html"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Required for 'verbatimModuleSyntax: true'
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "separate-type-imports",
          disallowTypeAnnotations: false,
        },
      ],

      // Explicit restriction: bans React.FC and React.FunctionComponent
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "TSTypeReference[typeName.name='FC'], TSTypeReference[typeName.name='FunctionComponent'], TSTypeReference[typeName.right.name='FC'], TSTypeReference[typeName.right.name='FunctionComponent']",
          message:
            "Avoid React.FC. Define components as arrow functions typing the arguments in the signature.",
        },
      ],

      // Relaxes rules that clash with events or Radix/Tailwind extensions
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  // Pure .js files (eslint.config.js) are not part of tsconfig,
  // so type-requiring rules must be disabled.
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  eslintConfigPrettier
)
