import type { Step } from '@ghostwright/dsl';
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { ACTION_GROUPS } from '../lib/stepActions';
import { ActionIcon, IconPlus } from './icons';
import styles from './AddStepMenu.module.scss';

/**
 * A single "Add step" button that opens a searchable, categorized chooser. Picking
 * an action appends it and closes the menu, so the new step appears right where the
 * button sits — no scrolling to a distant palette and back.
 */
export default function AddStepMenu(props: { onPick: (make: () => Step) => void }) {
	const [open, setOpen] = createSignal(false);
	const [query, setQuery] = createSignal('');
	const [active, setActive] = createSignal(0);
	const [box, setBox] = createSignal<{ left: number; top: number; width: number; below: boolean; max: number } | null>(null);
	let trigger!: HTMLButtonElement;
	let input: HTMLInputElement | undefined;
	let list: HTMLDivElement | undefined;

	// Groups filtered by the search query; empty groups are dropped.
	const groups = createMemo(() => {
		const q = query().trim().toLowerCase();
		if (!q) return ACTION_GROUPS;
		return ACTION_GROUPS.map((g) => ({ category: g.category, actions: g.actions.filter((a) => a.label.toLowerCase().includes(q)) })).filter((g) => g.actions.length);
	});
	const flat = createMemo(() => groups().flatMap((g) => g.actions));

	function place() {
		const r = trigger.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom - 16;
		const spaceAbove = r.top - 16;
		const below = spaceBelow > 320 || spaceBelow >= spaceAbove;
		setBox({ left: r.left, top: below ? r.bottom + 6 : r.top - 6, width: Math.max(r.width, 320), below, max: Math.min(440, below ? spaceBelow : spaceAbove) });
	}
	function openMenu() {
		place();
		setQuery('');
		setActive(0);
		setOpen(true);
		setTimeout(() => input?.focus(), 0);
	}
	function close(refocus = false) {
		setOpen(false);
		if (refocus) trigger?.focus();
	}
	function pick(make: () => Step) {
		props.onPick(make);
		close(true);
	}
	function move(delta: number) {
		const n = flat().length;
		if (n) setActive((a) => (a + delta + n) % n);
	}

	function onKeyDown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				move(-1);
				break;
			case 'Enter': {
				e.preventDefault();
				const a = flat()[active()];
				if (a) pick(a.make);
				break;
			}
			case 'Escape':
				e.preventDefault();
				close(true);
				break;
		}
	}

	// Keep the highlighted row in view.
	createEffect(() => {
		if (open()) (list?.querySelector('[data-active="true"]') as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
	});

	function onDocPointer(e: PointerEvent) {
		const t = e.target as HTMLElement;
		if (trigger.contains(t) || t.closest?.('[data-addstep-menu]')) return;
		close();
	}
	function onViewportChange() {
		if (open()) close();
	}
	createEffect(() => {
		if (!open()) return;
		document.addEventListener('pointerdown', onDocPointer, true);
		window.addEventListener('resize', onViewportChange);
		window.addEventListener('scroll', onViewportChange, true);
		onCleanup(() => {
			document.removeEventListener('pointerdown', onDocPointer, true);
			window.removeEventListener('resize', onViewportChange);
			window.removeEventListener('scroll', onViewportChange, true);
		});
	});

	return (
		<>
			<button ref={trigger} type="button" class={styles['add-btn']} aria-haspopup="menu" aria-expanded={open()} onClick={() => (open() ? close() : openMenu())}>
				<IconPlus size={16} />
				Add step
			</button>
			<Show when={open() && box()}>
				<Portal>
					<div
						data-addstep-menu
						class={styles['menu']}
						classList={{ [styles['above']]: !box()!.below }}
						style={{ left: `${box()!.left}px`, top: `${box()!.top}px`, width: `${box()!.width}px`, 'max-height': `${box()!.max}px` }}
					>
						<div class={styles['search']}>
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<circle cx="11" cy="11" r="8" />
								<line x1="21" y1="21" x2="16.65" y2="16.65" />
							</svg>
							<input
								ref={input}
								value={query()}
								placeholder="Search actions…"
								aria-label="Search actions"
								onInput={(e) => {
									setQuery(e.currentTarget.value);
									setActive(0);
								}}
								onKeyDown={onKeyDown}
							/>
						</div>
						<div ref={list} class={styles['list']} role="menu">
							<Show when={flat().length > 0} fallback={<p class={styles['empty']}>No actions match “{query()}”.</p>}>
								<For each={groups()}>
									{(g) => {
										const startIndex = () => flat().findIndex((a) => a === g.actions[0]);
										return (
											<div class={styles['group']}>
												<span class={styles['group-label']}>{g.category}</span>
												<For each={g.actions}>
													{(a, i) => {
														const idx = () => startIndex() + i();
														return (
															<button
																type="button"
																role="menuitem"
																class={styles['row']}
																data-active={idx() === active()}
																onPointerEnter={() => setActive(idx())}
																onClick={() => pick(a.make)}
															>
																<span class={styles['row-icon']}>
																	<ActionIcon type={a.type} size={16} />
																</span>
																{a.label}
															</button>
														);
													}}
												</For>
											</div>
										);
									}}
								</For>
							</Show>
						</div>
					</div>
				</Portal>
			</Show>
		</>
	);
}
