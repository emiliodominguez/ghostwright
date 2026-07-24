import { describeSegments, type DescSegment, type Step } from '@ghostwright/dsl';
import { For } from 'solid-js';
import styles from './StepText.module.scss';

/**
 * Render a step's plain-English description with each part styled by kind:
 * user-supplied values, selectors/code, URLs, and disambiguators each get their
 * own treatment so a long step reads at a glance (and raw backticks/quotes never
 * show through). Segments are the single source of truth, shared with the .astro
 * pages via `segmentClass`.
 */
export default function StepText(props: { step: Step }) {
	return (
		<span class={styles['line']}>
			<For each={describeSegments(props.step)}>
				{(seg, i) => (
					<>
						{spaceBefore(describeSegments(props.step), i()) ? ' ' : ''}
						<Segment seg={seg} />
					</>
				)}
			</For>
		</span>
	);
}

function Segment(props: { seg: DescSegment }) {
	const cls = segmentClass(props.seg.kind);
	return cls ? <span class={styles[cls]}>{props.seg.text}</span> : <>{props.seg.text}</>;
}

/** True when a space should precede segment `i` (not the first, and not a bare comma). */
export function spaceBefore(segs: DescSegment[], i: number): boolean {
	if (i === 0) return false;
	return segs[i]?.text !== ',';
}

/** Map a segment kind to its style-module class name (or '' for plain text). */
export function segmentClass(kind: DescSegment['kind']): string {
	switch (kind) {
		case 'value':
			return 'value';
		case 'code':
			return 'code';
		case 'url':
			return 'url';
		case 'nth':
			return 'nth';
		default:
			return '';
	}
}
