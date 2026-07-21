import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';

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
		<button
			onClick={approve}
			disabled={busy() || done()}
			class="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-400 disabled:opacity-60"
		>
			{done() ? 'Approved ✓ — baseline updated' : busy() ? 'Approving…' : 'Approve → update baseline'}
		</button>
	);
}
