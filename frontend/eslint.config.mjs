// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: [
      "dist", // Contains 3rd party code
      "public", // Contains 3rd party code
    ],
  },
  {
    rules: {
      "no-undef": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          // Allow empty extending interfaces because there's no real reason not to, and it makes it obvious where to put extra attributes in the future
          allowInterfaces: 'with-single-extends',
        },
      ],
      "@typescript-eslint/no-explicit-any": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-require-imports": "off", // Temporarily disabled until codebase conformant
      "@typescript-eslint/no-unused-vars": "off", // Temporarily disabled until codebase conformant
    },
  }
);
