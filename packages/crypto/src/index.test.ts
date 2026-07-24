import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { encrypt, decrypt } from './index';

const here = dirname(fileURLToPath(import.meta.url));
const moduleAbsPath = resolve(here, 'index.ts');
const repoRoot = resolve(here, '..', '..', '..');
const tsxBin = resolve(repoRoot, 'node_modules', '.bin', 'tsx');

describe('encrypt', () => {
	it('produces an iv:tag:ciphertext string of three base64 parts', () => {
		const blob = encrypt('hello world');
		const parts = blob.split(':');

		expect(parts).toHaveLength(3);

		const base64Re = /^[A-Za-z0-9+/]*={0,2}$/;

		for (const part of parts) {
			expect(part).toMatch(base64Re);
		}
	});

	it('produces different ciphertext for the same plaintext (random iv)', () => {
		const a = encrypt('same input');
		const b = encrypt('same input');

		expect(a).not.toBe(b);
	});
});

describe('round-trip encrypt -> decrypt', () => {
	it('returns the original plaintext', () => {
		const plain = 'the quick brown fox';

		expect(decrypt(encrypt(plain))).toBe(plain);
	});

	it('handles the empty string', () => {
		expect(decrypt(encrypt(''))).toBe('');
	});

	it('handles unicode', () => {
		const plain = 'こんにちは 🌈 café ½ Ω';

		expect(decrypt(encrypt(plain))).toBe(plain);
	});
});

describe('decrypt errors', () => {
	it('throws "malformed ciphertext" when input does not have three parts', () => {
		expect(() => decrypt('onlyonepart')).toThrow('malformed ciphertext');
		expect(() => decrypt('two:parts')).toThrow('malformed ciphertext');
		expect(() => decrypt('a:b:c:d')).toThrow('malformed ciphertext');
	});

	it('throws on a tampered ciphertext (auth failure)', () => {
		const blob = encrypt('sensitive data');
		const [iv, tag, ct] = blob.split(':');

		const ctBytes = Buffer.from(ct!, 'base64');
		ctBytes[0] = ctBytes[0]! ^ 0xff;
		const tampered = [iv, tag, ctBytes.toString('base64')].join(':');

		expect(() => decrypt(tampered)).toThrow();
	});

	it('throws on a tampered auth tag (auth failure)', () => {
		const blob = encrypt('sensitive data');
		const [iv, tag, ct] = blob.split(':');

		const tagBytes = Buffer.from(tag!, 'base64');
		tagBytes[0] = tagBytes[0]! ^ 0xff;
		const tampered = [iv, tagBytes.toString('base64'), ct].join(':');

		expect(() => decrypt(tampered)).toThrow();
	});
});

describe('resolveKey production guard', () => {
	// resolveKey() runs at module import time, so the production branch cannot be
	// re-triggered in this process. We spawn a child via tsx that sets NODE_ENV to
	// production and removes the secret key BEFORE importing the module, and assert
	// the import fails (non-zero exit).
	it('throws at import when NODE_ENV=production and the key is missing/short', () => {
		const script = `import(${JSON.stringify(moduleAbsPath)}).then(() => process.exit(0)).catch(() => process.exit(1));`;

		const run = (env: NodeJS.ProcessEnv): number => {
			try {
				execFileSync(tsxBin, ['-e', script], { env, stdio: 'pipe' });

				return 0;
			} catch (err) {
				return (err as { status?: number }).status ?? 1;
			}
		};

		const base: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'production' };

		const missing = { ...base };
		delete missing.GHOSTWRIGHT_SECRET_KEY;

		const short = { ...base, GHOSTWRIGHT_SECRET_KEY: 'tooshort' };

		expect(run(missing)).not.toBe(0);
		expect(run(short)).not.toBe(0);
	});
});
