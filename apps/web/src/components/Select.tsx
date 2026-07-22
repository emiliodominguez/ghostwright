import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import styles from './Select.module.scss';

export interface SelectOption {
	value: string;
	label: string;
}

let uid = 0;

interface Props {
	value: string;
	onChange: (value: string) => void;
	options: SelectOption[];
	placeholder?: string;
	ariaLabel?: string;
}

/**
 * A themed, accessible dropdown that replaces the native `<select>`. The option
 * list is portalled to `<body>` so it never gets clipped by a card's overflow,
 * and it supports full keyboard navigation (arrows, Home/End, Enter, Escape).
 */
export default function Select(props: Props) {
	const id = `gw-select-${uid++}`;
	const [open, setOpen] = createSignal(false);
	const [active, setActive] = createSignal(0);
	const [rect, setRect] = createSignal<{ left: number; top: number; width: number } | null>(null);
	let trigger!: HTMLButtonElement;
	let menuEl: HTMLUListElement | undefined;

	const selectedLabel = createMemo(() => props.options.find((o) => o.value === props.value)?.label ?? '');

	function place() {
		const r = trigger.getBoundingClientRect();
		setRect({ left: r.left, top: r.bottom + 4, width: r.width });
	}
	function openMenu() {
		place();
		const i = props.options.findIndex((o) => o.value === props.value);
		setActive(i < 0 ? 0 : i);
		setOpen(true);
	}
	function closeMenu(refocus = false) {
		setOpen(false);
		if (refocus) trigger?.focus();
	}
	function choose(value: string) {
		props.onChange(value);
		closeMenu(true);
	}
	function move(delta: number) {
		const n = props.options.length;
		if (n) setActive((a) => (a + delta + n) % n);
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!open()) {
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				openMenu();
			}
			return;
		}
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				move(-1);
				break;
			case 'Home':
				e.preventDefault();
				setActive(0);
				break;
			case 'End':
				e.preventDefault();
				setActive(props.options.length - 1);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (props.options[active()]) choose(props.options[active()].value);
				break;
			case 'Escape':
				e.preventDefault();
				closeMenu(true);
				break;
			case 'Tab':
				closeMenu();
				break;
		}
	}

	// Dismiss the menu on outside interaction or any viewport change while open.
	function onDocPointer(e: PointerEvent) {
		const t = e.target as HTMLElement;
		if (trigger.contains(t) || t.closest?.(`[data-select="${id}"]`)) return;
		closeMenu();
	}
	function onViewportChange() {
		if (open()) closeMenu();
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
	// Keep the highlighted option in view during keyboard navigation.
	createEffect(() => {
		if (open()) (menuEl?.children[active()] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
	});

	return (
		<>
			<button
				ref={trigger}
				type="button"
				class={styles['trigger']}
				aria-haspopup="listbox"
				aria-expanded={open()}
				aria-label={props.ariaLabel}
				aria-activedescendant={open() ? `${id}-opt-${active()}` : undefined}
				onClick={() => (open() ? closeMenu() : openMenu())}
				onKeyDown={onKeyDown}
			>
				<span class={styles['value']} classList={{ [styles['placeholder']]: !selectedLabel() }}>
					{selectedLabel() || props.placeholder || 'Select…'}
				</span>
				<svg
					class={styles['chevron']}
					classList={{ [styles['open']]: open() }}
					viewBox="0 0 24 24"
					width="16"
					height="16"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<polyline points="6 9 12 15 18 9" />
				</svg>
			</button>
			<Show when={open() && rect()}>
				<Portal>
					<ul
						ref={menuEl}
						data-select={id}
						role="listbox"
						class={styles['menu']}
						style={{ left: `${rect()!.left}px`, top: `${rect()!.top}px`, 'min-width': `${rect()!.width}px` }}
					>
						<For each={props.options}>
							{(o, i) => (
								<li
									id={`${id}-opt-${i()}`}
									role="option"
									aria-selected={o.value === props.value}
									class={styles['option']}
									classList={{ [styles['active']]: i() === active() }}
									onPointerEnter={() => setActive(i())}
									onClick={() => choose(o.value)}
								>
									<span>{o.label}</span>
									<Show when={o.value === props.value}>
										<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<polyline points="20 6 9 17 4 12" />
										</svg>
									</Show>
								</li>
							)}
						</For>
					</ul>
				</Portal>
			</Show>
		</>
	);
}
