import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { runStatus } from '../lib/status';
import { trpc } from '../lib/trpc';
import PromptModal from './PromptModal';
import TestRowMenu from './TestRowMenu';
import { IconChevronRight, IconPlay, IconPlus, IconTrash } from './icons';
import styles from './TestList.module.scss';

type Test = { id: string; name: string; folderId: string | null; lastStatus: string | null };
type Folder = { id: string; name: string; parentId: string | null; collapsed: boolean };

/**
 * Home-page test browser: a nestable folder tree with per-test edit/delete/move and a
 * name search. Searching flattens the view to all matching tests across folders; with
 * no search, tests are grouped under their folders (unfiled tests sit at the top level).
 *
 * Folders (and their collapsed state) are provided by the server for the first render,
 * so the tree is resolved server-side with no expand/collapse flicker. Toggling a
 * folder persists the new state so it survives reloads.
 */
export default function TestList(props: { initial: Test[]; initialFolders: Folder[] }) {
	const [tests, setTests] = createSignal<Test[]>(props.initial);
	const [folders, setFolders] = createSignal<Folder[]>(props.initialFolders);
	const [query, setQuery] = createSignal('');
	// Collapsed folder ids, seeded from the server-persisted state (expanded by default).
	const [collapsed, setCollapsed] = createSignal<Set<string>>(new Set(props.initialFolders.filter((f) => f.collapsed).map((f) => f.id)));
	// The active folder-name prompt: create a (sub)folder, or rename an existing one.
	const [prompt, setPrompt] = createSignal<{ mode: 'create'; parentId: string | null } | { mode: 'rename'; id: string; current: string } | null>(null);
	// Ids of tests ticked for a batch run.
	const [selected, setSelected] = createSignal<Set<string>>(new Set());
	const [running, setRunning] = createSignal(false);
	// While a selection is active, checkboxes stay visible (not just on hover) so you
	// never lose sight of what's ticked when the mouse moves away.
	const anySelected = () => selected().size > 0;

	// The server already rendered tests + folders (with collapsed state) for the first
	// paint, so we only need to keep run statuses live. A full refresh runs after folder
	// mutations (create/rename/move/remove).
	onMount(startPolling);
	async function refresh() {
		const [t, f] = await Promise.all([trpc.tests.list.query() as Promise<Test[]>, trpc.folders.list.query() as Promise<Folder[]>]);
		setTests(t);
		setFolders(f);
		// Re-sync the collapsed set from the server's persisted state.
		setCollapsed(new Set(f.filter((folder) => folder.collapsed).map((folder) => folder.id)));
	}

	// Refresh only the tests (their last-run status), leaving folders/selection alone.
	async function refreshStatuses() {
		const t = (await trpc.tests.list.query()) as Test[];
		setTests(t);
	}

	// A run is still in flight if any test's last status is queued or running.
	const anyInFlight = () => tests().some((t) => t.lastStatus === 'queued' || t.lastStatus === 'running');

	// Self-scheduling poller: while a run is in flight, refresh the dots every couple of
	// seconds so they flip to passed/failed without a manual page reload; when nothing is
	// running, check back slowly to catch runs started elsewhere. A generation token
	// retires stale chains (e.g. after a fresh run kicks off a new poll).
	let timer: ReturnType<typeof setTimeout> | undefined;
	let gen = 0;
	let disposed = false;

	function scheduleNext(myGen: number, delayMs: number) {
		if (disposed || myGen !== gen) return;
		timer = setTimeout(() => void poll(myGen), delayMs);
	}
	async function poll(myGen: number) {
		try {
			await refreshStatuses();
		} catch {
			/* ignore a transient poll failure; the next tick retries */
		}
		if (disposed || myGen !== gen) return;
		scheduleNext(myGen, anyInFlight() ? 2000 : 8000);
	}
	function startPolling() {
		if (timer) clearTimeout(timer);
		gen++;
		void poll(gen);
	}

	onCleanup(() => {
		disposed = true;
		if (timer) clearTimeout(timer);
	});

	function toggleSelected(id: string) {
		setSelected((set) => {
			const next = new Set(set);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}
	function clearSelected() {
		setSelected(new Set<string>());
	}

	// Add `ids` to the selection, or remove them all if every one is already selected
	// (so the same control both selects and deselects a group).
	function toggleMany(ids: string[]) {
		if (ids.length === 0) return;
		setSelected((set) => {
			const next = new Set(set);
			const allOn = ids.every((id) => next.has(id));
			for (const id of ids) {
				if (allOn) next.delete(id);
				else next.add(id);
			}
			return next;
		});
	}

	// How a group of test ids sits in the current selection: none / some / all ticked.
	function selectionOf(ids: string[]): 'none' | 'some' | 'all' {
		if (ids.length === 0) return 'none';
		const set = selected();
		const on = ids.filter((id) => set.has(id)).length;
		if (on === 0) return 'none';
		return on === ids.length ? 'all' : 'some';
	}

	// Enqueue a run for a single test (from the row menu), then kick the poller so its
	// dot flips to Running and settles on the result on its own.
	async function runOne(id: string) {
		await trpc.runs.create.mutate({ testId: id });
		await refreshStatuses();
		startPolling();
	}

	// Enqueue a run for every ticked test, then clear the selection and start polling
	// so the just-queued dots update live without a manual reload.
	async function runSelected() {
		const ids = [...selected()];
		if (ids.length === 0 || running()) return;
		setRunning(true);
		try {
			await trpc.runs.createMany.mutate({ testIds: ids });
			clearSelected();
			await refreshStatuses();
			startPolling();
		} finally {
			setRunning(false);
		}
	}

	const childFolders = (parentId: string | null) => folders().filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
	const testsIn = (folderId: string | null) => tests().filter((t) => t.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name));

	// Search results: a flat list of tests whose name matches, ignoring folders.
	const searchHits = createMemo(() => {
		const q = query().trim().toLowerCase();
		if (!q) return null;
		return tests().filter((t) => t.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
	});

	function toggle(id: string) {
		let nowCollapsed = false;
		setCollapsed((set) => {
			const next = new Set(set);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
				nowCollapsed = true;
			}
			return next;
		});
		// Persist the new state so it survives reloads (fire-and-forget; the optimistic
		// UI update above already reflects it).
		void trpc.folders.setCollapsed.mutate({ id, collapsed: nowCollapsed });
	}
	function addFolder(parentId: string | null) {
		setPrompt({ mode: 'create', parentId });
	}
	function renameFolder(id: string, current: string) {
		setPrompt({ mode: 'rename', id, current });
	}
	async function removeFolder(id: string) {
		await trpc.folders.remove.mutate({ id });
		await refresh();
	}
	// Display props for the folder prompt, narrowed from its discriminated state.
	const promptTitle = () => {
		const p = prompt();
		if (!p) return '';
		if (p.mode === 'rename') return 'Rename folder';
		return p.parentId ? 'New subfolder' : 'New folder';
	};
	const promptInitial = () => {
		const p = prompt();
		return p?.mode === 'rename' ? p.current : '';
	};

	// Apply the open folder prompt (create or rename), then close it and refresh.
	async function submitPrompt(name: string) {
		const p = prompt();
		if (!p) return;
		if (p.mode === 'create') {
			await trpc.folders.create.mutate({ name, parentId: p.parentId });
		} else if (name !== p.current) {
			await trpc.folders.rename.mutate({ id: p.id, name });
		}
		setPrompt(null);
		await refresh();
	}
	async function moveTest(id: string, folderId: string | null) {
		await trpc.tests.move.mutate({ id, folderId });
		setTests((list) => list.map((t) => (t.id === id ? { ...t, folderId } : t)));
	}
	async function deleteTest(id: string) {
		setTests((list) => list.filter((t) => t.id !== id));
		setSelected((set) => {
			if (!set.has(id)) return set;
			const next = new Set(set);
			next.delete(id);
			return next;
		});
	}

	// A flat [id -> "A / B / C"] path label per folder, for the move menu.
	const folderPath = createMemo(() => {
		const byId = new Map(folders().map((f) => [f.id, f]));
		const label = (id: string): string => {
			const f = byId.get(id);
			if (!f) return '';
			return f.parentId ? `${label(f.parentId)} / ${f.name}` : f.name;
		};
		return folders().map((f) => ({ id: f.id, label: label(f.id) })).sort((a, b) => a.label.localeCompare(b.label));
	});

	// Every test id living under a folder, including all nested subfolders.
	function testIdsUnder(folderId: string): string[] {
		const ids = testsIn(folderId).map((t) => t.id);
		for (const sub of childFolders(folderId)) ids.push(...testIdsUnder(sub.id));
		return ids;
	}

	// The test ids currently shown, honoring an active search (which flattens folders).
	const visibleTestIds = createMemo(() => (searchHits() ?? tests()).map((t) => t.id));

	// A tri-state checkbox: checked when the whole group is selected, indeterminate
	// (a dash) when only some are, driving a select-all / select-none toggle.
	function GroupCheckbox(props: { state: 'none' | 'some' | 'all'; onToggle: () => void; label: string; class?: string }) {
		let el: HTMLInputElement | undefined;
		createEffect(() => {
			if (el) el.indeterminate = props.state === 'some';
		});
		return (
			<label class={props.class} title={props.label}>
				<input
					ref={el}
					type="checkbox"
					checked={props.state === 'all'}
					onChange={props.onToggle}
					aria-label={props.label}
				/>
			</label>
		);
	}

	function TestRow(props: { test: Test; depth: number }) {
		const checked = () => selected().has(props.test.id);
		// Tone of the last run, for the leading status dot (null = never run).
		const tone = () => (props.test.lastStatus ? runStatus(props.test.lastStatus).tone : null);
		const statusLabel = () => (props.test.lastStatus ? `Last run: ${runStatus(props.test.lastStatus).label}` : 'Not run yet');
		return (
			<li class={styles['test-item']} classList={{ [styles['selected']]: checked(), [styles['show-check']]: anySelected() }} style={{ '--depth': props.depth }}>
				<label class={styles['check']} title="Select for a batch run">
					<input type="checkbox" checked={checked()} onChange={() => toggleSelected(props.test.id)} aria-label={`Select ${props.test.name}`} />
				</label>
				<a href={`/tests/${props.test.id}`} class={styles['test-link']}>
					<span class="dot" data-tone={tone() ?? 'neutral'} classList={{ [styles['dot-empty']]: tone() === null }} title={statusLabel()} aria-label={statusLabel()} />
					<span class={styles['name']}>{props.test.name}</span>
				</a>
				<TestRowMenu
					testId={props.test.id}
					name={props.test.name}
					folderId={props.test.folderId}
					folders={folderPath()}
					onMove={(folderId) => moveTest(props.test.id, folderId)}
					onDeleted={() => deleteTest(props.test.id)}
					onRun={() => runOne(props.test.id)}
				/>
				<svg class={styles['chevron']} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="m9 18 6-6-6-6" />
				</svg>
			</li>
		);
	}

	// Recursively render a folder and everything under it.
	function FolderNode(props: { folder: Folder; depth: number }) {
		const open = () => !collapsed().has(props.folder.id);
		const subs = () => childFolders(props.folder.id);
		const own = () => testsIn(props.folder.id);
		return (
			<li class={styles['folder']}>
				<div class={styles['folder-head']} classList={{ [styles['show-check']]: anySelected() }} style={{ '--depth': props.depth }}>
					<Show when={testIdsUnder(props.folder.id).length > 0}>
						<GroupCheckbox
							class={styles['folder-check']}
							state={selectionOf(testIdsUnder(props.folder.id))}
							onToggle={() => toggleMany(testIdsUnder(props.folder.id))}
							label={`Select all in ${props.folder.name}`}
						/>
					</Show>
					<button type="button" class={styles['folder-toggle']} onClick={() => toggle(props.folder.id)} aria-expanded={open()}>
						<span class={styles['folder-caret']} classList={{ [styles['open']]: open() }}>
							<IconChevronRight size={14} />
						</span>
						<span class={styles['folder-name']}>{props.folder.name}</span>
						<span class={styles['folder-count']}>{own().length + subs().length}</span>
					</button>
					<div class={styles['folder-actions']}>
						<button type="button" title="New subfolder" aria-label="New subfolder" class={styles['icon-btn']} onClick={() => addFolder(props.folder.id)}>
							<IconPlus size={14} />
						</button>
						<button type="button" title="Rename folder" aria-label="Rename folder" class={styles['icon-btn']} onClick={() => renameFolder(props.folder.id, props.folder.name)}>
							<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
							</svg>
						</button>
						<button type="button" title="Delete folder" aria-label="Delete folder" class={`${styles['icon-btn']} ${styles['danger']}`} onClick={() => removeFolder(props.folder.id)}>
							<IconTrash size={14} />
						</button>
					</div>
				</div>
				<Show when={open()}>
					<ul class={styles['test-list']}>
						<For each={subs()}>{(f) => <FolderNode folder={f} depth={props.depth + 1} />}</For>
						<For each={own()}>{(t) => <TestRow test={t} depth={props.depth + 1} />}</For>
					</ul>
				</Show>
			</li>
		);
	}

	const isEmpty = () => tests().length === 0 && folders().length === 0;

	return (
		<div class={styles['browser']}>
			<div class={styles['toolbar']}>
				<Show when={visibleTestIds().length > 0}>
					<GroupCheckbox
						class={styles['select-all']}
						state={selectionOf(visibleTestIds())}
						onToggle={() => toggleMany(visibleTestIds())}
						label="Select all tests"
					/>
				</Show>
				<input
					type="search"
					class={styles['search']}
					placeholder="Search tests"
					value={query()}
					onInput={(e) => setQuery(e.currentTarget.value)}
				/>
				<button type="button" class={styles['new-folder']} onClick={() => addFolder(null)}>
					<IconPlus size={14} /> New folder
				</button>
			</div>

			<Show when={selected().size > 0}>
				<div class={styles['selection-bar']}>
					<span class={styles['selection-count']}>{selected().size} selected</span>
					<button type="button" class={styles['clear-sel']} onClick={clearSelected}>
						Clear
					</button>
					<button type="button" class={styles['run-sel']} disabled={running()} aria-busy={running()} onClick={runSelected}>
						<IconPlay size={13} /> {running() ? 'Starting…' : `Run ${selected().size}`}
					</button>
				</div>
			</Show>

			<Show
				when={!isEmpty()}
				fallback={
					<div class={styles['empty']}>
						<svg viewBox="0 0 32 32" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
							<path d="M16 4C11.6 4 8 7.6 8 12v13c0 .8.95 1.2 1.5.65L11.5 24l1.9 1.65a1 1 0 0 0 1.3 0L16.5 24l1.9 1.65a1 1 0 0 0 1.3 0L21.5 24l1.95 1.65c.55.55 1.55.15 1.55-.65V12c0-4.4-3.6-8-8-8z" />
							<circle cx="13" cy="13" r="1.2" fill="currentColor" stroke="none" />
							<circle cx="19" cy="13" r="1.2" fill="currentColor" stroke="none" />
						</svg>
						<p>No tests yet.</p>
						<span>Build your first one on the right. No coding needed.</span>
					</div>
				}
			>
				<Show
					when={searchHits() === null}
					fallback={
						<Show when={searchHits()!.length > 0} fallback={<p class={styles['no-hits']}>No tests match “{query()}”.</p>}>
							<ul class={styles['test-list']}>
								<For each={searchHits()!}>{(t) => <TestRow test={t} depth={0} />}</For>
							</ul>
						</Show>
					}
				>
					<ul class={styles['test-list']}>
						<For each={childFolders(null)}>{(f) => <FolderNode folder={f} depth={0} />}</For>
						<For each={testsIn(null)}>{(t) => <TestRow test={t} depth={0} />}</For>
					</ul>
				</Show>
			</Show>

			<PromptModal
				open={prompt() !== null}
				title={promptTitle()}
				label="Folder name"
				placeholder="e.g. Authentication"
				initialValue={promptInitial()}
				confirmLabel={prompt()?.mode === 'rename' ? 'Rename' : 'Create'}
				onConfirm={submitPrompt}
				onCancel={() => setPrompt(null)}
			/>
		</div>
	);
}
