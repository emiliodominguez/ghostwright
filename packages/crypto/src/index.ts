import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM at rest for stored blobs (login-flow storageState, secrets/TOTP seeds).
// The key comes from env (GHOSTWRIGHT_SECRET_KEY), hashed to 32 bytes. In production a
// missing/weak key is fatal — otherwise everything would be encrypted under a key derived
// from a public string, so anyone with the DB (or a backup) could decrypt all secrets.
function resolveKey(): Buffer {
	const raw = process.env.GHOSTWRIGHT_SECRET_KEY;
	const isProd = process.env.NODE_ENV === 'production';
	if (isProd && (!raw || raw.length < 16)) {
		throw new Error('GHOSTWRIGHT_SECRET_KEY must be set to a strong value (>=16 chars) in production');
	}
	return createHash('sha256')
		.update(raw ?? 'dev-insecure-key')
		.digest();
}

const key = resolveKey();

/** Encrypt a UTF-8 string to `iv:tag:ciphertext` (all base64). */
export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

/** Decrypt a value produced by {@link encrypt}. */
export function decrypt(blob: string): string {
	const parts = blob.split(':');
	if (parts.length !== 3) throw new Error('malformed ciphertext');
	const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64'));
	const decipher = createDecipheriv('aes-256-gcm', key, iv!);
	decipher.setAuthTag(tag!);
	return Buffer.concat([decipher.update(ct!), decipher.final()]).toString('utf8');
}
