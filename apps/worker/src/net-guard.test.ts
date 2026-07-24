import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { assertUrlAllowed } from './net-guard';

// Mock DNS so no test performs a real network lookup. Individual tests control the
// resolved addresses (or force a rejection) via the typed mock handle below.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

// Typed loosely: the real `lookup` is heavily overloaded, so treat the mock as a plain
// vi.fn to set resolved address lists / rejections without fighting the overloads.
const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>;

const ENV_KEY = 'GHOSTWRIGHT_BLOCK_PRIVATE_NETWORK';

describe('assertUrlAllowed', () => {
	let savedEnv: string | undefined;

	beforeEach(() => {
		savedEnv = process.env[ENV_KEY];
		mockLookup.mockReset();
	});

	afterEach(() => {
		if (savedEnv === undefined) delete process.env[ENV_KEY];
		else process.env[ENV_KEY] = savedEnv;

		vi.restoreAllMocks();
	});

	describe('guard disabled', () => {
		it('is a no-op when the env flag is unset, even for a private IP literal', async () => {
			delete process.env[ENV_KEY];

			await expect(assertUrlAllowed('http://10.0.0.1/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('is a no-op when the env flag is set to something other than "1"', async () => {
			process.env[ENV_KEY] = '0';

			await expect(assertUrlAllowed('http://127.0.0.1/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});
	});

	describe('guard enabled', () => {
		beforeEach(() => {
			process.env[ENV_KEY] = '1';
		});

		it('allows a public IPv4 literal without consulting DNS', async () => {
			await expect(assertUrlAllowed('http://8.8.8.8/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it.each([
			['10.0.0.1', 'http://10.0.0.1/'],
			['127.0.0.1', 'http://127.0.0.1/'],
			['0.0.0.0', 'http://0.0.0.0/'],
			['192.168.1.1', 'http://192.168.1.1/'],
			['169.254.169.254 (metadata link-local)', 'http://169.254.169.254/'],
			['172.16.0.1 (lower private class B bound)', 'http://172.16.0.1/'],
			['172.31.255.255 (upper private class B bound)', 'http://172.31.255.255/'],
		])('blocks the private IPv4 literal %s', async (_label, url) => {
			await expect(assertUrlAllowed(url)).rejects.toThrow('blocked request to private address');
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('allows a public IPv4 in the 172.x range outside the private block', async () => {
			await expect(assertUrlAllowed('http://172.32.0.1/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it.each([
			['::1 loopback', 'http://[::1]/'],
			['fc00::/7 unique-local (fc)', 'http://[fc00::1]/'],
			['fc00::/7 unique-local (fd)', 'http://[fd12:3456::1]/'],
			['fe80:: link-local', 'http://[fe80::1]/'],
		])('blocks the private IPv6 literal %s (brackets stripped)', async (_label, url) => {
			await expect(assertUrlAllowed(url)).rejects.toThrow('blocked request to private address');
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('allows a public IPv6 literal', async () => {
			await expect(assertUrlAllowed('http://[2001:4860:4860::8888]/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('blocks an IPv4-mapped IPv6 in dotted form (::ffff:127.0.0.1)', async () => {
			// Resolve a hostname to the dotted mapped form so the branch is exercised
			// verbatim (the URL constructor would otherwise normalize a literal to hex).
			mockLookup.mockResolvedValue([{ address: '::ffff:127.0.0.1', family: 6 }]);

			await expect(assertUrlAllowed('http://mapped-dotted.example/')).rejects.toThrow(
				'blocked request to private address',
			);
			expect(mockLookup).toHaveBeenCalledWith('mapped-dotted.example', { all: true });
		});

		it('blocks an IPv4-mapped IPv6 in hex form (::ffff:7f00:1)', async () => {
			// 0x7f00 0x0001 -> 127.0.0.1
			await expect(assertUrlAllowed('http://[::ffff:7f00:1]/')).rejects.toThrow(
				'blocked request to private address',
			);
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('allows an IPv4-mapped IPv6 pointing at a public address', async () => {
			// 0x0808 0x0808 -> 8.8.8.8
			await expect(assertUrlAllowed('http://[::ffff:808:808]/')).resolves.toBeUndefined();
			expect(mockLookup).not.toHaveBeenCalled();
		});

		it('resolves a hostname via DNS and blocks it when it points at a private IP', async () => {
			mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);

			await expect(assertUrlAllowed('http://internal.example.com/path')).rejects.toThrow(
				'blocked request to private address: 10.0.0.1 (internal.example.com)',
			);
			expect(mockLookup).toHaveBeenCalledWith('internal.example.com', { all: true });
		});

		it('resolves a hostname via DNS and allows it when it points at a public IP', async () => {
			mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

			await expect(assertUrlAllowed('http://example.com/')).resolves.toBeUndefined();
			expect(mockLookup).toHaveBeenCalledWith('example.com', { all: true });
		});

		it('throws "cannot resolve host" when the DNS lookup rejects', async () => {
			mockLookup.mockRejectedValue(new Error('ENOTFOUND'));

			await expect(assertUrlAllowed('http://does-not-exist.invalid/')).rejects.toThrow(
				'cannot resolve host: does-not-exist.invalid',
			);
			expect(mockLookup).toHaveBeenCalledWith('does-not-exist.invalid', { all: true });
		});

		it('throws "invalid URL" for a malformed URL', async () => {
			await expect(assertUrlAllowed('not a url')).rejects.toThrow('invalid URL: not a url');
			expect(mockLookup).not.toHaveBeenCalled();
		});
	});
});
