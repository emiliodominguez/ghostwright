import node from '@astrojs/node';
import solid from '@astrojs/solid-js';
import { defineConfig } from 'astro/config';

export default defineConfig({
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [solid()],
	vite: {
		// Keep server-only workspace packages out of the client/SSR bundle transform.
		ssr: { noExternal: ['@ghostwright/db', '@ghostwright/artifacts', '@ghostwright/queue', '@ghostwright/dsl'] },
	},
	server: { port: parseInt(process.env.WEB_PORT || '4321'), host: true },
});
