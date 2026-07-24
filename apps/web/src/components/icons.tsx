import type { JSX } from 'solid-js';
import type { Step } from '@ghostwright/dsl';

interface IconProps {
	size?: number;
	class?: string;
}

/** Shared stroke-based SVG frame — 24 grid, currentColor, rounded joins. */
function svg(children: JSX.Element, props: IconProps, fill = false): JSX.Element {
	return (
		<svg
			viewBox="0 0 24 24"
			width={props.size ?? 16}
			height={props.size ?? 16}
			fill={fill ? 'currentColor' : 'none'}
			stroke={fill ? 'none' : 'currentColor'}
			stroke-width="1.9"
			stroke-linecap="round"
			stroke-linejoin="round"
			class={props.class}
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export function IconChevronUp(p: IconProps) {
	return svg(<polyline points="18 15 12 9 6 15" />, p);
}
export function IconChevronDown(p: IconProps) {
	return svg(<polyline points="6 9 12 15 18 9" />, p);
}
export function IconChevronRight(p: IconProps) {
	return svg(<polyline points="9 18 15 12 9 6" />, p);
}
export function IconClose(p: IconProps) {
	return svg(
		<>
			<line x1="18" y1="6" x2="6" y2="18" />
			<line x1="6" y1="6" x2="18" y2="18" />
		</>,
		p,
	);
}
export function IconTrash(p: IconProps) {
	return svg(
		<>
			<polyline points="3 6 5 6 21 6" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<line x1="10" y1="11" x2="10" y2="17" />
			<line x1="14" y1="11" x2="14" y2="17" />
		</>,
		p,
	);
}
export function IconPencil(p: IconProps) {
	return svg(
		<>
			<path d="M12 20h9" />
			<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
		</>,
		p,
	);
}
export function IconPlus(p: IconProps) {
	return svg(<path d="M12 5v14M5 12h14" />, p);
}
export function IconMore(p: IconProps) {
	return svg(
		<>
			<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
			<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
			<circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
		</>,
		p,
	);
}
export function IconFolder(p: IconProps) {
	return svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, p);
}
export function IconStar(p: IconProps) {
	return svg(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />, p);
}
export function IconSparkle(p: IconProps) {
	return svg(<path d="M12 3l1.8 5.4 5.4 1.8-5.4 1.8L12 17.4l-1.8-5.4L4.8 10.2l5.4-1.8L12 3z" />, p);
}
export function IconCheck(p: IconProps) {
	return svg(<polyline points="20 6 9 17 4 12" />, p);
}
export function IconSettings(p: IconProps) {
	return svg(
		<>
			<circle cx="12" cy="12" r="3" />
			<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
		</>,
		p,
	);
}
export function IconData(p: IconProps) {
	return svg(
		<>
			<rect x="3" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="3" width="7" height="7" rx="1" />
			<rect x="14" y="14" width="7" height="7" rx="1" />
			<rect x="3" y="14" width="7" height="7" rx="1" />
		</>,
		p,
	);
}
export function IconBell(p: IconProps) {
	return svg(
		<>
			<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
			<path d="M13.73 21a2 2 0 0 1-3.46 0" />
		</>,
		p,
	);
}
export function IconPlay(p: IconProps) {
	return svg(<polygon points="6 4 20 12 6 20 6 4" />, p, true);
}
export function IconKey(p: IconProps) {
	return svg(
		<>
			<circle cx="8" cy="15" r="4" />
			<path d="M10.85 12.15 19 4" />
			<path d="M18 5l2 2" />
			<path d="M15 8l2 2" />
		</>,
		p,
	);
}
export function IconLock(p: IconProps) {
	return svg(
		<>
			<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</>,
		p,
	);
}
export function IconExternal(p: IconProps) {
	return svg(
		<>
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
			<polyline points="15 3 21 3 21 9" />
			<line x1="10" y1="14" x2="21" y2="3" />
		</>,
		p,
	);
}
export function IconCode(p: IconProps) {
	return svg(
		<>
			<polyline points="16 18 22 12 16 6" />
			<polyline points="8 6 2 12 8 18" />
		</>,
		p,
	);
}

/** SVG paths for each step type, keyed for the action palette. */
function actionGlyph(type: Step['type']): JSX.Element {
	switch (type) {
		case 'goto':
		case 'waitForLoadState':
			return (
				<>
					<circle cx="12" cy="12" r="10" />
					<line x1="2" y1="12" x2="22" y2="12" />
					<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
				</>
			);
		case 'click':
			return (
				<>
					<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
					<path d="M13 13l6 6" />
				</>
			);
		case 'fill':
			return (
				<>
					<polyline points="4 7 4 4 20 4 20 7" />
					<line x1="9" y1="20" x2="15" y2="20" />
					<line x1="12" y1="4" x2="12" y2="20" />
				</>
			);
		case 'assertVisible':
			return (
				<>
					<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
					<circle cx="12" cy="12" r="3" />
				</>
			);
		case 'assertNotVisible':
			return (
				<>
					<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
					<line x1="1" y1="1" x2="23" y2="23" />
				</>
			);
		case 'assertText':
			return (
				<>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
				</>
			);
		case 'assertNotText':
			return (
				<>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="9" y1="15" x2="15" y2="15" />
				</>
			);
		case 'assertUrl':
		case 'waitForUrl':
			return (
				<>
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
				</>
			);
		case 'aiStep':
			return <path d="M12 3l1.8 5.4 5.4 1.8-5.4 1.8L12 17.4l-1.8-5.4L4.8 10.2l5.4-1.8L12 3z" />;
		case 'screenshot':
			return (
				<>
					<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
					<circle cx="12" cy="13" r="4" />
				</>
			);
		case 'visualCheck':
			return (
				<>
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
					<circle cx="8.5" cy="8.5" r="1.5" />
					<polyline points="21 15 16 10 5 21" />
				</>
			);
		case 'select':
			return (
				<>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<polyline points="8 11 12 15 16 11" />
				</>
			);
		case 'hover':
			return (
				<>
					<rect x="6" y="3" width="12" height="18" rx="6" />
					<line x1="12" y1="7" x2="12" y2="11" />
				</>
			);
		case 'wait':
			return (
				<>
					<circle cx="12" cy="12" r="10" />
					<polyline points="12 6 12 12 16 14" />
				</>
			);
		case 'press':
			return (
				<>
					<polyline points="9 10 4 15 9 20" />
					<path d="M20 4v7a4 4 0 0 1-4 4H4" />
				</>
			);
		case 'totp':
			return (
				<>
					<circle cx="8" cy="15" r="4" />
					<path d="M10.85 12.15 19 4" />
					<path d="M18 5l2 2" />
					<path d="M15 8l2 2" />
				</>
			);
		case 'assertPresent':
			return (
				<>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</>
			);
		case 'assertNotPresent':
			return (
				<>
					<circle cx="12" cy="12" r="10" />
					<line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
				</>
			);
		case 'back':
			return (
				<>
					<line x1="19" y1="12" x2="5" y2="12" />
					<polyline points="12 19 5 12 12 5" />
				</>
			);
		case 'refresh':
			return (
				<>
					<polyline points="23 4 23 10 17 10" />
					<polyline points="1 20 1 14 7 14" />
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
				</>
			);
		case 'scroll':
			return (
				<>
					<polyline points="8 7 12 3 16 7" />
					<polyline points="8 17 12 21 16 17" />
					<line x1="12" y1="3" x2="12" y2="21" />
				</>
			);
		case 'dragAndDrop':
			return (
				<>
					<polyline points="5 9 2 12 5 15" />
					<polyline points="9 5 12 2 15 5" />
					<polyline points="15 19 12 22 9 19" />
					<polyline points="19 9 22 12 19 15" />
					<line x1="2" y1="12" x2="22" y2="12" />
					<line x1="12" y1="2" x2="12" y2="22" />
				</>
			);
		case 'upload':
			return (
				<>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</>
			);
		case 'extract':
			return (
				<>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</>
			);
		case 'extractJs':
			return (
				<>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<polyline points="10 12 8 14 10 16" />
					<polyline points="14 12 16 14 14 16" />
				</>
			);
		case 'exit':
			return (
				<>
					<circle cx="12" cy="12" r="10" />
					<rect x="9" y="9" width="6" height="6" rx="1" />
				</>
			);
		case 'setVar':
			return (
				<>
					<line x1="4" y1="9" x2="20" y2="9" />
					<line x1="4" y1="15" x2="20" y2="15" />
					<line x1="10" y1="3" x2="8" y2="21" />
					<line x1="16" y1="3" x2="14" y2="21" />
				</>
			);
		case 'execJs':
			return (
				<>
					<polyline points="4 17 10 11 4 5" />
					<line x1="12" y1="19" x2="20" y2="19" />
				</>
			);
		case 'assertJs':
			return (
				<>
					<polyline points="16 18 22 12 16 6" />
					<polyline points="8 6 2 12 8 18" />
				</>
			);
		case 'actionRef':
			return <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />;
	}
}

/** Line-icon for a given step/action type. */
export function ActionIcon(props: { type: Step['type']; size?: number; class?: string }) {
	return svg(actionGlyph(props.type), props);
}
