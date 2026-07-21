/**
 * Ghostwright CLI — run tests from CI and set the exit code by outcome.
 *
 * Usage:
 *   ghostwright test execute <testId> [--error-on-fail] [--error-on-screenshot-fail]
 *                                     [--immediate] [--json] [--api-url URL] [--api-key KEY]
 *
 * Defaults: --api-url $GHOSTWRIGHT_API_URL, --api-key $GHOSTWRIGHT_API_KEY.
 */

interface Flags {
	apiUrl: string;
	apiKey: string;
	immediate: boolean;
	errorOnFail: boolean;
	errorOnScreenshotFail: boolean;
	json: boolean;
}

/** Parse argv into positionals + flags. */
function parse(argv: string[]): { positionals: string[]; flags: Flags } {
	const positionals: string[] = [];
	const flags: Flags = {
		apiUrl: process.env.GHOSTWRIGHT_API_URL ?? 'http://localhost:4321',
		apiKey: process.env.GHOSTWRIGHT_API_KEY ?? '',
		immediate: false,
		errorOnFail: false,
		errorOnScreenshotFail: false,
		json: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--api-url') flags.apiUrl = argv[++i] ?? flags.apiUrl;
		else if (a === '--api-key') flags.apiKey = argv[++i] ?? flags.apiKey;
		else if (a === '--immediate') flags.immediate = true;
		else if (a === '--error-on-fail') flags.errorOnFail = true;
		else if (a === '--error-on-screenshot-fail') flags.errorOnScreenshotFail = true;
		else if (a === '--json') flags.json = true;
		else if (!a.startsWith('--')) positionals.push(a);
	}
	return { positionals, flags };
}

async function main(): Promise<number> {
	const { positionals, flags } = parse(process.argv.slice(2));
	const [resource, action, id] = positionals;

	if (resource !== 'test' || action !== 'execute' || !id) {
		console.error('usage: ghostwright test execute <testId> [--error-on-fail] [--error-on-screenshot-fail] [--immediate]');
		return 2;
	}
	if (!flags.apiKey) {
		console.error('error: no API key (pass --api-key or set GHOSTWRIGHT_API_KEY)');
		return 2;
	}

	const url = `${flags.apiUrl}/api/v1/tests/${id}/execute${flags.immediate ? '?immediate=1' : ''}`;
	const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${flags.apiKey}`, 'content-type': 'application/json' } });
	const result = (await res.json()) as { passing?: boolean; status?: string; screenshotFailing?: boolean; error?: string };

	if (!res.ok) {
		console.error(`error: ${res.status} ${JSON.stringify(result)}`);
		return 2;
	}
	if (flags.json) console.log(JSON.stringify(result, null, 2));
	else console.log(`${result.passing ? '✓ passed' : `✗ ${result.status}`}${result.error ? ` — ${result.error.split('\n')[0]}` : ''}`);

	if (flags.errorOnScreenshotFail && result.screenshotFailing) return 1;
	if (flags.errorOnFail && !result.passing) return 1;
	return 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(2);
	},
);
