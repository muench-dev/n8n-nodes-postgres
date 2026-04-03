import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		alias: {
			'n8n-workflow': 'n8n-workflow/dist/cjs/index.js',
		},
	},
});
