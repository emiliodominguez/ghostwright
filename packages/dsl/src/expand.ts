import type { Step } from './schema';

/** Loads a saved action's steps by id, or null if it's missing. */
export type ActionLoader = (actionId: string) => Promise<Step[] | null>;

const MAX_DEPTH = 10;

/**
 * Replace every `actionRef` step with the referenced action's steps, recursively.
 * This is what makes reusable actions *live references* — the steps are resolved at
 * run time, so editing an action changes every test that references it.
 *
 * @param steps - the test's steps (may contain `actionRef`).
 * @param load - resolves an action id to its steps.
 * @param depth - current recursion depth (guards against reference cycles).
 * @returns a flat list of concrete steps with no `actionRef` remaining.
 */
export async function expandActions(steps: Step[], load: ActionLoader, depth = 0): Promise<Step[]> {
	if (depth > MAX_DEPTH) throw new Error(`action nesting exceeded ${MAX_DEPTH} levels (reference cycle?)`);
	const out: Step[] = [];
	for (const step of steps) {
		if (step.type === 'actionRef') {
			const sub = await load(step.actionId);
			if (sub) out.push(...(await expandActions(sub, load, depth + 1)));
		} else {
			out.push(step);
		}
	}
	return out;
}
