import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';

/** Delete a saved action, then refresh the page so the list updates. */
export default function DeleteAction(props: { id: string }) {
	const [busy, setBusy] = createSignal(false);

	async function remove() {
		setBusy(true);
		try {
			await trpc.actions.remove.mutate({ id: props.id });
			window.location.reload();
		} catch {
			setBusy(false);
		}
	}

	return (
		<button
			onClick={remove}
			disabled={busy()}
			class="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/50 transition hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
		>
			{busy() ? 'Deleting…' : 'Delete'}
		</button>
	);
}
