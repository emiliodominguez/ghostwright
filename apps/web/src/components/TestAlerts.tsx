import { createSignal, For, Show } from 'solid-js';
import { trpc } from '../lib/trpc';

type Alert = { id: string; channel: string; trigger: string; target: string };

const field = 'rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-white/30';

/** Manage failure/change/every-run notifications for a test's project. */
export default function TestAlerts(props: { testId: string; initial: Alert[] }) {
	const [alerts, setAlerts] = createSignal<Alert[]>(props.initial);
	const [open, setOpen] = createSignal(false);
	const [channel, setChannel] = createSignal('slack');
	const [trigger, setTrigger] = createSignal('failure');
	const [target, setTarget] = createSignal('');
	const [busy, setBusy] = createSignal(false);

	async function add() {
		if (!target().trim()) return;
		setBusy(true);
		try {
			await trpc.alerts.create.mutate({ testId: props.testId, channel: channel() as never, trigger: trigger() as never, target: target().trim() });
			setAlerts(await trpc.alerts.listByTest.query({ testId: props.testId }));
			setTarget('');
		} finally {
			setBusy(false);
		}
	}
	async function remove(id: string) {
		await trpc.alerts.remove.mutate({ id });
		setAlerts(alerts().filter((a) => a.id !== id));
	}

	return (
		<div class="rounded-xl border border-white/10 bg-white/[0.03]">
			<button class="flex w-full items-center justify-between px-4 py-3 text-sm text-white/70" onClick={() => setOpen((v) => !v)}>
				<span class="font-medium">🔔 Alerts {alerts().length > 0 && <span class="text-white/40">— {alerts().length}</span>}</span>
				<span class="text-white/30">{open() ? '▲' : '▼'}</span>
			</button>
			<Show when={open()}>
				<div class="space-y-3 border-t border-white/10 p-4">
					<For each={alerts()}>
						{(a) => (
							<div class="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
								<span>
									<span class="font-medium">{a.channel}</span> <span class="text-white/40">({a.trigger})</span> → <span class="text-white/60">{a.target}</span>
								</span>
								<button class="text-xs text-white/40 hover:text-red-300" onClick={() => remove(a.id)}>
									remove
								</button>
							</div>
						)}
					</For>
					<div class="flex flex-wrap items-center gap-2">
						<select class={field} value={channel()} onChange={(e) => setChannel(e.currentTarget.value)}>
							<option value="slack">Slack</option>
							<option value="webhook">Webhook</option>
							<option value="teams">Microsoft Teams</option>
							<option value="pagerduty">PagerDuty</option>
							<option value="email">Email</option>
						</select>
						<select class={field} value={trigger()} onChange={(e) => setTrigger(e.currentTarget.value)}>
							<option value="failure">On failure</option>
							<option value="change">On status change</option>
							<option value="always">Every run</option>
						</select>
						<input
							class={`${field} flex-1`}
							value={target()}
							placeholder={channel() === 'email' ? 'you@example.com' : channel() === 'pagerduty' ? 'routing key' : 'webhook URL'}
							onInput={(e) => setTarget(e.currentTarget.value)}
						/>
						<button onClick={add} disabled={busy()} class="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50">
							Add
						</button>
					</div>
				</div>
			</Show>
		</div>
	);
}
