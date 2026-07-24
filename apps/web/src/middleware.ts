import { timingSafeEqual } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';

/** Constant-time string compare that never short-circuits on length. */
function safeEqual(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ba.length !== bb.length) {
		timingSafeEqual(ba, ba); // keep timing uniform
		return false;
	}
	return timingSafeEqual(ba, bb);
}

/**
 * Optional dashboard access gate. By default (no `GHOSTWRIGHT_ACCESS_TOKEN`) the app is
 * open — the intended self-hosted, trusted-network posture. When the env var is set, the
 * dashboard pages, the tRPC endpoint, and artifact downloads require that token (supplied
 * once as `?token=…`, which sets an httpOnly cookie and is then stripped from the URL, or
 * via `Authorization: Bearer`). The public REST API under `/api/v1` is exempt — it
 * authenticates with its own API keys.
 */
export const onRequest = defineMiddleware(async (context, next) => {
	const required = process.env.GHOSTWRIGHT_ACCESS_TOKEN;
	if (!required) return next();

	const url = new URL(context.request.url);
	if (url.pathname.startsWith('/api/v1')) return next(); // REST self-authenticates via apiKey

	const fromQuery = url.searchParams.get('token');
	if (fromQuery) {
		// Consume a valid ?token= once: set the cookie and redirect to a clean URL so the
		// token never lingers in history, access logs, or the Referer header.
		if (safeEqual(fromQuery, required)) {
			context.cookies.set('gw_token', required, { httpOnly: true, sameSite: 'lax', path: '/' });
			url.searchParams.delete('token');
			return context.redirect(url.pathname + (url.search ? url.search : '') + url.hash, 302);
		}
		return new Response('Unauthorized', { status: 401 });
	}

	const supplied = context.cookies.get('gw_token')?.value || context.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (supplied && safeEqual(supplied, required)) return next();
	return new Response('Unauthorized. Append ?token=<GHOSTWRIGHT_ACCESS_TOKEN> to the URL once to unlock.', { status: 401 });
});
