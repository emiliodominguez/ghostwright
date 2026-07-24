import { createSignal, onCleanup, onMount } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconPlay } from './icons';
import styles from './controls.module.scss';

/**
 * Enqueue a run for a test and stay on the page, showing a spinner while any run
 * for this test is still queued or running. Because the run rows are persisted,
 * the button reflects an ongoing run on load too (started elsewhere or before a
 * refresh) and disables itself, so it never lets the user start a duplicate.
 */
export default function RunNow(props: { testId: string }) {
	const [active, setActive] = createSignal(0);
	const [starting, setStarting] = createSignal(false);

	let timer: ReturnType<typeof setTimeout> | undefined;
	// A monotonically increasing token identifies the current poll chain. Only the
	// newest chain is allowed to schedule its next tick, so a poll that was already
	// in flight when a new chain started (e.g. the mount poll racing a "Run now"
	// click) retires quietly instead of leaving two loops writing the same `timer`.
	let gen = 0;
	let disposed = false;

	/** Count this test's runs that are still queued or running. */
	async function countActive(): Promise<number> {
		const runs = await trpc.runs.listByTest.query({ testId: props.testId });
		return runs.filter((r) => r.status === 'queued' || r.status === 'running').length;
	}

	/** Schedule the next poll tick, but only for the newest chain and while mounted. */
	function scheduleNext(myGen: number, delayMs: number) {
		if (disposed || myGen !== gen) return;
		timer = setTimeout(() => poll(myGen), delayMs);
	}

	/** Poll active-run count; keep polling while any run is in flight, else check back slowly. */
	async function poll(myGen: number) {
		try {
			const n = await countActive();
			if (disposed || myGen !== gen) return;
			setActive(n);
			// Fast poll while active; slow poll when idle so a run started elsewhere still shows up.
			scheduleNext(myGen, n > 0 ? 2000 : 5000);
		} catch {
			scheduleNext(myGen, 5000);
		}
	}

	/** Start a fresh poll chain, retiring any previous one. */
	function startPolling() {
		if (timer) clearTimeout(timer);
		gen++;
		void poll(gen);
	}

	// Reflect any already-running run as soon as the button mounts.
	onMount(startPolling);
	onCleanup(() => {
		disposed = true;
		if (timer) clearTimeout(timer);
	});

	async function run() {
		// Guard: never enqueue a second run while one is already in flight.
		if (busy()) return;
		setStarting(true);
		try {
			await trpc.runs.create.mutate({ testId: props.testId });
			setActive((n) => n + 1); // reflect the just-created run immediately
			// Kick a fresh poller so it converges on the real count (and retires the old chain).
			startPolling();
		} finally {
			setStarting(false);
		}
	}

	const busy = () => starting() || active() > 0;
	const label = () => {
		if (starting()) return 'Starting…';
		if (active() > 0) return active() > 1 ? `Running ${active()}…` : 'Running…';
		return 'Run now';
	};

	return (
		<button type="button" onClick={run} disabled={busy()} class={styles['run']} aria-busy={busy()}>
			{busy() ? <span class={styles['spinner']} aria-hidden="true" /> : <IconPlay size={13} />}
			{label()}
		</button>
	);
}
