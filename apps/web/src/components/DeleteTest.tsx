import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconTrash } from './icons';
import styles from './controls.module.scss';

/**
 * Delete a test (and its runs) after an inline confirm. On the test detail page it
 * redirects to the dashboard; in a list it calls `onDeleted` so the row can be
 * removed in place. `iconOnly` renders a compact icon trigger for dense rows.
 */
export default function DeleteTest(props: { id: string; name: string; iconOnly?: boolean; onDeleted?: () => void }) {
	const [busy, setBusy] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);

	async function remove() {
		setBusy(true);
		try {
			await trpc.tests.remove.mutate({ id: props.id });
			if (props.onDeleted) props.onDeleted();
			else window.location.href = '/';
		} catch {
			setBusy(false);
		}
	}

	return (
		<Show
			when={confirming()}
			fallback={
				<Show
					when={props.iconOnly}
					fallback={
						<button type="button" aria-label="Delete test" onClick={() => setConfirming(true)} class={`${styles['secondary-btn']} ${styles['secondary-danger']}`}>
							<IconTrash size={14} />
							Delete
						</button>
					}
				>
					<button type="button" title="Delete test" aria-label="Delete test" onClick={() => setConfirming(true)} class={`${styles['icon-btn']} ${styles['danger']}`}>
						<IconTrash size={15} />
					</button>
				</Show>
			}
		>
			<span class={styles['confirm']}>
				<Show when={!props.iconOnly}>
					<span class={styles['confirm-label']}>Delete “{props.name}”?</span>
				</Show>
				<button type="button" onClick={remove} disabled={busy()} class={styles['confirm-yes']}>
					{busy() ? 'Deleting…' : props.iconOnly ? 'Delete' : 'Yes, Delete'}
				</button>
				<button type="button" onClick={() => setConfirming(false)} class={styles['cancel']}>
					Cancel
				</button>
			</span>
		</Show>
	);
}
