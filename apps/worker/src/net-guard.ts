import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Optional SSRF guard for outbound fetches (uploads, alert webhooks). Self-hosted
 * single-tenant is the default and intentionally allows private/internal targets
 * (testing internal apps, alerting internal endpoints). Set
 * `GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK=1` on multi-tenant/hosted deployments to deny
 * loopback, private, and link-local (incl. cloud metadata) targets. The check resolves
 * hostnames to their actual IPs, so DNS-rebinding and alternate IP encodings are covered.
 */

/** True if an IP literal is loopback / private / link-local / unique-local. */
function isPrivateIp(ip: string): boolean {
	// IPv4-mapped IPv6 → test the embedded v4 (dotted `::ffff:127.0.0.1` or, as Node's URL
	// normalizes it, the hex form `::ffff:7f00:1`).
	const dotted = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
	if (dotted) return isPrivateIp(dotted[1]!);
	const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
	if (hex) {
		const hi = parseInt(hex[1]!, 16);
		const lo = parseInt(hex[2]!, 16);
		return isPrivateIp(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
	}
	if (isIP(ip) === 4) {
		const [a, b] = ip.split('.').map(Number);
		if (a === 10 || a === 127 || a === 0) return true;
		if (a === 192 && b === 168) return true;
		if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 metadata
		if (a === 172 && b! >= 16 && b! <= 31) return true;
		return false;
	}
	const v6 = ip.toLowerCase();
	return v6 === '::1' || /^f[cd][0-9a-f]{2}:/.test(v6) || /^fe80:/.test(v6); // loopback, fc00::/7, link-local
}

/**
 * Throw when SSRF protection is enabled and the URL resolves to a private/loopback/link-local host.
 *
 * @param raw - the URL to fetch.
 */
export async function assertUrlAllowed(raw: string): Promise<void> {
	if (process.env.GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK !== '1') return;
	let host: string;
	try {
		host = new URL(raw).hostname.replace(/^\[|\]$/g, '');
	} catch {
		throw new Error(`invalid URL: ${raw}`);
	}
	// Resolve to concrete IP(s): literals map to themselves, hostnames go through DNS
	// (so a name pointing at a private range, or a decimal/hex-encoded IP, is caught).
	let addrs: string[];
	if (isIP(host)) {
		addrs = [host];
	} else {
		try {
			addrs = (await lookup(host, { all: true })).map((a) => a.address);
		} catch {
			throw new Error(`cannot resolve host: ${host}`);
		}
	}
	for (const addr of addrs) {
		if (isPrivateIp(addr)) throw new Error(`blocked request to private address: ${addr} (${host})`);
	}
}
