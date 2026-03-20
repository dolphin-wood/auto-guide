import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.output/**',
      '**/.wxt/**',
      '**/tmp/**',
      'packages/server/src/agent/scripts/finder-inject.ts',
    ],
  },
)
