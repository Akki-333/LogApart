const js = require('@eslint/js');
const globals = require('globals');

// Errors for what breaks at runtime, warnings for what merely looks untidy.
module.exports = [
  { ignores: ['node_modules'] },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
    }
  }
];
