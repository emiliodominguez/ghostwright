import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM at rest. In production the key is sourced from Infisical; here it comes
// from env (GHOSTWRIGHT_SECRET_KEY), hashed to 32 bytes. Stored blobs (login-flow
// storageState, TOTP seeds) are ciphertext produced here.
const key = createHash('sha256')
	.update(process.env.GHOSTWRIGHT_SECRET_KEY ?? 'dev-insecure-key')
	.digest();

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
