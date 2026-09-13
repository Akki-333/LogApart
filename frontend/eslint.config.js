import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// The rules that catch real bugs in this codebase are errors. Style is left to
// review: there is no formatter wired in yet, and a lint that fails on quote
// marks gets switched off rather than read.
export default [
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',
      // JSX usage is invisible to the core rule without the React plugin, so
      // component imports would all read as unused. Capitalised names are exempt.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', args: 'none', caughtErrors: 'none' }]
    }
  }
];
