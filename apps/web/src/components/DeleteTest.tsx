import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import styles from './controls.module.scss';

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

	return (
		<Show
			when={confirming()}
			fallback={
				<button type="button" onClick={() => setConfirming(true)} class={styles['delete-link']}>
					Delete test
				</button>
			}
		>
			<span class={styles['confirm']}>
				<span class={styles['confirm-label']}>Delete “{props.name}”?</span>
				<button type="button" onClick={remove} disabled={busy()} class={styles['confirm-yes']}>
					{busy() ? 'Deleting…' : 'Yes, delete'}
				</button>
				<button type="button" onClick={() => setConfirming(false)} class={styles['cancel']}>
					cancel
				</button>
			</span>
		</Show>
	);
}
