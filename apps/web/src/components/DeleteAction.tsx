import { createSignal } from 'solid-js';
import { trpc } from '../lib/trpc';
import styles from './controls.module.scss';

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
		<button type="button" onClick={remove} disabled={busy()} class={styles['delete-btn']}>
			{busy() ? 'Deleting…' : 'Delete'}
		</button>
	);
}
