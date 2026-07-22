import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';

/** Delete a test (and its runs) after a confirm, then return to the dashboard. */
export default function DeleteTest(props: { id: string; name: string }) {
	const [busy, setBusy] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);

	async function remove() {
		setBusy(true);
		try {
			await trpc.tests.remove.mutate({ id: props.id });
			window.location.href = '/';
		} catch {
			setBusy(false);
		}
	}

	return confirming() ? (
		<span class="flex items-center gap-2 text-xs">
			<span class="text-white/50">Delete “{props.name}”?</span>
			<button onClick={remove} disabled={busy()} class="rounded-lg bg-red-500/90 px-2.5 py-1 font-medium text-white hover:bg-red-500 disabled:opacity-50">
				{busy() ? 'Deleting…' : 'Yes, delete'}
			</button>
			<button onClick={() => setConfirming(false)} class="text-white/40 hover:text-white/70">
				cancel
			</button>
		</span>
	) : (
		<button onClick={() => setConfirming(true)} class="text-xs text-white/40 transition hover:text-red-300">
			Delete test
		</button>
	);
}
