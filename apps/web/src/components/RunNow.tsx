import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';

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
		<button
			onClick={run}
			disabled={busy()}
			class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:opacity-50"
		>
			{busy() ? 'Starting…' : '▶ Run now'}
		</button>
	);
}
