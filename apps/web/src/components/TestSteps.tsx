import type { DescSegment } from '@ghostwright/dsl';
import { For, Show } from 'solid-js';
import Panel from './Panel';
import { segmentClass, spaceBefore } from './StepText';
import { IconCode } from './icons';
import panels from './panels.module.scss';
import styles from './TestSteps.module.scss';
import text from './StepText.module.scss';

/**
 * The test's steps as a collapsible panel, matching the Settings / Data / Alerts
 * panels above it, so a long step list no longer pushes the rest of the page far
 * down. Segments are pre-computed server-side (actions expanded) and passed in.
 */
export default function TestSteps(props: { steps: DescSegment[][] }) {
	return (
		<Panel
			icon={<IconCode size={16} />}
			title="Steps"
			subtitle={props.steps.length > 0 ? `${props.steps.length} step${props.steps.length === 1 ? '' : 's'}` : undefined}
		>
			<Show when={props.steps.length > 0} fallback={<p class={panels['hint']}>No steps.</p>}>
				<ol class={styles['steps']}>
					<For each={props.steps}>
						{(segments, i) => (
							<li class={styles['step']}>
								<span class={styles['step-num']}>{i() + 1}</span>
								<span class={text['line']}>
									<For each={segments}>
										{(seg, j) => (
											<>
												{spaceBefore(segments, j()) ? ' ' : ''}
												{segmentClass(seg.kind) ? <span class={text[segmentClass(seg.kind)]}>{seg.text}</span> : seg.text}
											</>
										)}
									</For>
								</span>
							</li>
						)}
					</For>
				</ol>
			</Show>
		</Panel>
	);
}
