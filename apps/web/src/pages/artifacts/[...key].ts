import type { APIRoute } from 'astro';
import { getObject } from '@ghostwright/artifacts';

export const prerender = false;

/**
 * Same-origin proxy for artifact objects. Lets the self-hosted trace viewer fetch
 * trace.zip (and step screenshots) from our origin with no CORS negotiation, and
 * serves recorded videos with byte-range support so they seek in the results page.
 */
export const GET: APIRoute = async ({ params, request }) => {
	const key = params.key;
	if (!key) return new Response('missing key', { status: 400 });
	const range = request.headers.get('range') ?? undefined;
	try {
		const obj = await getObject(key, range);
		const headers: Record<string, string> = {
			'content-type': obj.contentType ?? 'application/octet-stream',
			'cache-control': 'private, max-age=300',
			'accept-ranges': 'bytes',
		};
		if (obj.contentLength != null) headers['content-length'] = String(obj.contentLength);
		if (range && obj.contentRange) {
			headers['content-range'] = obj.contentRange;
			return new Response(obj.body, { status: 206, headers });
		}
		return new Response(obj.body, { headers });
	} catch {
		return new Response('not found', { status: 404 });
	}
};
