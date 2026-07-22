import type { TestSettings } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { trpc } from '../lib/trpc';

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-white/30';
const label = 'mb-1 block text-xs font-medium text-white/45';

/** Editable per-test run configuration (viewport, UA, language, auth, timeouts, retry). */
export default function TestSettingsPanel(props: { testId: string; initial: TestSettings }) {
	const [s, setS] = createStore<TestSettings>({ ...props.initial });
	const [open, setOpen] = createSignal(false);
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
		<div class="rounded-xl border border-white/10 bg-white/[0.03]">
			<button class="flex w-full items-center justify-between px-4 py-3 text-sm text-white/70" onClick={() => setOpen((v) => !v)}>
				<span class="font-medium">⚙️ Settings</span>
				<span class="text-white/30">{open() ? '▲' : '▼'}</span>
			</button>
			<Show when={open()}>
				<div class="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2">
					<div class="sm:col-span-2">
						<label class={label}>Browsers (each adds a run)</label>
						<div class="flex gap-4">
							{(['chromium', 'firefox', 'webkit'] as const).map((b) => (
								<label class="flex items-center gap-2 text-sm text-white/70">
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
					<div>
						<label class={label}>Screen size</label>
						<input class={field} value={s.viewport ?? ''} placeholder="1280x720" onInput={(e) => setS('viewport', e.currentTarget.value)} />
					</div>
					<div>
						<label class={label}>Language (locale)</label>
						<input class={field} value={s.language ?? ''} placeholder="en-US" onInput={(e) => setS('language', e.currentTarget.value)} />
					</div>
					<div class="sm:col-span-2">
						<label class={label}>Log in first with</label>
						<select class={field} value={s.loginFlowId ?? ''} onChange={(e) => setS('loginFlowId', e.currentTarget.value || undefined)}>
							<option value="">No login (run as anonymous)</option>
							<For each={logins()}>
								{(l) => (
									<option value={l.id}>
										{l.name}
										{l.captured ? ' ✓' : ' (not captured)'}
									</option>
								)}
							</For>
						</select>
					</div>
					<div class="sm:col-span-2">
						<label class={label}>Custom user agent</label>
						<input class={field} value={s.userAgent ?? ''} placeholder="MyBot/1.0" onInput={(e) => setS('userAgent', e.currentTarget.value)} />
					</div>
					<div>
						<label class={label}>HTTP auth username</label>
						<input
							class={field}
							value={s.basicAuth?.username ?? ''}
							onInput={(e) => setS('basicAuth', { username: e.currentTarget.value, password: s.basicAuth?.password ?? '' })}
						/>
					</div>
					<div>
						<label class={label}>HTTP auth password</label>
						<input
							class={field}
							type="password"
							value={s.basicAuth?.password ?? ''}
							onInput={(e) => setS('basicAuth', { username: s.basicAuth?.username ?? '', password: e.currentTarget.value })}
						/>
					</div>
					<div>
						<label class={label}>Element timeout (ms)</label>
						<input
							class={field}
							type="number"
							value={s.elementTimeoutMs ?? ''}
							placeholder="15000"
							onInput={(e) => setS('elementTimeoutMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
						/>
					</div>
					<div>
						<label class={label}>Delay between steps (ms)</label>
						<input
							class={field}
							type="number"
							value={s.stepDelayMs ?? ''}
							placeholder="0"
							onInput={(e) => setS('stepDelayMs', e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
						/>
					</div>
					<label class="flex items-center gap-2 text-sm text-white/70">
						<input type="checkbox" checked={s.failOnJsError ?? false} onChange={(e) => setS('failOnJsError', e.currentTarget.checked)} />
						Fail on page JS errors
					</label>
					<label class="flex items-center gap-2 text-sm text-white/70">
						<input type="checkbox" checked={s.retry ?? false} onChange={(e) => setS('retry', e.currentTarget.checked)} />
						Auto-retry once on failure
					</label>
					<div class="flex items-center gap-3 sm:col-span-2">
						<button onClick={save} disabled={busy()} class="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50">
							{busy() ? 'Saving…' : 'Save settings'}
						</button>
						<Show when={saved()}>
							<span class="text-sm text-emerald-300">Saved ✓</span>
						</Show>
					</div>
				</div>
			</Show>
		</div>
	);
}
