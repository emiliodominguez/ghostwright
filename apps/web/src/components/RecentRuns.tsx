import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { runStatus } from '../lib/status';
import BrowserLogo from './BrowserLogo';
import { IconTrash } from './icons';
import styles from './RecentRuns.module.scss';

type Run = { id: string; status: string; browser: string; createdAt: string | number | Date };

/**
 * Live "Recent runs" list. Seeds from the server-rendered snapshot, then polls so
 * a run started with "Run now" (or from elsewhere) shows up and updates through
 * queued -> running -> passed without a manual refresh. Polls quickly while any
 * run is active, and slowly otherwise to catch newly started runs.
 */
export default function RecentRuns(props: { testId: string; initial: Run[] }) {
	const [runs, setRuns] = createSignal<Run[]>(props.initial);
	// The run id currently awaiting delete confirmation (only one row confirms at a time).
	const [confirmId, setConfirmId] = createSignal<string | null>(null);
	const [deletingId, setDeletingId] = createSignal<string | null>(null);

	let timer: ReturnType<typeof setTimeout> | undefined;
	// Once unmounted, no further ticks are scheduled — otherwise a request still in
	// flight at unmount would resolve and start a new timer that onCleanup can no
	// longer clear, leaving a loop polling forever.
	let disposed = false;
	const anyActive = (list: Run[]) => list.some((r) => r.status === 'queued' || r.status === 'running');

	function scheduleNext(delayMs: number) {
		if (disposed) return;
		timer = setTimeout(refresh, delayMs);
	}

	async function refresh() {
		try {
			const list = (await trpc.runs.listByTest.query({ testId: props.testId })) as Run[];
			if (disposed) return;
			setRuns(list);
			// Poll fast while something is running, slower when idle (to notice new runs).
			scheduleNext(anyActive(list) ? 2000 : 5000);
		} catch {
			scheduleNext(5000);
		}
	}

	onMount(() => scheduleNext(anyActive(props.initial) ? 2000 : 5000));
	onCleanup(() => {
		disposed = true;
		if (timer) clearTimeout(timer);
	});

	async function remove(id: string) {
		setDeletingId(id);
		try {
			await trpc.runs.remove.mutate({ id });
			// Drop it from the list in place — no full-page reload needed.
			setRuns((list) => list.filter((r) => r.id !== id));
			setConfirmId(null);
		} finally {
			setDeletingId(null);
		}
	}

	return (
		<Show when={runs().length > 0} fallback={<p class={styles['muted']}>No runs yet. Hit “Run now” to try it.</p>}>
			<ul class={styles['runs']}>
				<For each={runs()}>
					{(r) => {
						const s = () => runStatus(r.status);
						return (
							<li class={styles['run-item']}>
								<a href={`/runs/${r.id}`} class={styles['run-row']}>
									<span class={styles['run-browser']} title={r.browser}>
										<BrowserLogo browser={r.browser} size={16} />
									</span>
									<span class={styles['run-time']}>{new Date(r.createdAt).toLocaleString()}</span>
								</a>
								<Show
									when={confirmId() === r.id}
									fallback={
										<button
											type="button"
											title="Delete run"
											aria-label="Delete run"
											class={styles['delete']}
											onClick={() => setConfirmId(r.id)}
										>
											<IconTrash size={15} />
										</button>
									}
								>
									<span class={styles['confirm']}>
										<button type="button" class={styles['confirm-yes']} disabled={deletingId() === r.id} onClick={() => remove(r.id)}>
											{deletingId() === r.id ? 'Deleting…' : 'Delete'}
										</button>
										<button type="button" class={styles['cancel']} onClick={() => setConfirmId(null)}>
											Cancel
										</button>
									</span>
								</Show>
								<span class={`badge ${styles['run-badge']}`} data-tone={s().tone}>
									{(r.status === 'queued' || r.status === 'running') && <span class={styles['dot']} data-tone={s().tone} />}
									{s().label}
								</span>
							</li>
						);
					}}
				</For>
			</ul>
		</Show>
	);
}
