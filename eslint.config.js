import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  js.configs.recommended,

  {
    files: ['**/*.js'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        prompt: 'readonly',
        confirm: 'readonly',
        process: 'readonly',
      },
    },

    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^(next|req|res|err)$',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^(err|_)$',
        },
      ],
      'no-undef': 'warn',
      'no-console': 'warn',
      eqeqeq: ['error', 'always'], // enforce === over ==
      curly: 'error', // enforce curly braces for clarity
    },
  },

  // Disables ESLint rules that conflict with Prettier
  prettierConfig,
]);
