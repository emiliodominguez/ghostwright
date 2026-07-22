import type { TestSettings } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { trpc } from '../lib/trpc';
import Panel from './Panel';
import { IconCheck, IconSettings } from './icons';
import styles from './panels.module.scss';

/** Editable per-test run configuration (viewport, UA, language, auth, timeouts, retry). */
export default function TestSettingsPanel(props: { testId: string; initial: TestSettings }) {
	const [s, setS] = createStore<TestSettings>({ ...props.initial });
	const [busy, setBusy] = createSignal(false);
	const [saved, setSaved] = createSignal(false);
	const [logins, setLogins] = createSignal<{ id: string; name: string; captured: boolean }[]>([]);

	onMount(async () => {
		setLogins((await trpc.loginFlows.list.query()) as { id: string; name: string; captured: boolean }[]);
	});

	/** Trim empties into undefined so the stored settings stay minimal. */
	function clean(): TestSettings {
		const out: TestSettings = {};
		if (s.viewport?.trim()) out.viewport = s.viewport.trim();
		if (s.browsers?.length) out.browsers = s.browsers;
		if (s.userAgent?.trim()) out.userAgent = s.userAgent.trim();
		if (s.language?.trim()) out.language = s.language.trim();
		if (s.basicAuth?.username || s.basicAuth?.password) out.basicAuth = { username: s.basicAuth.username ?? '', password: s.basicAuth.password ?? '' };
		if (s.elementTimeoutMs) out.elementTimeoutMs = Number(s.elementTimeoutMs);
		if (s.stepDelayMs) out.stepDelayMs = Number(s.stepDelayMs);
		if (s.failOnJsError) out.failOnJsError = true;
		if (s.retry) out.retry = true;
		if (s.loginFlowId) out.loginFlowId = s.loginFlowId;
		if (s.headers && Object.keys(s.headers).length) out.headers = s.headers;
		return out;
	}

	async function save() {
		setBusy(true);
		try {
			await trpc.tests.updateSettings.mutate({ id: props.testId, settings: clean() });
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel icon={<IconSettings size={16} />} title="Settings">
			<div class={styles['grid']}>
				<div class={styles['col-span-2']}>
					<label class={styles['label']}>Browsers (each adds a run)</label>
					<div class={styles['check-row']}>
						{(['chromium', 'firefox', 'webkit'] as const).map((b) => (
							<label class={styles['check-label']}>
								<input
									type="checkbox"
									checked={(s.browsers ?? ['chromium']).includes(b)}
									onChange={(e) => {
										const cur = new Set(s.browsers ?? ['chromium']);
										e.currentTarget.checked ? cur.add(b) : cur.delete(b);
										setS('browsers', [...cur]);
									}}
								/>
								{b}
							</label>
						))}
					</div>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Screen size</label>
					<input class={styles['input']} value={s.viewport ?? ''} placeholder="1280x720" onInput={(e) => setS('viewport', e.currentTarget.value)} />
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Language (locale)</label>
					<input class={styles['input']} value={s.language ?? ''} placeholder="en-US" onInput={(e) => setS('language', e.currentTarget.value)} />
				</div>
				<div class={styles['col-span-2']}>
					<label class={styles['label']}>Log in first with</label>
					<select class={styles['select']} value={s.loginFlowId ?? ''} onChange={(e) => setS('loginFlowId', e.currentTarget.value || undefined)}>
						<option value="">No login (run as anonymous)</option>
						<For each={logins()}>{(l) => <option value={l.id}>{l.name}{l.captured ? ' — captured' : ' (not captured)'}</option>}</For>
					</select>
				</div>
				<div class={styles['col-span-2']}>
					<label class={styles['label']}>Custom user agent</label>
					<input class={styles['input']} value={s.userAgent ?? ''} placeholder="MyBot/1.0" onInput={(e) => setS('userAgent', e.currentTarget.value)} />
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>HTTP auth username</label>
					<input
						class={styles['input']}
						value={s.basicAuth?.username ?? ''}
						onInput={(e) => setS('basicAuth', { username: e.currentTarget.value, password: s.basicAuth?.password ?? '' })}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>HTTP auth password</label>
					<input
						class={styles['input']}
						type="password"
						value={s.basicAuth?.password ?? ''}
						onInput={(e) => setS('basicAuth', { username: s.basicAuth?.username ?? '', password: e.currentTarget.value })}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Element timeout (ms)</label>
					<input
						class={styles['input']}
						type="number"
						value={s.elementTimeoutMs ?? ''}
						placeholder="15000"
						onInput={(e) => setS('elementTimeoutMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Delay between steps (ms)</label>
					<input
						class={styles['input']}
						type="number"
						value={s.stepDelayMs ?? ''}
						placeholder="0"
						onInput={(e) => setS('stepDelayMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
				<label class={styles['check-label']}>
					<input type="checkbox" checked={s.failOnJsError ?? false} onChange={(e) => setS('failOnJsError', e.currentTarget.checked)} />
					Fail on page JS errors
				</label>
				<label class={styles['check-label']}>
					<input type="checkbox" checked={s.retry ?? false} onChange={(e) => setS('retry', e.currentTarget.checked)} />
					Auto-retry once on failure
				</label>
				<div class={`${styles['actions']} ${styles['col-span-2']}`}>
					<button type="button" onClick={save} disabled={busy()} class={styles['save-btn']}>
						{busy() ? 'Saving…' : 'Save settings'}
					</button>
					<Show when={saved()}>
						<span class={styles['saved']}>
							<IconCheck size={14} /> Saved
						</span>
					</Show>
				</div>
			</div>
		</Panel>
	);
}
