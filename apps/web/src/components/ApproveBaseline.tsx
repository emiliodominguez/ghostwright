import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconCheck } from './icons';
import styles from './controls.module.scss';

/** Approve a visual-diff result, promoting the current screenshot to the baseline. */
export default function ApproveBaseline(props: { runId: string; stepIdx: number }) {
	const [done, setDone] = createSignal(false);
	const [busy, setBusy] = createSignal(false);

	async function approve() {
		setBusy(true);
		try {
			await trpc.baselines.approve.mutate({ runId: props.runId, stepIdx: props.stepIdx });
			setDone(true);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Show
			when={done()}
			fallback={
				<button type="button" onClick={approve} disabled={busy()} class={styles['approve']}>
					{busy() ? 'Approving…' : 'Approve → update baseline'}
				</button>
			}
		>
			<span class={styles['approved']}>
				<IconCheck size={14} /> Baseline updated
			</span>
		</Show>
	);
}
