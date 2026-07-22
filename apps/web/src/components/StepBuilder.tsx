import { describeStep, parseTest, toCode, type Locator, type Step } from '@ghostwright/dsl';
import { createSignal, For, onMount, Show } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { trpc } from '../lib/trpc';
import CodeEditor from './CodeEditor';
import Select from './Select';
import { ActionIcon, IconChevronDown, IconChevronUp, IconClose, IconCode, IconSparkle, IconStar, IconTrash } from './icons';
import styles from './StepBuilder.module.scss';

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

type ActionDef = { type: Step['type']; label: string; make: () => Step };

/**
 * Actions grouped into scannable categories (most-reached-for first within each),
 * so the palette reads as a handful of small sections rather than one long wall.
 */
const ACTION_GROUPS: { category: string; actions: ActionDef[] }[] = [
	{
		category: 'Navigate',
		actions: [
			{ type: 'goto', label: 'Go to a web page', make: () => ({ type: 'goto', url: 'https://' }) },
			{ type: 'back', label: 'Go back', make: () => ({ type: 'back' }) },
			{ type: 'refresh', label: 'Refresh the page', make: () => ({ type: 'refresh' }) },
			{ type: 'scroll', label: 'Scroll', make: () => ({ type: 'scroll' }) },
		],
	},
	{
		category: 'Interact',
		actions: [
			{ type: 'click', label: 'Click something', make: () => ({ type: 'click', locator: { role: 'button' } }) },
			{ type: 'fill', label: 'Type some text', make: () => ({ type: 'fill', locator: { role: 'textbox' }, value: '' }) },
			{ type: 'select', label: 'Choose from a dropdown', make: () => ({ type: 'select', locator: { role: 'combobox' }, values: [''] }) },
			{ type: 'hover', label: 'Hover over something', make: () => ({ type: 'hover', locator: { role: 'button' } }) },
			{ type: 'press', label: 'Press a key', make: () => ({ type: 'press', key: 'Enter' }) },
			{ type: 'dragAndDrop', label: 'Drag and drop', make: () => ({ type: 'dragAndDrop', from: { role: 'button' }, to: { role: 'button' } }) },
			{ type: 'upload', label: 'Upload a file', make: () => ({ type: 'upload', locator: { role: 'button' }, files: [''] }) },
			{ type: 'totp', label: 'Enter a 2-factor code', make: () => ({ type: 'totp', locator: { role: 'textbox' }, secret: '' }) },
		],
	},
	{
		category: 'Check',
		actions: [
			{ type: 'assertVisible', label: 'Check something is visible', make: () => ({ type: 'assertVisible', locator: { role: 'heading' } }) },
			{ type: 'assertText', label: 'Check the text on the page', make: () => ({ type: 'assertText', locator: { role: 'heading' }, text: '', mode: 'contains' }) },
			{ type: 'assertUrl', label: 'Check the web address', make: () => ({ type: 'assertUrl', url: '/', exact: false }) },
			{ type: 'assertNotVisible', label: 'Check something is hidden', make: () => ({ type: 'assertNotVisible', locator: { role: 'heading' } }) },
			{ type: 'assertPresent', label: 'Check something exists', make: () => ({ type: 'assertPresent', locator: { role: 'button' } }) },
			{ type: 'assertNotPresent', label: 'Check something is gone', make: () => ({ type: 'assertNotPresent', locator: { role: 'button' } }) },
			{ type: 'assertNotText', label: 'Check text is absent', make: () => ({ type: 'assertNotText', locator: { role: 'heading' }, text: '', mode: 'contains' }) },
			{ type: 'visualCheck', label: 'Compare against a saved look', make: () => ({ type: 'visualCheck', name: '', fullPage: false }) },
		],
	},
	{
		category: 'Wait',
		actions: [
			{ type: 'wait', label: 'Wait (time or for an element)', make: () => ({ type: 'wait', timeoutMs: 1000 }) },
			{ type: 'waitForUrl', label: 'Wait for the web address', make: () => ({ type: 'waitForUrl', url: '' }) },
			{ type: 'waitForLoadState', label: 'Wait for the page to settle', make: () => ({ type: 'waitForLoadState', state: 'networkidle' }) },
		],
	},
	{
		category: 'Capture & data',
		actions: [
			{ type: 'screenshot', label: 'Take a screenshot', make: () => ({ type: 'screenshot', fullPage: false }) },
			{ type: 'extract', label: 'Save text into a variable', make: () => ({ type: 'extract', name: '', locator: { role: 'heading' } }) },
			{ type: 'setVar', label: 'Set a variable', make: () => ({ type: 'setVar', name: '', value: '' }) },
		],
	},
	{
		category: 'AI & code',
		actions: [
			{ type: 'aiStep', label: 'Describe it in plain words', make: () => ({ type: 'aiStep', instruction: '' }) },
			{ type: 'extractJs', label: 'Save a code result', make: () => ({ type: 'extractJs', name: '', code: 'return document.title;' }) },
			{ type: 'execJs', label: 'Run custom code', make: () => ({ type: 'execJs', code: '' }) },
			{ type: 'assertJs', label: 'Check with custom code', make: () => ({ type: 'assertJs', code: 'return true;' }) },
			{ type: 'exit', label: 'Stop the test', make: () => ({ type: 'exit', pass: true }) },
		],
	},
];

