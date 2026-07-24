import type { JSX } from 'solid-js';

interface Props {
	browser: string;
	size?: number;
	class?: string;
}

/**
 * Full-color brand logo for a browser engine (chromium, firefox, webkit). Unlike the
 * monochrome UI icons, these are multi-color marks, so they define their own colors
 * rather than using currentColor. Falls back to a neutral globe for anything unknown.
 */
export default function BrowserLogo(props: Props): JSX.Element {
	const size = () => props.size ?? 16;
	const common = () => ({ width: size(), height: size(), viewBox: '0 0 48 48', class: props.class, 'aria-hidden': true }) as const;

	switch (props.browser) {
		case 'chromium':
			return (
				<svg {...common()}>
					<circle cx="24" cy="24" r="20" fill="#fff" />
					<path d="M24 14h17.3A20 20 0 0 0 6.7 12l8.6 15A9.9 9.9 0 0 1 24 14z" fill="#ea4335" />
					<path d="M15.3 27 6.7 12A20 20 0 0 0 15 38l8.6-15A9.9 9.9 0 0 1 15.3 27z" fill="#34a853" />
					<path d="M32.7 27 24.1 42A20 20 0 0 0 41.3 14H24a9.9 9.9 0 0 1 8.7 13z" fill="#fbbc05" />
					<circle cx="24" cy="24" r="8.4" fill="#fff" />
					<circle cx="24" cy="24" r="6.7" fill="#4285f4" />
				</svg>
			);
		case 'firefox':
			return (
				<svg {...common()}>
					<circle cx="24" cy="25" r="19" fill="#ff9500" />
					<path
						d="M40 15c-1-2.6-3-5-4.6-5.9.8 1.6 1.3 3.2 1.5 4.4v.1c-1.7-4.2-4.6-5.9-6.9-9.6-.4-.6-.6-1-.9-1.6-.1-.3-.3-.5-.4-.8-.3.5-.6 1.4-.9 2.4-.5 1.5-.4 3.7.5 5.4-1.3-.2-2.4.1-3.4.9-3 2.5-2 6.6-2.5 9.7-.6 3.7-3.6 4.4-3.6 4.4.9 2.6 3 4.4 5.5 5.3-2.4-1-3.9-3.3-3.9-3.3 4.4 2.5 8.8-.2 9.4-3.5 0-.2.1-.4.1-.6.5 1.3.5 2.7.1 4a12 12 0 0 1-8.2 7.2c1.8.3 3.6.2 5.4-.3a12.7 12.7 0 0 0 8.6-8.4c1-3.3.6-6.9-.8-9.6-.3-.5.3.2 0 0z"
						fill="#ff5000"
					/>
					<path
						d="M36.9 13.6c.2 1.2.2 2.4-.1 3.6 1.5 3 1.9 6.9.9 10.3a12.7 12.7 0 0 1-8.6 8.4c-1.8.5-3.6.6-5.4.3-.2 0-.4-.1-.6-.1a13 13 0 1 1 13.4-22.8z"
						fill="none"
					/>
				</svg>
			);
		case 'webkit':
			return (
				<svg {...common()}>
					<circle cx="24" cy="24" r="20" fill="#1e88e5" />
					<path d="M24 6l3.5 12.5L40 22l-12.5 3.5L24 38l-3.5-12.5L8 22l12.5-3.5z" fill="#fff" />
					<path d="M24 12l1.8 8.2L34 22l-8.2 1.8L24 32l-1.8-8.2L14 22l8.2-1.8z" fill="#e53935" />
				</svg>
			);
		default:
			return (
				<svg {...common()} fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="24" cy="24" r="19" />
					<path d="M5 24h38M24 5c6 5 6 33 0 38M24 5c-6 5-6 33 0 38" />
				</svg>
			);
	}
}
