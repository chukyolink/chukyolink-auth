import { defineConfig, globalIgnores } from 'eslint/config';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';

// ESLint plugins
import js from '@eslint/js';

import stylistic from '@stylistic/eslint-plugin';
import tsdoc from 'eslint-plugin-tsdoc';
import unicorn from 'eslint-plugin-unicorn';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**']),
  js.configs.recommended,
  unicorn.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      '@stylistic': stylistic,
      'tsdoc': tsdoc,
    },
    rules: {
      'arrow-spacing': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'comma-spacing': 'error',
      'keyword-spacing': 'error',
      'max-len': ['warn', { code: 120 }],
      'new-cap': ['error', { capIsNew: false }],
      'no-extra-semi': 'error',
      'no-trailing-spaces': 'error',
      'no-unused-vars': 'off', // TS非対応
      'object-curly-spacing': ['error', 'always'],
      'semi': ['error', 'always'],
      'space-before-blocks': 'error',
      'space-in-parens': ['error', 'never'],
      'space-infix-ops': 'error',

      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],

      'tsdoc/syntax': 'error',

      'unicorn/catch-error-name': ['error', { name: 'e' }],
      'unicorn/expiring-todo-comments': 'off',
      'unicorn/filename-case': ['error', { cases: { camelCase: true } }],
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': [
        'warn',
        {
          allowList: {
            'e': true,
            'utils': true,
          },
        },
      ],
    },
  },
]);
