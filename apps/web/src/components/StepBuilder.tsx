import { describeStep, parseTest, toCode, type Locator, type Step } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { trpc } from '../lib/trpc';

type SavedAction = { id: string; name: string; dsl: string };

/** Roles a non-technical person recognizes, used when finding an element "by role". */
const KINDS: { value: string; label: string }[] = [
	{ value: 'button', label: 'Button' },
	{ value: 'link', label: 'Link' },
	{ value: 'textbox', label: 'Text box' },
	{ value: 'checkbox', label: 'Checkbox' },
	{ value: 'radio', label: 'Radio button' },
	{ value: 'combobox', label: 'Dropdown' },
	{ value: 'heading', label: 'Heading' },
	{ value: 'img', label: 'Image' },
	{ value: 'tab', label: 'Tab' },
	{ value: 'menuitem', label: 'Menu item' },
	{ value: 'listitem', label: 'List item' },
];

/** How to find an element — simple options first, power options after. */
const STRATEGIES: { value: string; label: string; hint: string }[] = [
	{ value: 'role', label: 'By kind + label', hint: 'e.g. the “Sign in” button' },
	{ value: 'text', label: 'By visible text', hint: 'e.g. Add to cart' },
	{ value: 'label', label: 'By field label', hint: 'a form field’s label' },
	{ value: 'placeholder', label: 'By placeholder', hint: 'greyed-out hint text in a field' },
	{ value: 'testId', label: 'By test ID (advanced)', hint: 'data-testid attribute' },
	{ value: 'altText', label: 'By image alt text (advanced)', hint: '' },
	{ value: 'title', label: 'By title (advanced)', hint: '' },
	{ value: 'css', label: 'By CSS selector (advanced)', hint: 'e.g. #login .submit' },
	{ value: 'xpath', label: 'By XPath (advanced)', hint: 'e.g. //button[@id="go"]' },
];
const STRAT_KEYS = ['role', 'text', 'placeholder', 'label', 'testId', 'altText', 'title', 'css', 'xpath', 'ref'] as const;

