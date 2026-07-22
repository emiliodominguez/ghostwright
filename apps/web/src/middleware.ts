import { defineMiddleware } from 'astro:middleware';

/**
 * Optional dashboard access gate. By default (no `GHOSTWRIGHT_ACCESS_TOKEN`) the app is
 * open — the intended self-hosted, trusted-network posture. When the env var is set, the
 * dashboard pages, the tRPC endpoint, and artifact downloads require that token (supplied
 * once as `?token=…`, which sets an httpOnly cookie, or via `Authorization: Bearer`). The
 * public REST API under `/api/v1` is exempt — it authenticates with its own API keys.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const required = process.env.GHOSTWRIGHT_ACCESS_TOKEN;
	if (!required) return next();

	const url = new URL(context.request.url);
	if (url.pathname.startsWith('/api/v1')) return next(); // REST self-authenticates via apiKey

	const fromQuery = url.searchParams.get('token');
	const supplied = fromQuery || context.cookies.get('gw_token')?.value || context.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (supplied === required) {
		// Remember a valid ?token= so the user doesn't have to re-supply it on every request.
		if (fromQuery) context.cookies.set('gw_token', required, { httpOnly: true, sameSite: 'lax', path: '/' });
		return next();
	}
	return new Response('Unauthorized — append ?token=<GHOSTWRIGHT_ACCESS_TOKEN> to the URL once to unlock.', { status: 401 });
});
