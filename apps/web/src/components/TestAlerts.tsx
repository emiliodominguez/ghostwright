import { createSignal, For } from 'solid-js';
import { trpc } from '../lib/trpc';
import Panel from './Panel';
import Select from './Select';
import { IconBell } from './icons';
import styles from './panels.module.scss';

type Alert = { id: string; channel: string; trigger: string; target: string };

/** Manage failure/change/every-run notifications for a test's project. */
export default function TestAlerts(props: { testId: string; initial: Alert[] }) {
	const [alerts, setAlerts] = createSignal<Alert[]>(props.initial);
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
		<Panel icon={<IconBell size={16} />} title="Alerts" subtitle={alerts().length > 0 ? String(alerts().length) : undefined}>
			<div class={styles['stack']}>
				<For each={alerts()}>
					{(a) => (
						<div class={styles['row']}>
							<span>
								<strong>{a.channel}</strong> <span class={styles['muted']}>({a.trigger})</span> → <span class={styles['value']}>{a.target}</span>
							</span>
							<button type="button" class={styles['remove-btn']} onClick={() => remove(a.id)}>
								remove
							</button>
						</div>
					)}
				</For>
				<div class={styles['form-row']}>
					<div class={styles['select-sm']}>
						<Select
							value={channel()}
							onChange={setChannel}
							ariaLabel="Alert channel"
							options={[
								{ value: 'slack', label: 'Slack' },
								{ value: 'webhook', label: 'Webhook' },
								{ value: 'teams', label: 'Microsoft Teams' },
								{ value: 'pagerduty', label: 'PagerDuty' },
								{ value: 'email', label: 'Email' },
							]}
						/>
					</div>
					<div class={styles['select-sm']}>
						<Select
							value={trigger()}
							onChange={setTrigger}
							ariaLabel="Alert trigger"
							options={[
								{ value: 'failure', label: 'On failure' },
								{ value: 'change', label: 'On status change' },
								{ value: 'always', label: 'Every run' },
							]}
						/>
					</div>
					<input
						class={`${styles['input']} ${styles['grow']}`}
						value={target()}
						placeholder={channel() === 'email' ? 'you@example.com' : channel() === 'pagerduty' ? 'routing key' : 'webhook URL'}
						onInput={(e) => setTarget(e.currentTarget.value)}
					/>
					<button type="button" onClick={add} disabled={busy()} class={styles['save-btn']}>
						Add
					</button>
				</div>
			</div>
		</Panel>
	);
}
