import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

// Model routing (verified current IDs): triage → Opus 4.8 (multi-signal reasoning),
// NL step resolution → Haiku 4.5 (hot loop, cheap/fast), test generation → Sonnet 5.
const MODELS = { triage: 'claude-opus-4-8', resolve: 'claude-haiku-4-5', generate: 'claude-sonnet-5' } as const;

let client: Anthropic | undefined;
function anthropic(): Anthropic {
	client ??= new Anthropic();
	return client;
}

/** True when Anthropic credentials are configured (env key or `ant` profile). */
export function aiEnabled(): boolean {
	return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);
}

const triageSchema = z.object({
	summary: z.string().describe('one-sentence plain-language summary of why the run failed'),
	likelyCause: z.string().describe('the most probable root cause'),
	suggestedFix: z.string().describe('a concrete next step to fix or investigate'),
});
export type Triage = z.infer<typeof triageSchema>;

export interface TriageInput {
	testName: string;
	error: string;
	steps: { idx: number; type: string; status: string; error?: string | null }[];
	consoleLog?: string;
	networkLog?: string;
}

/**
 * Summarize why a run failed from its error, steps, and (optionally) console/network logs.
 * Best-effort — returns null if AI is unavailable or the call fails (never blocks a verdict).
 *
 * @param input - the failed run's signals.
 * @returns a triage summary, or null.
 */
export async function triageFailure(input: TriageInput): Promise<Triage | null> {
	try {
		const res = await anthropic().messages.parse({
			model: MODELS.triage,
			max_tokens: 1024,
			thinking: { type: 'adaptive' },
			output_config: { effort: 'high', format: zodOutputFormat(triageSchema) },
			system: [
				{
					type: 'text',
					text: 'You triage failed browser test runs for Ghostwright. Given the failure signals, explain the root cause concisely for a developer.',
					cache_control: { type: 'ephemeral' },
				},
			],
			messages: [{ role: 'user', content: JSON.stringify(input) }],
		});
		return res.parsed_output ?? null;
	} catch {
		return null;
	}
}

const selectorSchema = z.object({
	role: z.string().nullable(),
	name: z.string().nullable(),
	css: z.string().nullable(),
});

/**
 * Resolve a natural-language instruction to a durable locator using the page's
 * accessibility snapshot. Prefers role+name; falls back to a CSS selector.
 *
 * @param a11ySnapshot - the `_snapshotForAI` / ariaSnapshot text.
 * @param instruction - e.g. "click the sign-in button".
 * @returns a `{role,name}` / `{css}` locator, or null.
 */
export async function resolveStep(a11ySnapshot: string, instruction: string): Promise<{ role?: string; name?: string; css?: string } | null> {
	try {
		const res = await anthropic().messages.parse({
			model: MODELS.resolve,
			max_tokens: 256,
			output_config: { format: zodOutputFormat(selectorSchema) },
			system: [
				{
					type: 'text',
					text: 'Given an accessibility tree and an instruction, return the single element to act on as a role+accessible-name (preferred) or a CSS selector.',
					cache_control: { type: 'ephemeral' },
				},
			],
			messages: [{ role: 'user', content: `Accessibility tree:\n${a11ySnapshot}\n\nInstruction: ${instruction}` }],
		});
		const o = res.parsed_output;
		if (!o) return null;
		return { ...(o.role ? { role: o.role } : {}), ...(o.name ? { name: o.name } : {}), ...(o.css ? { css: o.css } : {}) };
	} catch {
		return null;
	}
}

/**
 * Generate a DSL test (as JSON string) from a URL and a goal. The caller validates
 * it with `@ghostwright/dsl` parseTest.
 *
 * @param url - the page to test.
 * @param goal - what the test should verify.
 * @returns a JSON string `{ steps: [...] }`, or null.
 */
export async function generateTest(url: string, goal: string): Promise<string | null> {
	try {
		const res = await anthropic().messages.create({
			model: MODELS.generate,
			max_tokens: 2048,
			thinking: { type: 'adaptive' },
			system: [
				{
					type: 'text',
					text:
						'Generate a Ghostwright browser test as JSON: {"steps":[...]}. Step types: goto{url}, click{locator}, fill{locator,value}, ' +
						'assertText{locator,text}, assertVisible{locator}, assertUrl{url}. A locator is {role,name} or {css}. Output ONLY the JSON.',
					cache_control: { type: 'ephemeral' },
				},
			],
			messages: [{ role: 'user', content: `URL: ${url}\nGoal: ${goal}` }],
		});
		const text = res.content.find((b) => b.type === 'text');
		return text && 'text' in text ? text.text.trim() : null;
	} catch {
		return null;
	}
}
