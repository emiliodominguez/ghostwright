import { createSignal, onMount, Show } from 'solid-js';
import styles from './ThemeToggle.module.scss';

type Theme = 'dark' | 'light';

/**
 * Header control that flips the app between the dark and light themes by setting
 * `data-theme` on the document root and persisting the choice to localStorage.
 * The no-flash script in `Layout.astro` applies the stored value before paint.
 */
export default function ThemeToggle() {
	const [theme, setTheme] = createSignal<Theme>('dark');

	onMount(() => {
		setTheme((document.documentElement.dataset.theme as Theme) || 'dark');
	});

	/** Toggle the active theme and persist it. */
	function toggle() {
		const next: Theme = theme() === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem('gw-theme', next);
		} catch {
			// Private mode / storage disabled — theme still applies for this session.
		}
		setTheme(next);
	}

	return (
		<button
			type="button"
			class={styles['toggle']}
			onClick={toggle}
			aria-label={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} theme`}
			title={`Switch to ${theme() === 'dark' ? 'light' : 'dark'} theme`}
		>
			<Show
				when={theme() === 'dark'}
				fallback={
					<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				}
			>
				<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
				</svg>
			</Show>
		</button>
	);
}
