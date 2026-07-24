import { DISABLED_BROWSERS, type TestSettings } from '@ghostwright/dsl';
import BrowserLogo from './BrowserLogo';
import { createSignal, onMount, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { trpc } from '../lib/trpc';
import Panel from './Panel';
import Select from './Select';
import { IconCheck, IconSettings } from './icons';
import styles from './panels.module.scss';

/** Editable per-test run configuration (viewport, UA, language, auth, timeouts, retry). */
export default function TestSettingsPanel(props: { testId: string; initial: TestSettings }) {
	// Migrate the legacy `retry` boolean to the numeric retryOnFail on load.
	const initial = { ...props.initial };
	if (initial.retry && initial.retryOnFail === undefined) initial.retryOnFail = 1;
	delete initial.retry;
	const [s, setS] = createStore<TestSettings>(initial);
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
		if (s.retryOnFail) out.retryOnFail = Number(s.retryOnFail);
		if (s.retryDelayMs) out.retryDelayMs = Number(s.retryDelayMs);
		if (s.stepRetries) out.stepRetries = Number(s.stepRetries);
		if (s.stepRetryDelayMs) out.stepRetryDelayMs = Number(s.stepRetryDelayMs);
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
						{(['chromium', 'firefox', 'webkit'] as const).map((b) => {
							// WebKit is temporarily disabled (its browser binary can't run in the
							// current environment); show it as "coming soon" and prevent selection.
							const comingSoon = DISABLED_BROWSERS.includes(b);
							const selected = () => !comingSoon && (s.browsers ?? ['chromium']).includes(b);
							// The logo itself is the toggle: grayscale when off, full color when on.
							// The checkbox stays for accessibility but is visually hidden.
							return (
								<label class={styles['browser-toggle']} classList={{ [styles['selected']]: selected(), [styles['disabled']]: comingSoon }}>
									<input
										type="checkbox"
										class={styles['visually-hidden']}
										disabled={comingSoon}
										checked={selected()}
										onChange={(e) => {
											const cur = new Set<'chromium' | 'firefox' | 'webkit'>(s.browsers ?? ['chromium']);
											if (e.currentTarget.checked) cur.add(b);
											else cur.delete(b);
											setS('browsers', [...cur]);
										}}
									/>
									<BrowserLogo browser={b} size={22} />
									<span class={styles['browser-name']}>{b}</span>
									{comingSoon && <span class={styles['coming-soon']}>coming soon</span>}
								</label>
							);
						})}
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
					<Select
						value={s.loginFlowId ?? ''}
						onChange={(v) => setS('loginFlowId', v || undefined)}
						ariaLabel="Log in first with"
						options={[
							{ value: '', label: 'No login (run as anonymous)' },
							...logins().map((l) => ({ value: l.id, label: `${l.name}${l.captured ? ' (captured)' : ' (not captured)'}` })),
						]}
					/>
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
				<label class={`${styles['check-label']} ${styles['col-span-2']}`}>
					<input type="checkbox" checked={s.failOnJsError ?? false} onChange={(e) => setS('failOnJsError', e.currentTarget.checked)} />
					Fail on page JS errors
				</label>

				<div class={styles['col-span-2']}>
					<label class={styles['label']}>Retry on failure</label>
					<p class={styles['field-hint']}>Re-run the whole test if it fails, and retry individual steps that error. Leave at 0 to turn off.</p>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Re-run whole test (times)</label>
					<input
						class={styles['input']}
						type="number"
						min="0"
						value={s.retryOnFail ?? ''}
						placeholder="0"
						onInput={(e) => setS('retryOnFail', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Wait before re-run (ms)</label>
					<input
						class={styles['input']}
						type="number"
						min="0"
						value={s.retryDelayMs ?? ''}
						placeholder="0"
						onInput={(e) => setS('retryDelayMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Retry each step (times)</label>
					<input
						class={styles['input']}
						type="number"
						min="0"
						value={s.stepRetries ?? ''}
						placeholder="0"
						onInput={(e) => setS('stepRetries', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>
				<div class={styles['field-group']}>
					<label class={styles['label']}>Wait between step retries (ms)</label>
					<input
						class={styles['input']}
						type="number"
						min="0"
						value={s.stepRetryDelayMs ?? ''}
						placeholder="0"
						onInput={(e) => setS('stepRetryDelayMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
					/>
				</div>

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
