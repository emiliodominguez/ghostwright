import { parseTest, type Step } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { runStatus } from '../lib/status';
import { IconCheck, IconLock, IconPencil, IconTrash } from './icons';
import StepText from './StepText';
import styles from './manager.module.scss';

type Flow = {
	id: string;
	name: string;
	dsl: string;
	captured: boolean;
	cookieCount: number | null;
	lastCaptureError: string | null;
	lastCapturedAt: string | number | null;
};

type CaptureRun = { id: string; status: string; cookieCount: number | null; createdAt: string | number | Date };

/**
 * List login flows with capture status; capture (verify), edit, and delete.
 * The editor itself is rendered full-width by the parent LoginsManager, so this
 * component only reports which flow the user wants to edit via `onEdit`.
 *
 * Each flow shows a concise capture status and its recent capture attempts, which
 * link to a full capture-run page (steps, trace, screenshots) for debugging. The
 * verbose Playwright error lives on that page, not crammed onto the card.
 */
export default function LoginFlows(props: { onEdit: (id: string) => void; reloadKey: number }) {
	const [flows, setFlows] = createSignal<Flow[]>([]);
	const [captures, setCaptures] = createSignal<Record<string, CaptureRun[]>>({});
	const [capturing, setCapturing] = createSignal<string | null>(null);
	const [openSteps, setOpenSteps] = createSignal<string | null>(null);
	// Which flows have their captures list expanded, and which capture run is
	// awaiting delete confirmation.
	const [openCaptures, setOpenCaptures] = createSignal<Set<string>>(new Set());
	const [confirmCaptureId, setConfirmCaptureId] = createSignal<string | null>(null);
	const [deletingCaptureId, setDeletingCaptureId] = createSignal<string | null>(null);

	onMount(refresh);
	// Reload whenever the parent bumps reloadKey (e.g. after an edit is saved).
	let lastKey = props.reloadKey;
	setInterval(() => {
		if (props.reloadKey !== lastKey) {
			lastKey = props.reloadKey;
			void refresh();
		}
	}, 300);

	async function refresh() {
		const list = (await trpc.loginFlows.list.query()) as Flow[];
		setFlows(list);
		// Load recent capture attempts for each flow, so the card can show history.
		const entries = await Promise.all(
			list.map(async (f) => [f.id, (await trpc.loginFlows.captureRuns.query({ loginFlowId: f.id })) as CaptureRun[]] as const),
		);
		setCaptures(Object.fromEntries(entries));
	}
	async function capture(id: string) {
		setCapturing(id);
		await trpc.loginFlows.capture.mutate({ id });
		// The capture runs on the worker; poll a few times for the status to land.
		for (let i = 0; i < 8; i++) {
			await new Promise((r) => setTimeout(r, 1500));
			await refresh();
		}
		setCapturing(null);
	}
	async function remove(id: string) {
		await trpc.loginFlows.remove.mutate({ id });
		await refresh();
	}
	function toggleCaptures(flowId: string) {
		setOpenCaptures((set) => {
			const next = new Set(set);
			if (next.has(flowId)) next.delete(flowId);
			else next.add(flowId);
			return next;
		});
	}
	async function removeCapture(flowId: string, id: string) {
		setDeletingCaptureId(id);
		try {
			await trpc.loginFlows.removeCaptureRun.mutate({ id });
			// Drop it from the in-memory list for this flow without a full refresh.
			setCaptures((all) => ({ ...all, [flowId]: (all[flowId] ?? []).filter((r) => r.id !== id) }));
			setConfirmCaptureId(null);
		} finally {
			setDeletingCaptureId(null);
		}
	}
	function steps(dsl: string): Step[] {
		try {
			return parseTest(JSON.parse(dsl)).steps;
		} catch {
			return [];
		}
	}
	function fmtWhen(v: string | number | Date): string {
		return new Date(v).toLocaleString();
	}

	return (
		<Show when={flows().length > 0} fallback={<p class={styles['empty']}>No login flows yet. Build one on the right.</p>}>
			<ul class={styles['list']}>
				<For each={flows()}>
					{(f) => {
						const runs = () => captures()[f.id] ?? [];
						return (
							<li class={`${styles['item']} ${styles['flow']}`}>
								<div class={`${styles['item-row']} ${styles['item-head']}`}>
									<span class={styles['item-name']}>
										<IconLock size={15} />
										{f.name}
									</span>
									<div class={styles['item-meta']}>
										<button type="button" title="Edit login flow" aria-label="Edit login flow" class={styles['icon-btn']} onClick={() => props.onEdit(f.id)}>
											<IconPencil size={15} />
										</button>
										<button type="button" title="Delete login flow" aria-label="Delete login flow" class={`${styles['icon-btn']} ${styles['danger']}`} onClick={() => remove(f.id)}>
											<IconTrash size={15} />
										</button>
									</div>
								</div>

								{/* Concise status line. The full error lives on the capture-run page. */}
								<Show
									when={f.captured && !f.lastCaptureError}
									fallback={
										<div class={`${styles['status']} ${styles['warn']}`}>
											{!f.lastCaptureError
												? 'Not captured yet. Capture the session to begin.'
												: runs().length > 0
													? 'Last capture failed. Open the latest capture below to see what happened.'
													: 'Last capture failed. Re-capture to see the full run and debug it.'}
										</div>
									}
								>
									<div class={`${styles['status']} ${styles['ok']}`}>
										<IconCheck size={13} /> Session captured{f.cookieCount != null ? `, ${f.cookieCount} ${f.cookieCount === 1 ? 'cookie' : 'cookies'} saved` : ''}. Bind it to a test in its Settings.
									</div>
								</Show>

								<div class={styles['action-row']}>
									<button type="button" class={styles['capture-btn']} disabled={capturing() === f.id} onClick={() => capture(f.id)}>
										{capturing() === f.id ? 'Capturing…' : f.captured ? 'Re-capture session' : 'Capture session'}
									</button>
									<button type="button" class={styles['text-toggle']} onClick={() => setOpenSteps(openSteps() === f.id ? null : f.id)}>
										{openSteps() === f.id ? 'Hide steps' : `Show steps (${steps(f.dsl).length})`}
									</button>
									<Show when={runs().length > 0}>
										<button type="button" class={styles['text-toggle']} onClick={() => toggleCaptures(f.id)}>
											{openCaptures().has(f.id) ? 'Hide captures' : `Show captures (${runs().length})`}
										</button>
									</Show>
								</div>

								{/* Recent capture attempts — each links to its full run for debugging. */}
								<Show when={runs().length > 0 && openCaptures().has(f.id)}>
									<div class={styles['captures']}>
										<span class={styles['captures-title']}>Recent captures</span>
										<ul class={styles['capture-list']}>
											<For each={runs().slice(0, 5)}>
												{(r) => {
													const s = () => runStatus(r.status);
													return (
														<li class={styles['capture-item']}>
															<a href={`/captures/${r.id}`} class={styles['capture-row']}>
																<span class={styles['capture-when']}>{fmtWhen(r.createdAt)}</span>
															</a>
															<Show
																when={confirmCaptureId() === r.id}
																fallback={
																	<button
																		type="button"
																		title="Delete capture"
																		aria-label="Delete capture"
																		class={styles['capture-delete']}
																		onClick={() => setConfirmCaptureId(r.id)}
																	>
																		<IconTrash size={14} />
																	</button>
																}
															>
																<span class={styles['capture-confirm']}>
																	<button type="button" class={styles['confirm-yes']} disabled={deletingCaptureId() === r.id} onClick={() => removeCapture(f.id, r.id)}>
																		{deletingCaptureId() === r.id ? 'Deleting…' : 'Delete'}
																	</button>
																	<button type="button" class={styles['cancel']} onClick={() => setConfirmCaptureId(null)}>
																		Cancel
																	</button>
																</span>
															</Show>
															<span class={`badge ${styles['capture-badge']}`} data-tone={s().tone}>
																{(r.status === 'queued' || r.status === 'running') && <span class={styles['dot']} data-tone={s().tone} />}
																{s().label}
															</span>
														</li>
													);
												}}
											</For>
										</ul>
									</div>
								</Show>

								<Show when={openSteps() === f.id}>
									<ol class={styles['preview']}>
										<For each={steps(f.dsl)}>
											{(step, i) => (
												<li>
													<span class={styles['idx']}>{i() + 1}.</span> <StepText step={step} />
												</li>
											)}
										</For>
									</ol>
								</Show>
							</li>
						);
					}}
				</For>
			</ul>
		</Show>
	);
}
