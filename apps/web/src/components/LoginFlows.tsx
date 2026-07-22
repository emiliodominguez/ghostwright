import { describeStep, parseTest } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconCheck, IconLock } from './icons';
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

/** List login flows with capture status; capture (verify) and delete. */
export default function LoginFlows() {
	const [flows, setFlows] = createSignal<Flow[]>([]);
	const [capturing, setCapturing] = createSignal<string | null>(null);

	onMount(refresh);
	async function refresh() {
		setFlows((await trpc.loginFlows.list.query()) as Flow[]);
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
	function steps(dsl: string): string[] {
		try {
			return parseTest(JSON.parse(dsl)).steps.map(describeStep);
		} catch {
			return [];
		}
	}

	return (
		<Show when={flows().length > 0} fallback={<p class={styles['empty']}>No login flows yet. Build one on the right.</p>}>
			<ul class={styles['list']}>
				<For each={flows()}>
					{(f) => (
						<li class={styles['item']}>
							<div class={`${styles['item-row']} ${styles['item-head']}`}>
								<span class={styles['item-name']}>
									<IconLock size={15} />
									{f.name}
								</span>
								<div class={styles['item-meta']}>
									<button type="button" class={styles['capture-btn']} disabled={capturing() === f.id} onClick={() => capture(f.id)}>
										{capturing() === f.id ? 'Capturing…' : 'Capture session'}
									</button>
									<button type="button" class={styles['delete-link']} onClick={() => remove(f.id)}>
										delete
									</button>
								</div>
							</div>
							<Show
								when={f.captured && !f.lastCaptureError}
								fallback={
									<div class={`${styles['status']} ${styles['warn']}`}>
										{f.lastCaptureError ? f.lastCaptureError : 'Not captured yet — click “Capture session”.'}
									</div>
								}
							>
								<div class={`${styles['status']} ${styles['ok']}`}>
									<IconCheck size={13} /> Session captured — {f.cookieCount} cookie(s). Bind it to a test in that test’s Settings.
								</div>
							</Show>
							<ol class={styles['preview']}>
								<For each={steps(f.dsl)}>
									{(l, i) => (
										<li>
											<span class={styles['idx']}>{i() + 1}.</span> {l}
										</li>
									)}
								</For>
							</ol>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
