import { createHmac } from 'node:crypto';
import { decrypt } from '@ghostwright/crypto';
import { db, tables } from '@ghostwright/db';
import { and, eq } from 'drizzle-orm';

/**
 * Load an org's password secrets, decrypted, keyed as `secret.<name>` so they
 * resolve via `{{secret.NAME}}` interpolation. TOTP seeds are excluded (they're
 * consumed by the `totp` step, not typed as values).
 *
 * @param orgId - the org whose secrets to load.
 * @returns a map of `secret.<name>` → decrypted value.
 */
export async function loadPasswordSecrets(orgId: string): Promise<Record<string, string>> {
	const rows = await db
		.select({ name: tables.secret.name, ref: tables.secret.ref })
		.from(tables.secret)
		.where(and(eq(tables.secret.orgId, orgId), eq(tables.secret.kind, 'password')));
	const out: Record<string, string> = {};
	for (const r of rows) out[`secret.${r.name}`] = decrypt(r.ref);
	return out;
}

function base32decode(s: string): Buffer {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const c of s.replace(/=+$/, '').toUpperCase()) {
		value = (value << 5) | alphabet.indexOf(c);
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/**
 * Generate an RFC-6238 TOTP code (SHA1, 6 digits, 30s step) for a base32 seed.
 *
 * @param secretBase32 - the shared secret in base32.
 * @param now - current epoch ms (defaults to Date.now()).
 * @returns the 6-digit code.
 */
export function totpCode(secretBase32: string, now = Date.now()): string {
	const counter = Math.floor(now / 1000 / 30);
	const buf = Buffer.alloc(8);
	buf.writeBigUInt64BE(BigInt(counter));
	const hmac = createHmac('sha1', base32decode(secretBase32)).update(buf).digest();
	const offset = hmac[hmac.length - 1]! & 0xf;
	const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
	return String(code).padStart(6, '0');
}

/**
 * Resolve a named secret to a current TOTP code. Looks up the Secret row by name,
 * decrypts its stored base32 seed, and generates the code.
 *
 * @param orgId - org the secret belongs to.
 * @param name - secret name referenced by the `totp` step.
 * @returns the current 6-digit code.
 */
export async function totpCodeForSecret(orgId: string, name: string): Promise<string> {
	const row = await db.query.secret.findFirst({ where: and(eq(tables.secret.orgId, orgId), eq(tables.secret.name, name)) });
	if (!row) throw new Error(`secret "${name}" not found`);
	return totpCode(decrypt(row.ref));
}
