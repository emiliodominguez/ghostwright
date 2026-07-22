import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconPlay } from './icons';
import styles from './controls.module.scss';

/** Enqueue a run for a test and jump to its live result page. */
export default function RunNow(props: { testId: string }) {
	const [busy, setBusy] = createSignal(false);

	async function run() {
		setBusy(true);
		try {
			const { id } = await trpc.runs.create.mutate({ testId: props.testId });
			window.location.href = `/runs/${id}`;
		} catch {
			setBusy(false);
		}
	}

	return (
		<button type="button" onClick={run} disabled={busy()} class={styles['run']}>
			<IconPlay size={13} />
			{busy() ? 'Starting…' : 'Run now'}
		</button>
	);
}
