import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['**/dist/**', '**/node_modules/**', '**/.astro/**', 'infra/**', '**/public/**'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		rules: {
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
		},
	},
	// Plain JS / MJS config and helper scripts run under Node; give them the Node globals
	// so `process`, `URL`, `console`, etc. are not flagged as undefined.
	{
		files: ['**/*.{js,mjs,cjs}'],
		languageOptions: {
			globals: {
				process: 'readonly',
				console: 'readonly',
				URL: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				module: 'readonly',
				require: 'readonly',
				fetch: 'readonly',
			},
		},
	},
);