/** Palette of actions, in the order most people reach for them. `make` returns a fresh default step. */
const ACTIONS: { type: Step['type']; icon: string; label: string; make: () => Step }[] = [
	{ type: 'goto', icon: '🌐', label: 'Go to a web page', make: () => ({ type: 'goto', url: 'https://' }) },
	{ type: 'click', icon: '👆', label: 'Click something', make: () => ({ type: 'click', locator: { role: 'button' } }) },
	{ type: 'fill', icon: '⌨️', label: 'Type some text', make: () => ({ type: 'fill', locator: { role: 'textbox' }, value: '' }) },
	{ type: 'assertVisible', icon: '✅', label: 'Check something is visible', make: () => ({ type: 'assertVisible', locator: { role: 'heading' } }) },
	{
		type: 'assertText',
		icon: '📝',
		label: 'Check the text on the page',
		make: () => ({ type: 'assertText', locator: { role: 'heading' }, text: '', mode: 'contains' }),
	},
	{ type: 'assertUrl', icon: '🔗', label: 'Check the web address', make: () => ({ type: 'assertUrl', url: '/', exact: false }) },
	{ type: 'aiStep', icon: '✨', label: 'Describe it in plain words', make: () => ({ type: 'aiStep', instruction: '' }) },
	{ type: 'screenshot', icon: '📸', label: 'Take a screenshot', make: () => ({ type: 'screenshot', fullPage: false }) },
	{ type: 'visualCheck', icon: '🎨', label: 'Compare against a saved look', make: () => ({ type: 'visualCheck', name: '', fullPage: false }) },
	{ type: 'select', icon: '▼', label: 'Choose from a dropdown', make: () => ({ type: 'select', locator: { role: 'combobox' }, values: [''] }) },
	{ type: 'hover', icon: '🖱️', label: 'Hover over something', make: () => ({ type: 'hover', locator: { role: 'button' } }) },
	{ type: 'wait', icon: '⏱️', label: 'Wait (time or for an element)', make: () => ({ type: 'wait', timeoutMs: 1000 }) },
	{ type: 'waitForUrl', icon: '⏳', label: 'Wait for the web address', make: () => ({ type: 'waitForUrl', url: '' }) },
	{ type: 'waitForLoadState', icon: '🌐', label: 'Wait for the page to settle', make: () => ({ type: 'waitForLoadState', state: 'networkidle' }) },
	{ type: 'press', icon: '↵', label: 'Press a key', make: () => ({ type: 'press', key: 'Enter' }) },
	{ type: 'totp', icon: '🔐', label: 'Enter a 2-factor code', make: () => ({ type: 'totp', locator: { role: 'textbox' }, secret: '' }) },
	{ type: 'assertNotVisible', icon: '🙈', label: 'Check something is hidden', make: () => ({ type: 'assertNotVisible', locator: { role: 'heading' } }) },
	{ type: 'assertPresent', icon: '🔎', label: 'Check something exists', make: () => ({ type: 'assertPresent', locator: { role: 'button' } }) },
	{ type: 'assertNotPresent', icon: '🕳️', label: 'Check something is gone', make: () => ({ type: 'assertNotPresent', locator: { role: 'button' } }) },
	{ type: 'assertNotText', icon: '🚯', label: 'Check text is absent', make: () => ({ type: 'assertNotText', locator: { role: 'heading' }, text: '', mode: 'contains' }) },
	{ type: 'back', icon: '⬅️', label: 'Go back', make: () => ({ type: 'back' }) },
	{ type: 'refresh', icon: '🔄', label: 'Refresh the page', make: () => ({ type: 'refresh' }) },
	{ type: 'scroll', icon: '📜', label: 'Scroll', make: () => ({ type: 'scroll' }) },
	{ type: 'dragAndDrop', icon: '🎯', label: 'Drag and drop', make: () => ({ type: 'dragAndDrop', from: { role: 'button' }, to: { role: 'button' } }) },
	{ type: 'upload', icon: '📎', label: 'Upload a file', make: () => ({ type: 'upload', locator: { role: 'button' }, files: [''] }) },
	{ type: 'extract', icon: '📤', label: 'Save text into a variable', make: () => ({ type: 'extract', name: '', locator: { role: 'heading' } }) },
	{ type: 'extractJs', icon: '📥', label: 'Save a code result', make: () => ({ type: 'extractJs', name: '', code: 'return document.title;' }) },
	{ type: 'exit', icon: '⏹️', label: 'Stop the test', make: () => ({ type: 'exit', pass: true }) },
	{ type: 'setVar', icon: '🔤', label: 'Set a variable', make: () => ({ type: 'setVar', name: '', value: '' }) },
	{ type: 'execJs', icon: '💻', label: 'Run custom code', make: () => ({ type: 'execJs', code: '' }) },
	{ type: 'assertJs', icon: '🧪', label: 'Check with custom code', make: () => ({ type: 'assertJs', code: 'return true;' }) },
];

const EXAMPLE: Step[] = [
	{ type: 'goto', url: 'https://example.com' },
	{ type: 'assertVisible', locator: { role: 'heading', name: 'Example Domain' } },
	{ type: 'click', locator: { role: 'link', name: 'More information...' } },
];

const field = 'w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-white/30';
const label = 'mb-1 block text-xs font-medium text-white/45';

type L = Record<string, unknown>;

/** Which strategy the locator currently uses (first strategy field that's set). */
function strategyOf(loc: L): string {
	return STRAT_KEYS.find((k) => loc[k] !== undefined) ?? 'role';
}
/** The primary text value of a locator (its name for role, else the strategy field). */
function primaryValue(loc: L): string {
	const s = strategyOf(loc);
	return String((s === 'role' ? loc.name : loc[s]) ?? '');
}
/** Rebuild a locator using a new strategy, carrying over the text value + modifiers. */
function withStrategy(loc: L, strat: string, val: string): L {
	const keep: L = {};
	for (const k of ['exact', 'nth', 'fallbacks'] as const) if (loc[k] !== undefined) keep[k] = loc[k];
	if (strat === 'role') return { role: loc.role ?? 'button', ...(val ? { name: val } : {}), ...keep };
	if (strat === 'ref') return { ref: val, ...keep };
	return { [strat]: val, ...keep };
}

