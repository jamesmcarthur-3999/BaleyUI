import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', '.tmp/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['next-env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Type safety: Prevent explicit any usage
      '@typescript-eslint/no-explicit-any': 'error',
      // Note: no-unsafe-* rules require typed linting configuration.
      // To enable them, set up parserOptions.project in a typescript-eslint config.
      // See: https://typescript-eslint.io/getting-started/typed-linting
    },
  },
];

export default eslintConfig;