const ALL_ACTIONS: ActionDef[] = ACTION_GROUPS.flatMap((g) => g.actions);

const EXAMPLE: Step[] = [
	{ type: 'goto', url: 'https://example.com' },
	{ type: 'assertVisible', locator: { role: 'heading', name: 'Example Domain' } },
	{ type: 'click', locator: { role: 'link', name: 'More information...' } },
];

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
		<div class={styles['strategy-grid']}>
			<div>
				<label class={styles['label']}>How to find it</label>
				<Select
					value={strat()}
					onChange={(v) => props.onChange(withStrategy(props.locator, v, primaryValue(props.locator)))}
					ariaLabel="How to find it"
					options={STRATEGIES.map((s) => ({ value: s.value, label: s.label }))}
				/>
			</div>
			<Show
				when={strat() === 'role'}
				fallback={
					<div>
						<label class={styles['label']}>{st()?.label.replace(/^By /, '').replace(/ \(advanced\)$/, '')}</label>
						<input
							class={styles['input']}
							value={primaryValue(props.locator)}
							placeholder={st()?.hint}
							onInput={(e) => props.onChange(withStrategy(props.locator, strat(), e.currentTarget.value))}
						/>
					</div>
				}
			>
				<div class={styles['role-grid']}>
					<div>
						<label class={styles['label']}>Kind</label>
						<Select
							value={String(props.locator.role ?? 'button')}
							onChange={(v) => props.onChange({ ...props.locator, role: v })}
							ariaLabel="Kind"
							options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
						/>
					</div>
					<div>
						<label class={styles['label']}>Labeled / says</label>
						<input
							class={styles['input']}
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
		<div class={styles['picker']}>
			<StrategyPicker locator={loc()} onChange={(l) => props.onChange(l as Locator)} />
			<button type="button" class={styles['adv-toggle']} onClick={() => setAdv((v) => !v)}>
				{adv() ? '− fewer options' : '+ exact match, backup selectors, which-one'}
			</button>
			<Show when={adv()}>
				<div class={styles['adv-panel']}>
					<div class={styles['adv-row']}>
						<label class={styles['check-label']}>
							<input type="checkbox" checked={Boolean(loc().exact)} onChange={(e) => patch({ exact: e.currentTarget.checked || undefined })} />
							Exact match (not just contains)
						</label>
						<label class={styles['check-label']}>
							If several match, use #
							<input
								type="number"
								min="1"
								class={styles['nth-input']}
								value={loc().nth !== undefined ? Number(loc().nth) + 1 : ''}
								placeholder="1"
								onInput={(e) => patch({ nth: e.currentTarget.value ? Number(e.currentTarget.value) - 1 : undefined })}
							/>
						</label>
					</div>
					<div>
						<span class={styles['label']}>Backup selectors (tried if the main one isn’t found)</span>
						<For each={fallbacks()}>
							{(f, i) => (
								<div class={styles['fallback-row']}>
									<div class={styles['fallback-main']}>
										<StrategyPicker locator={f} onChange={(nf) => setFallbacks(fallbacks().map((x, j) => (j === i() ? nf : x)))} />
									</div>
									<button type="button" class={styles['fallback-remove']} title="Remove backup" onClick={() => setFallbacks(fallbacks().filter((_, j) => j !== i()))}>
										<IconClose size={14} />
									</button>
								</div>
							)}
						</For>
						<button type="button" class={styles['accent-btn']} onClick={() => setFallbacks([...fallbacks(), { css: '' }])}>
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
	const [actionQuery, setActionQuery] = createSignal('');

	// Filter across every action when searching; empty query shows the grouped palette.
	const filteredActions = () => {
		const q = actionQuery().trim().toLowerCase();
		return q ? ALL_ACTIONS.filter((a) => a.label.toLowerCase().includes(q)) : [];
	};

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
			setSavedMsg(`Saved "${nm}" — it's now in the palette.`);
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
		<div class={styles['builder']}>
			<div class={styles['field-group']}>
				<label class={styles['label']}>{isLogin() ? 'Name your login flow' : isAction() ? 'Name your action' : 'Name your test'}</label>
				<input
					class={styles['input']}
					value={name()}
					onInput={(e) => setName(e.currentTarget.value)}
					placeholder={isLogin() ? 'e.g. Staging login' : isAction() ? 'e.g. Log in' : 'e.g. Homepage loads and I can sign in'}
				/>
			</div>

			<div class={styles['section']}>
				<div class={styles['section-head']}>
					<span class={styles['section-label']}>Steps</span>
					<Show when={steps.length > 0}>
						<button type="button" class={styles['text-btn']} onClick={() => setSteps([])}>
							Clear all
						</button>
					</Show>
				</div>

				<Show
					when={steps.length > 0}
					fallback={
						<div class={styles['empty']}>
							No steps yet. Pick an action below to get started — or{' '}
							<button type="button" class={styles['link-inline']} onClick={() => setSteps([...EXAMPLE])}>
								load an example
							</button>
							.
						</div>
					}
				>
					<ol class={styles['step-list']}>
						<For each={steps}>
							{(step, i) => (
								<li class={styles['step']}>
									<div class={styles['step-top']}>
										<span class={styles['step-num']}>{i() + 1}</span>
										<p class={styles['step-desc']}>{describeStep(steps[i()])}</p>
										<div class={styles['step-controls']}>
											<button type="button" title="Move up" class={styles['icon-btn']} disabled={i() === 0} onClick={() => move(i(), -1)}>
												<IconChevronUp size={15} />
											</button>
											<button type="button" title="Move down" class={styles['icon-btn']} disabled={i() === steps.length - 1} onClick={() => move(i(), 1)}>
												<IconChevronDown size={15} />
											</button>
											<button type="button" title="Delete" class={`${styles['icon-btn']} ${styles['danger']}`} onClick={() => removeStep(i())}>
												<IconTrash size={15} />
											</button>
										</div>
									</div>
									<div class={styles['step-body']}>
										{stepFields(step, i(), patchStep)}
										<div class={styles['condition']}>
											<label class={styles['condition-label']}>Only run this step if… (optional JS, e.g. {'{{count}}'} &gt; 0)</label>
											<input
												class={styles['condition-input']}
												value={(steps[i()] as { condition?: string }).condition ?? ''}
												placeholder="always runs"
												onInput={(e) => patchStep(i(), { condition: e.currentTarget.value } as Partial<Step>)}
											/>
										</div>
									</div>
								</li>
							)}
						</For>
					</ol>
				</Show>
			</div>

			<div class={styles['section']}>
				<div class={styles['section-head']}>
					<span class={styles['section-label']}>Add an action</span>
				</div>
				<div class={styles['palette-search']}>
					<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input value={actionQuery()} onInput={(e) => setActionQuery(e.currentTarget.value)} placeholder="Search actions…" aria-label="Search actions" />
					<Show when={actionQuery()}>
						<button type="button" class={styles['search-clear']} title="Clear" onClick={() => setActionQuery('')}>
							<IconClose size={14} />
						</button>
					</Show>
				</div>

				<Show
					when={actionQuery().trim()}
					fallback={
						<For each={ACTION_GROUPS}>
							{(g) => (
								<div class={styles['action-group']}>
									<span class={styles['group-label']}>{g.category}</span>
									<div class={styles['palette']}>
										<For each={g.actions}>
											{(a) => (
												<button type="button" onClick={() => addStep(a.make)} class={styles['action-btn']}>
													<span class={styles['action-icon']}>
														<ActionIcon type={a.type} size={16} />
													</span>
													<span class={styles['action-text']}>{a.label}</span>
												</button>
											)}
										</For>
									</div>
								</div>
							)}
						</For>
					}
				>
					<Show
						when={filteredActions().length > 0}
						fallback={<p class={styles['no-actions']}>No actions match “{actionQuery()}”.</p>}
					>
						<div class={styles['palette']}>
							<For each={filteredActions()}>
								{(a) => (
									<button type="button" onClick={() => addStep(a.make)} class={styles['action-btn']}>
										<span class={styles['action-icon']}>
											<ActionIcon type={a.type} size={16} />
										</span>
										<span class={styles['action-text']}>{a.label}</span>
									</button>
								)}
							</For>
						</div>
					</Show>
				</Show>

				<Show when={actions().length > 0}>
					<div class={styles['section-head']} style={{ 'margin-top': '0.75rem' }}>
						<span class={styles['section-label']}>Your saved actions</span>
						<a href="/actions" class={styles['text-btn']}>
							Manage
						</a>
					</div>
					<div class={styles['saved-grid']}>
						<For each={actions()}>
							{(a) => (
								<div class={styles['saved-action']}>
									<button type="button" onClick={() => insertActionRef(a)} title={`Insert a live reference to "${a.name}"`} class={styles['saved-ref']}>
										<IconStar size={14} />
										<span>{a.name}</span>
									</button>
									<button type="button" onClick={() => insertActionCopy(a)} title="Insert an editable copy instead" class={styles['saved-copy']}>
										copy
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>

			<Show when={err()}>
				<p class={styles['alert']}>{err()}</p>
			</Show>
			<Show when={savedMsg()}>
				<p class={styles['notice']}>{savedMsg()}</p>
			</Show>

			<div class={styles['footer']}>
				<button type="button" onClick={submit} disabled={busy()} class={styles['submit']}>
					{busy() ? 'Saving…' : isLogin() ? 'Save login flow' : isAction() ? 'Save action' : 'Create test'}
				</button>
				<Show when={!special()}>
					<Show
						when={savingAction()}
						fallback={
							<button type="button" class={styles['accent-btn']} onClick={() => setSavingAction(true)}>
								<IconStar size={13} /> Save these steps as an action
							</button>
						}
					>
						<div class={styles['save-action-row']}>
							<input
								class={styles['save-action-input']}
								placeholder="Action name (e.g. Log in)"
								value={actionName()}
								onInput={(e) => setActionName(e.currentTarget.value)}
							/>
							<button type="button" class={styles['save-confirm']} onClick={saveAsAction}>
								Save
							</button>
							<button type="button" class={styles['text-btn']} onClick={() => setSavingAction(false)}>
								Cancel
							</button>
						</div>
					</Show>
				</Show>
				<button type="button" class={styles['code-toggle']} onClick={() => setShowCode((v) => !v)}>
					<IconCode size={14} />
					{showCode() ? 'Hide code' : 'See the code'}
				</button>
			</div>

			<Show when={showCode()}>
				<CodeEditor readOnly value={steps.length ? toCode({ steps: normalize(steps) }) : '// add steps to see the generated code'} minHeight="4rem" />
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
				<div class={styles['field-group']}>
					<label class={styles['label']}>Web address</label>
					<input class={styles['input']} value={step.url} placeholder="https://example.com" onInput={(e) => patch({ url: e.currentTarget.value })} />
				</div>
			);
		case 'click':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>How to click</label>
						<Select
							value={step.double ? 'double' : (step.button ?? 'left')}
							onChange={(v) => patch({ double: v === 'double', button: v === 'right' ? 'right' : undefined } as Partial<Step>)}
							ariaLabel="How to click"
							options={[
								{ value: 'left', label: 'Single click' },
								{ value: 'double', label: 'Double click' },
								{ value: 'right', label: 'Right click' },
							]}
						/>
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
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>Should NOT contain the text</label>
						<input class={styles['input']} value={step.text} onInput={(e) => patch({ text: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'dragAndDrop':
			return (
				<div class={styles['picker']}>
					<div>
						<span class={styles['label']}>Drag this</span>
						<ElementField locator={step.from} onChange={(from) => patch({ from } as Partial<Step>)} />
					</div>
					<div>
						<span class={styles['label']}>Onto this</span>
						<ElementField locator={step.to} onChange={(to) => patch({ to } as Partial<Step>)} />
					</div>
				</div>
			);
		case 'scroll':
			return step.locator ? (
				<ElementField locator={step.locator} onChange={setLoc} />
			) : (
				<p class={styles['hint']}>Scrolls to the bottom of the page. Pick an element to scroll to it instead.</p>
			);
		case 'back':
		case 'refresh':
			return null;
		case 'actionRef':
			return (
				<p class={styles['hint']}>
					Live reference — runs the latest steps of this action. Edit it on the{' '}
					<a href="/actions" class={styles['link-inline']}>
						Actions
					</a>{' '}
					page.
				</p>
			);
		case 'upload':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>File URL(s) to upload (comma-separated)</label>
						<input
							class={styles['input']}
							value={step.files.join(', ')}
							placeholder="https://example.com/sample.pdf"
							onInput={(e) => patch({ files: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })}
						/>
					</div>
				</div>
			);
		case 'extract':
			return (
				<div class={styles['picker']}>
					<div>
						<label class={styles['label']}>Save into variable</label>
						<input class={styles['input']} value={step.name} placeholder="e.g. orderId" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<ElementField locator={step.locator} onChange={setLoc} />
				</div>
			);
		case 'extractJs':
			return (
				<div class={styles['picker']}>
					<div>
						<label class={styles['label']}>Save into variable</label>
						<input class={styles['input']} value={step.name} placeholder="e.g. total" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div>
						<label class={styles['label']}>Code that returns the value</label>
						<CodeEditor value={step.code} onChange={(code) => patch({ code })} placeholder="return document.title;" />
					</div>
				</div>
			);
		case 'exit':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>End the test as</label>
					<Select
						value={step.pass ? 'pass' : 'fail'}
						onChange={(v) => patch({ pass: v === 'pass' })}
						ariaLabel="End the test as"
						options={[
							{ value: 'pass', label: 'Passed' },
							{ value: 'fail', label: 'Failed' },
						]}
					/>
				</div>
			);
		case 'fill':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>Text to type</label>
						<input class={styles['input']} value={step.value} onInput={(e) => patch({ value: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'assertText':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>Should contain the text</label>
						<input class={styles['input']} value={step.text} onInput={(e) => patch({ text: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'assertUrl':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Web address contains</label>
					<input class={styles['input']} value={step.url} placeholder="/dashboard" onInput={(e) => patch({ url: e.currentTarget.value })} />
				</div>
			);
		case 'select':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>Option(s) to choose (comma-separated)</label>
						<input
							class={styles['input']}
							value={step.values.join(', ')}
							onInput={(e) => patch({ values: e.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean) })}
						/>
					</div>
				</div>
			);
		case 'aiStep':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Describe what to do</label>
					<input
						class={styles['input']}
						value={step.instruction}
						placeholder="e.g. accept the cookie banner"
						onInput={(e) => patch({ instruction: e.currentTarget.value })}
					/>
					<p class={styles['hint']}>
						<IconSparkle size={12} /> The AI will find the right element on the page for you.
					</p>
				</div>
			);
		case 'visualCheck':
			return (
				<div class={styles['picker']}>
					<div>
						<label class={styles['label']}>Name for this look</label>
						<input class={styles['input']} value={step.name} placeholder="e.g. homepage" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div class={styles['strategy-grid']}>
						<div>
							<label class={styles['label']}>Tolerance (% changed)</label>
							<input
								type="number"
								min="0"
								max="90"
								step="0.1"
								class={styles['input']}
								value={step.tolerancePct ?? ''}
								placeholder="0.1"
								onInput={(e) => patch({ tolerancePct: e.currentTarget.value ? Number(e.currentTarget.value) : undefined } as Partial<Step>)}
							/>
						</div>
						<div>
							<label class={styles['label']}>Capture only (CSS, optional)</label>
							<input
								class={styles['input']}
								value={step.selector ?? ''}
								placeholder="#main"
								onInput={(e) => patch({ selector: e.currentTarget.value || undefined } as Partial<Step>)}
							/>
						</div>
					</div>
					<div>
						<label class={styles['label']}>Ignore these elements (CSS, comma-separated)</label>
						<input
							class={styles['input']}
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
				<div class={styles['picker']}>
					<div>
						<label class={styles['label']}>Wait for…</label>
						<Select
							value={mode()}
							onChange={(v) =>
								v === 'element'
									? patch({ locator: { role: 'heading' }, state: 'visible', timeoutMs: undefined } as Partial<Step>)
									: patch({ locator: undefined, state: undefined, timeoutMs: 1000 } as Partial<Step>)
							}
							ariaLabel="Wait for"
							options={[
								{ value: 'time', label: 'a fixed amount of time' },
								{ value: 'element', label: 'an element to appear / disappear' },
							]}
						/>
					</div>
					<Show
						when={mode() === 'element'}
						fallback={
							<div>
								<label class={styles['label']}>Seconds to wait</label>
								<input
									type="number"
									min="0"
									step="0.5"
									class={styles['input']}
									value={(step.timeoutMs ?? 1000) / 1000}
									onInput={(e) => patch({ timeoutMs: Math.max(0, Number(e.currentTarget.value) * 1000) })}
								/>
							</div>
						}
					>
						<ElementField locator={step.locator!} onChange={(locator) => patch({ locator } as Partial<Step>)} />
						<div>
							<label class={styles['label']}>Until it is</label>
							<Select
								value={step.state ?? 'visible'}
								onChange={(v) => patch({ state: v } as Partial<Step>)}
								ariaLabel="Until it is"
								options={[
									{ value: 'visible', label: 'visible' },
									{ value: 'hidden', label: 'hidden' },
									{ value: 'attached', label: 'on the page' },
									{ value: 'detached', label: 'gone from the page' },
								]}
							/>
						</div>
					</Show>
				</div>
			);
		}
		case 'waitForUrl':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Wait until the web address matches</label>
					<input class={styles['input']} value={step.url} placeholder="**/dashboard" onInput={(e) => patch({ url: e.currentTarget.value })} />
					<p class={styles['hint']}>
						Use * / ** as wildcards, e.g. <code>**/orders/*</code>.
					</p>
				</div>
			);
		case 'waitForLoadState':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Wait for</label>
					<Select
						value={step.state}
						onChange={(v) => patch({ state: v } as Partial<Step>)}
						ariaLabel="Wait for page state"
						options={[
							{ value: 'networkidle', label: 'the page to settle (no network activity)' },
							{ value: 'load', label: 'the load event' },
							{ value: 'domcontentloaded', label: 'the DOM to be ready' },
						]}
					/>
				</div>
			);
		case 'press':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Key to press</label>
					<input class={styles['input']} value={step.key} placeholder="Enter" onInput={(e) => patch({ key: e.currentTarget.value })} />
				</div>
			);
		case 'totp':
			return (
				<div class={styles['picker']}>
					<ElementField locator={step.locator} onChange={setLoc} />
					<div>
						<label class={styles['label']}>2-factor secret reference</label>
						<input class={styles['input']} value={step.secret} placeholder="secret name" onInput={(e) => patch({ secret: e.currentTarget.value })} />
					</div>
				</div>
			);
		case 'setVar':
			return (
				<div class={styles['strategy-grid']}>
					<div>
						<label class={styles['label']}>Variable name</label>
						<input class={styles['input']} value={step.name} placeholder="e.g. email" onInput={(e) => patch({ name: e.currentTarget.value })} />
					</div>
					<div>
						<label class={styles['label']}>Value</label>
						<input class={styles['input']} value={step.value} placeholder="e.g. {{internet.email}}" onInput={(e) => patch({ value: e.currentTarget.value })} />
						<p class={styles['hint']}>
							Use it later as <code>{'{{' + (step.name || 'name') + '}}'}</code>. Built-ins: <code>{'{{timestamp}}'}</code>, <code>{'{{internet.email}}'}</code>,{' '}
							<code>{'{{name.firstName}}'}</code>.
						</p>
					</div>
				</div>
			);
		case 'execJs':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Code to run in the page</label>
					<CodeEditor value={step.code} onChange={(code) => patch({ code })} placeholder="e.g. window.scrollTo(0, document.body.scrollHeight)" minHeight="5rem" />
					<p class={styles['hint']}>Runs in the browser page (has access to window &amp; document). For developers.</p>
				</div>
			);
		case 'assertJs':
			return (
				<div class={styles['field-group']}>
					<label class={styles['label']}>Code that returns true to pass</label>
					<CodeEditor value={step.code} onChange={(code) => patch({ code })} placeholder="e.g. return document.querySelectorAll('.item').length === 3" minHeight="5rem" />
					<p class={styles['hint']}>The step passes when your code returns a truthy value.</p>
				</div>
			);
		case 'screenshot':
			return <p class={styles['hint']}>Captures a full picture of the page at this point.</p>;
	}
}
