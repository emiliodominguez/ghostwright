import { createSignal, Show, type JSX } from 'solid-js';
import { IconChevronDown } from './icons';
import styles from './panels.module.scss';

/**
 * A collapsible settings panel with an icon + title header and a chevron that
 * rotates when open. Shared chrome for the per-test config panels.
 */
export default function Panel(props: { icon: JSX.Element; title: string; subtitle?: JSX.Element; children: JSX.Element; defaultOpen?: boolean }) {
	const [open, setOpen] = createSignal(props.defaultOpen ?? false);
	return (
		<div class={styles['panel']}>
			<button type="button" class={styles['panel-head']} aria-expanded={open()} onClick={() => setOpen((v) => !v)}>
				<span class={styles['panel-title']}>
					<span class={styles['panel-icon']}>{props.icon}</span>
					{props.title}
					<Show when={props.subtitle}>
						<span class={styles['panel-subtitle']}>{props.subtitle}</span>
					</Show>
				</span>
				<IconChevronDown size={16} class={`${styles['panel-chevron']} ${open() ? styles['open'] : ''}`} />
			</button>
			<Show when={open()}>
				<div class={styles['panel-body']}>{props.children}</div>
			</Show>
		</div>
	);
}
