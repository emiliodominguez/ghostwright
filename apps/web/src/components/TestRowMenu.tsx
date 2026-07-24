import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { trpc } from '../lib/trpc';
import EditTest from './EditTest';
import { IconFolder, IconMore, IconPencil, IconPlay, IconTrash } from './icons';
import styles from './TestRowMenu.module.scss';

interface Props {
	testId: string;
	name: string;
	folderId: string | null;
	folders: { id: string; label: string }[];
	onMove: (folderId: string | null) => void;
	onDeleted: () => void;
	onRun: () => void | Promise<void>;
}

let uid = 0;

/**
 * A single "⋯" trigger opening a small popover of row actions (Edit, Move to folder,
 * Delete) — so a test row stays uncluttered instead of showing three controls inline.
 * The menu is portalled to <body> (never clipped) and dismisses on outside click.
 */
export default function TestRowMenu(props: Props) {
	const id = `test-menu-${uid++}`;
	const [open, setOpen] = createSignal(false);
	const [view, setView] = createSignal<'root' | 'move' | 'confirm-delete'>('root');
	const [editOpen, setEditOpen] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [rect, setRect] = createSignal<{ right: number; top: number } | null>(null);
	let trigger!: HTMLButtonElement;

	function place() {
		const r = trigger.getBoundingClientRect();
		setRect({ right: window.innerWidth - r.right, top: r.bottom + 6 });
	}
	function openMenu() {
		place();
		setView('root');
		setOpen(true);
	}
	function close() {
		setOpen(false);
	}

	function onDocPointer(e: PointerEvent) {
		const t = e.target as HTMLElement;
		if (trigger.contains(t) || t.closest?.(`[data-test-menu="${id}"]`)) return;
		close();
	}
	function onViewportChange(e?: Event) {
		// Ignore scrolling within the menu itself (e.g. the folder list); only a
		// background scroll or a resize should dismiss the popover.
		const t = e?.target;
		if (t instanceof HTMLElement && t.closest(`[data-test-menu="${id}"]`)) return;
		if (open()) close();
	}
	createEffect(() => {
		if (!open()) return;
		document.addEventListener('pointerdown', onDocPointer, true);
		window.addEventListener('resize', onViewportChange);
		window.addEventListener('scroll', onViewportChange, true);
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
		document.addEventListener('keydown', onKey);
		onCleanup(() => {
			document.removeEventListener('pointerdown', onDocPointer, true);
			window.removeEventListener('resize', onViewportChange);
			window.removeEventListener('scroll', onViewportChange, true);
			document.removeEventListener('keydown', onKey);
		});
	});

	function move(folderId: string | null) {
		props.onMove(folderId);
		close();
	}
	async function run() {
		close();
		await props.onRun();
	}
	async function remove() {
		setBusy(true);
		try {
			await trpc.tests.remove.mutate({ id: props.testId });
			props.onDeleted();
			close();
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<button
				ref={trigger}
				type="button"
				class={styles['trigger']}
				title="Test actions"
				aria-label="Test actions"
				aria-haspopup="menu"
				aria-expanded={open()}
				onClick={(e) => {
					e.preventDefault();
					if (open()) close();
					else openMenu();
				}}
			>
				<IconMore size={16} />
			</button>

			<Show when={open() && rect()}>
				<Portal>
					<div data-test-menu={id} class={styles['menu']} role="menu" style={{ right: `${rect()!.right}px`, top: `${rect()!.top}px` }}>
						<Show when={view() === 'root'}>
							<button type="button" class={styles['item']} role="menuitem" onClick={run}>
								<IconPlay size={15} /> Run now
							</button>
							<button type="button" class={styles['item']} role="menuitem" onClick={() => { setEditOpen(true); close(); }}>
								<IconPencil size={15} /> Edit
							</button>
							<button type="button" class={styles['item']} role="menuitem" onClick={() => setView('move')}>
								<IconFolder size={15} /> Move to folder
								<span class={styles['chev']}>›</span>
							</button>
							<div class={styles['divider']} />
							<button type="button" class={`${styles['item']} ${styles['danger']}`} role="menuitem" onClick={() => setView('confirm-delete')}>
								<IconTrash size={15} /> Delete
							</button>
						</Show>

						<Show when={view() === 'move'}>
							<button type="button" class={styles['back']} onClick={() => setView('root')}>‹ Move to folder</button>
							<div class={styles['scroll']}>
								<button type="button" class={styles['item']} classList={{ [styles['current']]: props.folderId === null }} onClick={() => move(null)}>
									Unfiled
								</button>
								<For each={props.folders}>
									{(f) => (
										<button type="button" class={styles['item']} classList={{ [styles['current']]: props.folderId === f.id }} onClick={() => move(f.id)}>
											{f.label}
										</button>
									)}
								</For>
							</div>
						</Show>

						<Show when={view() === 'confirm-delete'}>
							<p class={styles['confirm-text']}>Delete “{props.name}”? This removes its runs and history.</p>
							<div class={styles['confirm-row']}>
								<button type="button" class={styles['confirm-yes']} disabled={busy()} onClick={remove}>
									{busy() ? 'Deleting…' : 'Yes, Delete'}
								</button>
								<button type="button" class={styles['cancel']} onClick={() => setView('root')}>Cancel</button>
							</div>
						</Show>
					</div>
				</Portal>
			</Show>

			{/* The editor modal is driven by the menu's Edit item but lives outside the popover. */}
			<Show when={editOpen()}>
				<EditTest id={props.testId} name={props.name} controlledOpen onClose={() => setEditOpen(false)} />
			</Show>
		</>
	);
}
