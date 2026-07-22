import { describeStep, parseTest } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';

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
		<Show when={flows().length > 0} fallback={<p class="text-sm text-white/40">No login flows yet. Build one on the right.</p>}>
			<ul class="space-y-3">
				<For each={flows()}>
					{(f) => (
						<li class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
							<div class="mb-2 flex items-center justify-between gap-3">
								<span class="font-medium">🔓 {f.name}</span>
								<div class="flex items-center gap-2">
									<button
										class="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-black transition hover:bg-emerald-400 disabled:opacity-50"
										disabled={capturing() === f.id}
										onClick={() => capture(f.id)}
									>
										{capturing() === f.id ? 'Capturing…' : 'Capture session'}
									</button>
									<button class="text-xs text-white/40 hover:text-red-300" onClick={() => remove(f.id)}>
										delete
									</button>
								</div>
							</div>
							<div class="mb-2 text-xs">
								<Show
									when={f.captured && !f.lastCaptureError}
									fallback={
										<span class="text-amber-300">
											{f.lastCaptureError ? `⚠ ${f.lastCaptureError}` : 'Not captured yet — click “Capture session”.'}
										</span>
									}
								>
									<span class="text-emerald-300">✓ Session captured — {f.cookieCount} cookie(s). Bind it to a test in that test’s Settings.</span>
								</Show>
							</div>
							<ol class="space-y-1 pl-1 text-xs text-white/55">
								<For each={steps(f.dsl)}>{(l, i) => <li><span class="text-white/30">{i() + 1}.</span> {l}</li>}</For>
							</ol>
						</li>
					)}
				</For>
			</ul>
		</Show>
	);
}
