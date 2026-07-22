/**
 * Optional SSRF guard for outbound fetches (uploads, alert webhooks). Self-hosted
 * single-tenant is the default and intentionally allows private/internal targets
 * (testing internal apps, alerting internal endpoints). Set
 * `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK=1` on multi-tenant/hosted deployments to deny
 * loopback, private, and link-local (incl. cloud metadata) hosts.
 */

const PRIVATE = [
	/^localhost$/i,
	/^127\./,
	/^10\./,
	/^192\.168\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^169\.254\./, // link-local incl. 169.254.169.254 cloud metadata
	/^0\./,
	/^::1$/,
	/^fc00:/i,
	/^fe80:/i,
];

/**
 * Throw when SSRF protection is enabled and the URL targets a private/loopback/link-local host.
 *
 * @param raw - the URL to fetch.
 */
export function assertUrlAllowed(raw: string): void {
	if (process.env.GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK !== '1') return;
	let host: string;
	try {
		host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
	} catch {
		throw new Error(`invalid URL: ${raw}`);
	}
	if (PRIVATE.some((re) => re.test(host))) throw new Error(`blocked request to private address: ${host}`);
}
