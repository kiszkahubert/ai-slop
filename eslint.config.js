// ESLint flat config (no plugins): catches undefined names, unused code and common slips.
const browser = Object.fromEntries(['window', 'document', 'localStorage', 'performance', 'fetch', 'createImageBitmap',
  'addEventListener', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'location', 'URLSearchParams', 'AudioContext',
  'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'console', 'KeyboardEvent', 'CustomEvent', 'URL', 'Image',
  'navigator', 'Worker', 'ImageData', 'globalThis', '__sim'].map((g) => [g, 'readonly']));
const node = Object.fromEntries(['process', 'console', 'URL', 'setTimeout', 'globalThis', 'structuredClone']
  .map((g) => [g, 'readonly']));

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-unreachable': 'error',
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-const-assign': 'error',
  'no-fallthrough': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  eqeqeq: ['error', 'smart'],
};

export default [
  { ignores: ['node_modules/**', '.npm-cache/**', 'assets/render/**', 'tests/out/**', 'dem/**'] },
  { files: ['src/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser }, rules },
  // test scripts evaluated inside the page (top-level return is allowed there)
  {
    files: ['tests/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', parserOptions: { ecmaFeatures: { globalReturn: true } }, globals: browser },
    rules,
  },
  { files: ['tests/**/*.mjs', 'tools/**/*.mjs', 'eslint.config.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...node, ...browser } }, rules },
];
