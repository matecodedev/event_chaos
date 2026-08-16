import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node }
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The accessibility work is enforced here, not left to review.
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // tsc already reports unused code; keep one source of truth for it.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // Recorded debt, not dismissed. The compiler-aware rules flag real
      // patterns in the game loop: randomness and timestamps read during
      // render, refs touched during render, state set from effects. Fixing
      // them means restructuring how the simulation ticks, which is its own
      // piece of work. They stay visible as warnings so the count can only go
      // down, and should be promoted back to errors once the loop is reworked.
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn'
    }
  },

  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off'
    }
  },

  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node }
  },

  // Must stay last: turns off every rule that would fight the formatter.
  prettier
);
