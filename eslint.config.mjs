import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(["**/dist/**", "files/**", "**/build/**", "source/server/dist/**"]),
  {
    files: ["source/server/**/*.ts", "source/server/**/*.d.ts"],
    rules:{
      "@typescript-eslint/no-floating-promises": "warn",
    },
    plugins:{
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      sourceType: 'module',
    }
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);