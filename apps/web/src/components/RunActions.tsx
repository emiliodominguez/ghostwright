import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconPlay, IconTrash } from './icons';
import styles from './controls.module.scss';

/**
 * Header actions for a single run: retry (re-runs the same version/browser/viewport
 * as a fresh run) and delete (removes the run, its steps, and its artifacts).
 * Retry is offered only for a finished-but-unsuccessful run; a queued/running run
 * has nothing to retry yet. Delete confirms inline before acting.
 */
export default function RunActions(props: { id: string; status: string; testId?: string }) {
	const [retrying, setRetrying] = createSignal(false);
	const [deleting, setDeleting] = createSignal(false);
	const [confirming, setConfirming] = createSignal(false);

	const canRetry = () => props.status === 'failed' || props.status === 'errored';

	async function retry() {
		if (retrying()) return;
		setRetrying(true);
		try {
			const { id } = await trpc.runs.retry.mutate({ id: props.id });
			// Land on the fresh run so the user watches it live.
			window.location.href = `/runs/${id}`;
		} catch {
			setRetrying(false);
		}
	}

	async function remove() {
		setDeleting(true);
		try {
			await trpc.runs.remove.mutate({ id: props.id });
			// The run is gone — go back to its test (or home if it had none).
			window.location.href = props.testId ? `/tests/${props.testId}` : '/';
		} catch {
			setDeleting(false);
		}
	}

	return (
		<div class={styles['run-actions']}>
			<Show when={canRetry()}>
				<button type="button" onClick={retry} disabled={retrying()} class={styles['secondary-btn']} aria-busy={retrying()}>
					{retrying() ? <span class={styles['spinner']} aria-hidden="true" /> : <IconPlay size={13} />}
					{retrying() ? 'Retrying…' : 'Retry'}
				</button>
			</Show>

			<Show
				when={confirming()}
				fallback={
					<button
						type="button"
						aria-label="Delete run"
						onClick={() => setConfirming(true)}
						class={`${styles['secondary-btn']} ${styles['secondary-danger']}`}
					>
						<IconTrash size={14} />
						Delete
					</button>
				}
			>
				<span class={styles['confirm']}>
					<span class={styles['confirm-label']}>Delete this run?</span>
					<button type="button" onClick={remove} disabled={deleting()} class={styles['confirm-yes']}>
						{deleting() ? 'Deleting…' : 'Yes, Delete'}
					</button>
					<button type="button" onClick={() => setConfirming(false)} class={styles['cancel']}>
						Cancel
					</button>
				</span>
			</Show>
		</div>
	);
}