/** The strategy dropdown + value input(s) for one selector (used for primary and fallbacks). */
function StrategyPicker(props: { locator: L; onChange: (l: L) => void }) {
	const strat = () => strategyOf(props.locator);
	const st = () => STRATEGIES.find((s) => s.value === strat());
	return (
		<div class="grid grid-cols-[10rem_1fr] gap-2">
			<div>
				<label class={label}>How to find it</label>
				<select class={field} value={strat()} onChange={(e) => props.onChange(withStrategy(props.locator, e.currentTarget.value, primaryValue(props.locator)))}>
					<For each={STRATEGIES}>{(s) => <option value={s.value}>{s.label}</option>}</For>
				</select>
			</div>
			<Show
				when={strat() === 'role'}
				fallback={
					<div>
						<label class={label}>{st()?.label.replace(/^By /, '').replace(/ \(advanced\)$/, '')}</label>
						<input
							class={field}
							value={primaryValue(props.locator)}
							placeholder={st()?.hint}
							onInput={(e) => props.onChange(withStrategy(props.locator, strat(), e.currentTarget.value))}
						/>
					</div>
				}
			>
				<div class="grid grid-cols-[7rem_1fr] gap-2">
					<div>
						<label class={label}>Kind</label>
						<select
							class={field}
							value={String(props.locator.role ?? 'button')}
							onChange={(e) => props.onChange({ ...props.locator, role: e.currentTarget.value })}
						>
							<For each={KINDS}>{(k) => <option value={k.value}>{k.label}</option>}</For>
						</select>
					</div>
					<div>
						<label class={label}>Labeled / says</label>
						<input
							class={field}
							value={primaryValue(props.locator)}
							placeholder="e.g. Sign in (optional)"
							onInput={(e) => props.onChange(withStrategy(props.locator, 'role', e.currentTarget.value))}
						/>
					</div>
				</div>
			</Show>
		</div>
	);
}

/**
 * Full element picker: a strategy picker plus an "advanced" drawer for exact-match,
 * disambiguation (nth), and backup selectors — so it stays simple by default but lets
 * an experienced user build a precise, resilient target.
 */
function ElementField(props: { locator: Locator; onChange: (l: Locator) => void }) {
	const [adv, setAdv] = createSignal(false);
	const loc = () => props.locator as L;
	const fallbacks = () => (loc().fallbacks as L[] | undefined) ?? [];
	const patch = (p: L) => props.onChange({ ...loc(), ...p } as Locator);
	const setFallbacks = (fs: L[]) => props.onChange({ ...loc(), fallbacks: fs.length ? fs : undefined } as Locator);

	return (
		<div class="space-y-2">
			<StrategyPicker locator={loc()} onChange={(l) => props.onChange(l as Locator)} />
			<button class="text-xs text-white/35 hover:text-white/60" onClick={() => setAdv((v) => !v)}>
				{adv() ? '− fewer options' : '+ exact match, backup selectors, which-one'}
			</button>
			<Show when={adv()}>
				<div class="space-y-2 rounded-lg border border-white/5 bg-black/20 p-3">
					<div class="flex flex-wrap items-center gap-4">
						<label class="flex items-center gap-2 text-xs text-white/70">
							<input type="checkbox" checked={Boolean(loc().exact)} onChange={(e) => patch({ exact: e.currentTarget.checked || undefined })} />
							Exact match (not just contains)
						</label>
						<label class="flex items-center gap-2 text-xs text-white/70">
							If several match, use #
							<input
								type="number"
								min="1"
								class="w-16 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
								value={loc().nth !== undefined ? Number(loc().nth) + 1 : ''}
								placeholder="1"
								onInput={(e) => patch({ nth: e.currentTarget.value ? Number(e.currentTarget.value) - 1 : undefined })}
							/>
						</label>
					</div>
					<div>
						<span class={label}>Backup selectors (tried if the main one isn’t found)</span>
						<For each={fallbacks()}>
							{(f, i) => (
								<div class="mb-2 flex items-start gap-2">
									<div class="flex-1">
										<StrategyPicker locator={f} onChange={(nf) => setFallbacks(fallbacks().map((x, j) => (j === i() ? nf : x)))} />
									</div>
									<button class="mt-6 rounded p-1 text-white/40 hover:text-red-300" onClick={() => setFallbacks(fallbacks().filter((_, j) => j !== i()))}>
										✕
									</button>
								</div>
							)}
						</For>
						<button class="text-xs text-violet-300/80 hover:text-violet-200" onClick={() => setFallbacks([...fallbacks(), { css: '' }])}>
							+ add a backup selector
						</button>
					</div>
				</div>
			</Show>
		</div>
	);
}

