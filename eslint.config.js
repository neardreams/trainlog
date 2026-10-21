// ESLint flat config：把 CLAUDE.md 的 AI 開發規則寫成可自動檢查的規則
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import importX from 'eslint-plugin-import-x';
import globals from 'globals';

const dateRules = [
  {
    selector: "CallExpression[callee.property.name='toISOString']",
    message: '不要用 toISOString()（會轉成 UTC 而差一天）；請用 @trainlog/core 的日期工具。',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='Literal']",
    message: '不要用 new Date(<字串>)（YYYY-MM-DD 會被當成 UTC）；請用 @trainlog/core 的 parseDate()。',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=1][arguments.0.type='TemplateLiteral']",
    message: '不要用 new Date(<字串>)；請用 @trainlog/core 的 parseDate()。',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/routeTree.gen.ts',
      'data/**',
      'redesign/**',
      'scripts/**',
      'dist-legacy/**',
      'index.html',
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': ['error', ...dateRules],
      'import-x/no-extraneous-dependencies': 'error',
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/data-client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // 畫面層：不得直接讀原始 JSON、不得寫死色碼
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/*.json'],
              message: '畫面不得直接讀 data/*.json，請用 @trainlog/data-client 的 hooks。',
            },
            {
              group: ['@trainlog/core/raw', '@trainlog/core/src/schema/raw*'],
              message: '畫面不得使用原始 JSON 型別，請用領域模型。',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...dateRules,
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: '不要在畫面寫死色碼；請用 @trainlog/tokens 的語意 token。',
        },
      ],
    },
  },
  {
    // 日期工具本身可以使用 Date 建構子
    files: ['packages/core/src/dates.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['tools/**', '**/*.config.{js,ts,mjs}', '**/test/**', '**/*.test.{ts,tsx}'],
    rules: { 'import-x/no-extraneous-dependencies': 'off' },
  },
);
