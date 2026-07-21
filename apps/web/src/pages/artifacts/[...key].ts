import type { APIRoute } from 'astro';
import { getObject } from '@ghostwright/artifacts';

export const prerender = false;

/**
 * Same-origin proxy for artifact objects. Lets the self-hosted trace viewer fetch
 * trace.zip (and step screenshots) from our origin with no CORS negotiation.
 */
export const GET: APIRoute = async ({ params }) => {
	const key = params.key;
	if (!key) return new Response('missing key', { status: 400 });
	try {
		const obj = await getObject(key);
		return new Response(obj.body, {
			headers: {
				'content-type': obj.contentType ?? 'application/octet-stream',
				'cache-control': 'private, max-age=300',
			},
		});
	} catch {
		return new Response('not found', { status: 404 });
	}
};