/** Remove empty accessible names so the runtime matches by role alone rather than name="". */
function normalize(steps: Step[]): Step[] {
	// JSON round-trip unwraps Solid store proxies (which structuredClone can't clone) into plain data.
	const plain = JSON.parse(JSON.stringify(steps)) as (Step & { locator?: Locator; condition?: string })[];
	for (const c of plain) {
		if (c.locator && c.locator.name === '') delete c.locator.name;
		// An empty condition means "always run" — drop it (an empty JS condition would skip the step).
		if (c.condition !== undefined && c.condition.trim() === '') delete c.condition;
	}
	return plain;
}

/**
 * The no-code test builder: a stack of plain-language step cards plus an action palette.
 * This is the primary authoring surface — no code, no DSL knowledge required.
 */
export default function StepBuilder(props: { mode?: 'test' | 'action' | 'login' }) {
	const isAction = () => props.mode === 'action';
	const isLogin = () => props.mode === 'login';
	const special = () => props.mode === 'action' || props.mode === 'login';
	const [name, setName] = createSignal('');
	const [steps, setSteps] = createStore<Step[]>(special() ? [] : [...EXAMPLE]);
	const [busy, setBusy] = createSignal(false);
	const [err, setErr] = createSignal('');
	const [showCode, setShowCode] = createSignal(false);
	const [actions, setActions] = createSignal<SavedAction[]>([]);
	const [savedMsg, setSavedMsg] = createSignal('');
	const [savingAction, setSavingAction] = createSignal(false);
	const [actionName, setActionName] = createSignal('');

	// Reusable actions can be dropped into a test (but not into another action/login, to keep authoring simple).
	onMount(() => {
		if (!special()) void refreshActions();
	});
	async function refreshActions() {
		try {
			setActions((await trpc.actions.list.query()) as SavedAction[]);
		} catch {
			/* actions are optional — ignore load failures */
		}
	}

	/** Merge a partial into the step at `idx` (the store keeps the rest reactive). */
	function patchStep(idx: number, p: Partial<Step>) {
		setSteps(idx, p as never);
	}
	function addStep(make: () => Step) {
		setSteps(produce((s) => s.push(make())));
		setErr('');
	}
	/** Add a live reference to the action — edits to the action propagate to this test. */
	function insertActionRef(a: SavedAction) {
		setSteps(produce((s) => s.push({ type: 'actionRef', actionId: a.id, name: a.name } as Step)));
		setErr('');
	}
	/** Copy the action's steps in as editable steps (a snapshot, not a live link). */
	function insertActionCopy(a: SavedAction) {
		try {
			const parsed = parseTest(JSON.parse(a.dsl));
			setSteps(produce((s) => s.push(...parsed.steps)));
			setErr('');
		} catch {
			setErr(`Couldn't add the "${a.name}" action.`);
		}
	}
	/** Save the current steps as a reusable action so it appears in the palette. */
	async function saveAsAction() {
		const nm = actionName().trim();
		if (!nm) {
			setErr('Give the action a name first.');
			return;
		}
		if (steps.length === 0) {
			setErr('Add at least one step before saving an action.');
			return;
		}
		try {
			await trpc.actions.create.mutate({ name: nm, dsl: JSON.stringify({ steps: normalize(steps) }) });
			await refreshActions();
			setSavingAction(false);
			setActionName('');
			setSavedMsg(`Saved "${nm}" — it's now in "Add an action".`);
			setTimeout(() => setSavedMsg(''), 4000);
		} catch (e) {
			setErr(e instanceof Error ? e.message : String(e));
		}
	}
	function removeStep(i: number) {
		setSteps(produce((s) => s.splice(i, 1)));
	}
	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= steps.length) return;
		setSteps(produce((s) => [s[i], s[j]] = [s[j], s[i]]));
	}

	async function submit() {
		if (!name().trim()) {
			setErr(isLogin() ? 'Please name your login flow first.' : isAction() ? 'Please name your action first.' : 'Please give your test a name first.');
			return;
		}
		if (steps.length === 0) {
			setErr('Add at least one step.');
			return;
		}
		setBusy(true);
		setErr('');
		try {
			const clean = normalize(steps);
			parseTest({ steps: clean });
			const dsl = JSON.stringify({ steps: clean });
			if (isLogin()) {
				await trpc.loginFlows.create.mutate({ name: name().trim(), dsl });
				window.location.href = '/logins';
			} else if (isAction()) {
				await trpc.actions.create.mutate({ name: name().trim(), dsl });
				window.location.href = '/actions';
			} else {
				const { id } = await trpc.tests.create.mutate({ name: name().trim(), dsl });
				window.location.href = `/tests/${id}`;
			}
		} catch (e) {
			setErr(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	}

	return (
		<div class="space-y-5">
			<div>
				<label class={label}>{isLogin() ? 'Name your login flow' : isAction() ? 'Name your action' : 'Name your test'}</label>
				<input
					class={field}
					value={name()}
					onInput={(e) => setName(e.currentTarget.value)}
					placeholder={isLogin() ? 'e.g. Staging login' : isAction() ? 'e.g. Log in' : 'e.g. Homepage loads and I can sign in'}
				/>
			</div>

			<div>
				<div class="mb-2 flex items-center justify-between">
					<span class="text-xs font-medium text-white/45">Steps</span>
					<Show when={steps.length > 0}>
						<button class="text-xs text-white/30 hover:text-white/60" onClick={() => setSteps([])}>
							Clear all
						</button>
					</Show>
				</div>

				<Show
					when={steps.length > 0}
					fallback={
						<div class="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
							No steps yet. Pick an action below to get started — or{' '}
							<button class="text-white/70 underline decoration-dotted hover:text-white" onClick={() => setSteps([...EXAMPLE])}>
								load an example
							</button>
							.
						</div>
					}
				>
					<ol class="space-y-2">
						<For each={steps}>
							{(step, i) => (
								<li class="group rounded-xl border border-white/10 bg-white/[0.03] p-3">
									<div class="mb-2 flex items-start gap-3">
										<span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/60">
											{i() + 1}
										</span>
										<p class="flex-1 pt-0.5 text-sm text-white/85">{describeStep(steps[i()])}</p>
										<div class="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
											<button title="Move up" class="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80" onClick={() => move(i(), -1)}>
												↑
											</button>
											<button title="Move down" class="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80" onClick={() => move(i(), 1)}>
												↓
											</button>
											<button title="Delete" class="rounded p-1 text-white/40 hover:bg-red-500/20 hover:text-red-300" onClick={() => removeStep(i())}>
												✕
											</button>
										</div>
									</div>
									<div class="pl-9">{stepFields(step, i(), patchStep)}</div>
									<div class="mt-2 pl-9">
										<label class="mb-1 block text-xs font-medium text-white/30">Only run this step if… (optional JS, e.g. {'{{count}}'} &gt; 0)</label>
										<input
											class="w-full rounded-lg border border-white/5 bg-black/20 px-3 py-1.5 text-xs text-white/70 outline-none focus:border-white/20"
											value={(steps[i()] as { condition?: string }).condition ?? ''}
											placeholder="always runs"
											onInput={(e) => patchStep(i(), { condition: e.currentTarget.value } as Partial<Step>)}
										/>
									</div>
								</li>
							)}
						</For>
					</ol>
				</Show>
			</div>

			<div>
				<span class="mb-2 block text-xs font-medium text-white/45">Add an action</span>
				<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
					<For each={ACTIONS}>
						{(a) => (
							<button
								onClick={() => addStep(a.make)}
								class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-xs text-white/70 transition hover:border-white/25 hover:bg-white/[0.06]"
							>
								<span class="text-base">{a.icon}</span>
								<span>{a.label}</span>
							</button>
						)}
					</For>
				</div>

				<Show when={actions().length > 0}>
					<div class="mt-3 flex items-center justify-between">
						<span class="text-xs font-medium text-white/45">Your saved actions</span>
						<a href="/actions" class="text-xs text-white/30 hover:text-white/60">Manage</a>
					</div>
					<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
						<For each={actions()}>
							{(a) => (
								<div class="flex items-stretch overflow-hidden rounded-lg border border-violet-500/25 bg-violet-500/[0.06] text-xs text-violet-200">
									<button
										onClick={() => insertActionRef(a)}
										title={`Insert a live reference to "${a.name}"`}
										class="flex flex-1 items-center gap-2 px-3 py-2 text-left transition hover:bg-violet-500/10"
									>
										<span class="text-base">⭐</span>
										<span class="truncate">{a.name}</span>
									</button>
									<button
										onClick={() => insertActionCopy(a)}
										title="Insert an editable copy instead"
										class="border-l border-violet-500/25 px-2 text-violet-300/70 transition hover:bg-violet-500/10 hover:text-violet-200"
									>
										copy
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>

			<Show when={err()}>
				<p class="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">{err()}</p>
			</Show>
			<Show when={savedMsg()}>
				<p class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">{savedMsg()}</p>
			</Show>

			<div class="flex flex-wrap items-center gap-3">
				<button
					onClick={submit}
					disabled={busy()}
					class="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
				>
					{busy() ? 'Saving…' : isLogin() ? 'Save login flow' : isAction() ? 'Save action' : 'Create test'}
				</button>
				<Show when={!special()}>
					<Show
						when={savingAction()}
						fallback={
							<button class="text-xs text-violet-300/80 hover:text-violet-200" onClick={() => setSavingAction(true)}>
								⭐ Save these steps as an action
							</button>
						}
					>
						<div class="flex items-center gap-2">
							<input
								class="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs outline-none focus:border-white/30"
								placeholder="Action name (e.g. Log in)"
								value={actionName()}
								onInput={(e) => setActionName(e.currentTarget.value)}
							/>
							<button class="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400" onClick={saveAsAction}>
								Save
							</button>
							<button class="text-xs text-white/40 hover:text-white/70" onClick={() => setSavingAction(false)}>
								Cancel
							</button>
						</div>
					</Show>
				</Show>
				<button class="ml-auto text-xs text-white/40 hover:text-white/70" onClick={() => setShowCode((v) => !v)}>
					{showCode() ? 'Hide code' : 'See the code'}
				</button>
			</div>

			<Show when={showCode()}>
				<pre class="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs text-white/60">
					{steps.length ? toCode({ steps: normalize(steps) }) : '// add steps to see the generated code'}
				</pre>
			</Show>
		</div>
	);
}

/** Render the editable fields for one step, inline under its sentence. */
function stepFields(step: Step, i: number, set: (idx: number, patch: Partial<Step>) => void) {
	const patch = (p: Partial<Step>) => set(i, p);
	const setLoc = (locator: Locator) => set(i, { locator } as Partial<Step>);

	switch (step.type) {
		case 'goto':
			return (
				<div>
					<label class={label}>Web address</label>
					<input class={field} value={step.url} placeholder="https://example.com" onInput={(e) => patch({ url: e.currentTarget.value })} />
				</div>
			);
		case 'click':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>How to click</label>
						<select
							class={field}
							value={step.double ? 'double' : (step.button ?? 'left')}
							onChange={(e) => {
								const v = e.currentTarget.value;
								patch({ double: v === 'double', button: v === 'right' ? 'right' : undefined } as Partial<Step>);
							}}
						>
							<option value="left">Single click</option>
							<option value="double">Double click</option>
							<option value="right">Right click</option>
						</select>
					</div>
				</div>
			);
		case 'hover':
		case 'assertVisible':
		case 'assertNotVisible':
		case 'assertPresent':
		case 'assertNotPresent':
			return <ElementField locator={step.locator} onChange={setLoc} />;
		case 'assertNotText':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>Should NOT contain the text</label>
						<input class={field} value={step.text} onInput={(e) => patch({ text: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'dragAndDrop':
			return (
				<div class="space-y-2">
					<div>
						<span class={label}>Drag this</span>
						<ElementField locator={step.from} onChange={(from) => patch({ from } as Partial<Step>)} />
					</div>
					<div>
						<span class={label}>Onto this</span>
						<ElementField locator={step.to} onChange={(to) => patch({ to } as Partial<Step>)} />
					</div>
				</div>
			);
		case 'scroll':
			return step.locator ? (
				<ElementField locator={step.locator} onChange={setLoc} />
			) : (
				<p class="text-xs text-white/30">Scrolls to the bottom of the page. Pick an element to scroll to it instead.</p>
			);
		case 'back':
		case 'refresh':
			return null;
		case 'actionRef':
			return (
				<p class="text-xs text-white/40">
					⭐ Live reference — runs the latest steps of this action. Edit it on the{' '}
					<a href="/actions" class="text-violet-300 underline decoration-dotted">
						Actions
					</a>{' '}
					page.
				</p>
			);
		case 'upload':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>File URL(s) to upload (comma-separated)</label>
						<input
							class={field}
							value={step.files.join(', ')}
							placeholder="https://example.com/sample.pdf"
							onInput={(e) => patch({ files: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })}
						/>
					</div>
				</div>
			);
		case 'extract':
			return (
				<div class="space-y-2">
					<div>
						<label class={label}>Save into variable</label>
						<input class={field} value={step.name} placeholder="e.g. orderId" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<ElementField locator={step.locator} onChange={setLoc} />
				</div>
			);
		case 'extractJs':
			return (
				<div class="space-y-2">
					<div>
						<label class={label}>Save into variable</label>
						<input class={field} value={step.name} placeholder="e.g. total" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div>
						<label class={label}>Code that returns the value</label>
						<textarea class={`${field} min-h-16 font-mono`} value={step.code} onInput={(e) => patch({ code: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'exit':
			return (
				<div>
					<label class={label}>End the test as</label>
					<select class={field} value={step.pass ? 'pass' : 'fail'} onChange={(e) => patch({ pass: e.currentTarget.value === 'pass' })}>
						<option value="pass">Passed</option>
						<option value="fail">Failed</option>
					</select>
				</div>
			);
		case 'fill':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>Text to type</label>
						<input class={field} value={step.value} onInput={(e) => patch({ value: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'assertText':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>Should contain the text</label>
						<input class={field} value={step.text} onInput={(e) => patch({ text: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'assertUrl':
			return (
				<div>
					<label class={label}>Web address contains</label>
					<input class={field} value={step.url} placeholder="/dashboard" onInput={(e) => patch({ url: e.currentTarget.value })} />
				</div>
			);
		case 'select':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>Option(s) to choose (comma-separated)</label>
						<input
							class={field}
							value={step.values.join(', ')}
							onInput={(e) => patch({ values: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })}
						/>
					</div>
				</div>
			);
		case 'aiStep':
			return (
				<div>
					<label class={label}>Describe what to do</label>
					<input
						class={field}
						value={step.instruction}
						placeholder="e.g. accept the cookie banner"
						onInput={(e) => patch({ instruction: e.currentTarget.value })}
					/>
					<p class="mt-1 text-xs text-white/30">✨ The AI will find the right element on the page for you.</p>
				</div>
			);
		case 'visualCheck':
			return (
				<div class="space-y-2">
					<div>
						<label class={label}>Name for this look</label>
						<input class={field} value={step.name} placeholder="e.g. homepage" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div class="grid grid-cols-2 gap-2">
						<div>
							<label class={label}>Tolerance (% changed)</label>
							<input
								type="number"
								min="0"
								max="90"
								step="0.1"
								class={field}
								value={step.tolerancePct ?? ''}
								placeholder="0.1"
								onInput={(e) => patch({ tolerancePct: e.currentTarget.value ? Number(e.currentTarget.value) : undefined } as Partial<Step>)}
							/>
						</div>
						<div>
							<label class={label}>Capture only (CSS, optional)</label>
							<input
								class={field}
								value={step.selector ?? ''}
								placeholder="#main"
								onInput={(e) => patch({ selector: e.currentTarget.value || undefined } as Partial<Step>)}
							/>
						</div>
					</div>
					<div>
						<label class={label}>Ignore these elements (CSS, comma-separated)</label>
						<input
							class={field}
							value={(step.exclude ?? []).join(', ')}
							placeholder=".timestamp, #ad-banner"
							onInput={(e) => patch({ exclude: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) } as Partial<Step>)}
						/>
					</div>
				</div>
			);
		case 'wait': {
			const mode = () => (step.locator ? 'element' : 'time');
			return (
				<div class="space-y-2">
					<div>
						<label class={label}>Wait for…</label>
						<select
							class={field}
							value={mode()}
							onChange={(e) =>
								e.currentTarget.value === 'element'
									? patch({ locator: { role: 'heading' }, state: 'visible', timeoutMs: undefined } as Partial<Step>)
									: patch({ locator: undefined, state: undefined, timeoutMs: 1000 } as Partial<Step>)
							}
						>
							<option value="time">a fixed amount of time</option>
							<option value="element">an element to appear / disappear</option>
						</select>
					</div>
					<Show
						when={mode() === 'element'}
						fallback={
							<div>
								<label class={label}>Seconds to wait</label>
								<input
									type="number"
									min="0"
									step="0.5"
									class={field}
									value={(step.timeoutMs ?? 1000) / 1000}
									onInput={(e) => patch({ timeoutMs: Math.max(0, Number(e.currentTarget.value) * 1000) })}
								/>
							</div>
						}
					>
						<ElementField locator={step.locator!} onChange={(locator) => patch({ locator } as Partial<Step>)} />
						<div>
							<label class={label}>Until it is</label>
							<select class={field} value={step.state ?? 'visible'} onChange={(e) => patch({ state: e.currentTarget.value } as Partial<Step>)}>
								<option value="visible">visible</option>
								<option value="hidden">hidden</option>
								<option value="attached">on the page</option>
								<option value="detached">gone from the page</option>
							</select>
						</div>
					</Show>
				</div>
			);
		}
		case 'waitForUrl':
			return (
				<div>
					<label class={label}>Wait until the web address matches</label>
					<input class={field} value={step.url} placeholder="**/dashboard" onInput={(e) => patch({ url: e.currentTarget.value })} />
					<p class="mt-1 text-xs text-white/30">Use * / ** as wildcards, e.g. <code class="text-white/50">**/orders/*</code>.</p>
				</div>
			);
		case 'waitForLoadState':
			return (
				<div>
					<label class={label}>Wait for</label>
					<select class={field} value={step.state} onChange={(e) => patch({ state: e.currentTarget.value } as Partial<Step>)}>
						<option value="networkidle">the page to settle (no network activity)</option>
						<option value="load">the load event</option>
						<option value="domcontentloaded">the DOM to be ready</option>
					</select>
				</div>
			);
		case 'press':
			return (
				<div>
					<label class={label}>Key to press</label>
					<input class={field} value={step.key} placeholder="Enter" onInput={(e) => patch({ key: e.currentTarget.value })} />
				</div>
			);
		case 'totp':
			return (
				<div class="space-y-2">
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={label}>2-factor secret reference</label>
						<input class={field} value={step.secret} placeholder="secret name" onInput={(e) => patch({ secret: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'setVar':
			return (
				<div class="grid grid-cols-[10rem_1fr] gap-2">
					<div>
						<label class={label}>Variable name</label>
						<input class={field} value={step.name} placeholder="e.g. email" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div>
						<label class={label}>Value</label>
						<input class={field} value={step.value} placeholder="e.g. {{internet.email}}" onInput={(e) => patch({ value: e.currentTarget.value })} />
						<p class="mt-1 text-xs text-white/30">
							Use it later as <code class="text-white/50">{'{{' + (step.name || 'name') + '}}'}</code>. Built-ins:{' '}
							<code class="text-white/50">{'{{timestamp}}'}</code>, <code class="text-white/50">{'{{internet.email}}'}</code>,{' '}
							<code class="text-white/50">{'{{name.firstName}}'}</code>.
						</p>
					</div>
				</div>
			);
		case 'execJs':
			return (
				<div>
					<label class={label}>Code to run in the page</label>
					<textarea
						class={`${field} min-h-20 font-mono`}
						value={step.code}
						placeholder="e.g. window.scrollTo(0, document.body.scrollHeight)"
						onInput={(e) => patch({ code: e.currentTarget.value })}
					/>
					<p class="mt-1 text-xs text-white/30">💻 Runs in the browser page (has access to window &amp; document). For developers.</p>
				</div>
			);
		case 'assertJs':
			return (
				<div>
					<label class={label}>Code that returns true to pass</label>
					<textarea
						class={`${field} min-h-20 font-mono`}
						value={step.code}
						placeholder="e.g. return document.querySelectorAll('.item').length === 3"
						onInput={(e) => patch({ code: e.currentTarget.value })}
					/>
					<p class="mt-1 text-xs text-white/30">🧪 The step passes when your code returns a truthy value.</p>
				</div>
			);
		case 'screenshot':
			return <p class="text-xs text-white/30">Captures a full picture of the page at this point.</p>;
	}
}
