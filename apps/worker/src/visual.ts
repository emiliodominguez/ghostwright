import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadToFile, putObject, uploadFile } from '@ghostwright/artifacts';
import { db, tables } from '@ghostwright/db';
import type { IgnoreRegion, VisualSink } from '@ghostwright/dsl';
import { and, eq } from 'drizzle-orm';
import { compare } from 'odiff-bin';

/** Per-step visual outcome, merged into the StepResult by the runner. */
export interface VisualOutcome {
	actualKey?: string;
	baselineKey?: string;
	diffKey?: string;
	diffPct?: number;
	adopted?: boolean;
}

const DIFF_THRESHOLD_PCT = 0.1;

/**
 * Build a visualCheck sink bound to one run. First run for a (test, viewport, name)
 * auto-adopts a baseline; later runs diff via odiff and throw on regression so the
 * step is marked failed. The outcome is stashed in `pending` for the runner to persist.
 *
 * @param opts - run context (testId, viewport, runId) + a `pending` slot.
 * @returns a VisualSink for the DSL runtime context.
 */
export function makeVisualSink(opts: { testId: string; viewport: string; runId: string; workDir: string; pending: { current?: VisualOutcome } }): VisualSink {
	return async (name, image, { ignoreRegions }) => {
		const outcome: VisualOutcome = {};
		opts.pending.current = outcome;

		const existing = await db.query.baseline.findFirst({
			where: and(eq(tables.baseline.testId, opts.testId), eq(tables.baseline.viewport, opts.viewport), eq(tables.baseline.name, name)),
		});

		const actualKey = `runs/${opts.runId}/visual/${name}.png`;
		await putObject(actualKey, image, 'image/png');
		outcome.actualKey = actualKey;

		if (!existing) {
			// Auto-adopt: this run's screenshot becomes the baseline.
			const baselineKey = `baselines/${opts.testId}/${opts.viewport}/${name}.png`;
			await putObject(baselineKey, image, 'image/png');
			await db.insert(tables.baseline).values({ testId: opts.testId, viewport: opts.viewport, name, imageKey: baselineKey });
			outcome.baselineKey = baselineKey;
			outcome.adopted = true;
			return;
		}

		outcome.baselineKey = existing.imageKey;
		const basePath = join(opts.workDir, `base-${name}.png`);
		const actualPath = join(opts.workDir, `actual-${name}.png`);
		const diffPath = join(opts.workDir, `diff-${name}.png`);
		await downloadToFile(existing.imageKey, basePath);
		await writeFile(actualPath, image);

		const regions = ignoreRegions as IgnoreRegion[] | undefined;
		const result = await compare(basePath, actualPath, diffPath, {
			outputDiffMask: true,
			antialiasing: true,
			threshold: 0.1,
			// odiff-bin maps over ignoreRegions unconditionally — only pass it when present.
			...(regions && regions.length ? { ignoreRegions: regions } : {}),
		});

		if (result.match) return;

		const diffPct = 'diffPercentage' in result ? result.diffPercentage : 100;
		outcome.diffPct = diffPct;
		outcome.diffKey = await uploadFile(`runs/${opts.runId}/visual/${name}-diff.png`, diffPath, 'image/png');

		if (diffPct > DIFF_THRESHOLD_PCT) {
			throw new Error(`visual regression on "${name}": ${diffPct.toFixed(2)}% differ`);
		}
	};
}
