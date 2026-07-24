import { parseTest, type Step } from '@ghostwright/dsl';
import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { IconClose, IconPencil } from './icons';
import StepBuilder from './StepBuilder';
import styles from './manager.module.scss';

/**
 * "Edit" icon button for a saved action. Opens the visual step builder in a modal,
 * preloaded with the action's name and steps, mirroring how tests and login flows
 * are edited. Saving reloads the page so the action list reflects the new steps.
 */
export default function EditAction(props: { id: string; name: string; dsl: string }) {
	const [open, setOpen] = createSignal(false);

	function initialSteps(): Step[] {
		try {
			return parseTest(JSON.parse(props.dsl)).steps;
		} catch {
			return [];
		}
	}

	createEffect(() => {
		if (!open()) return;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};
		document.addEventListener('keydown', onKey);
		onCleanup(() => {
			document.body.style.overflow = prevOverflow;
			document.removeEventListener('keydown', onKey);
		});
	});

	function afterSave() {
		setOpen(false);
		window.location.reload();
	}

	return (
		<>
			<button type="button" title="Edit action" aria-label="Edit action" class={styles['icon-btn']} onClick={() => setOpen(true)}>
				<IconPencil size={15} />
			</button>

			<Show when={open()}>
				<div
					class={styles['modal-backdrop']}
					role="presentation"
					onClick={(e) => {
						if (e.target === e.currentTarget) setOpen(false);
					}}
				>
					<div class={styles['modal']} role="dialog" aria-modal="true" aria-label="Edit action">
						<div class={styles['modal-head']}>
							<h2 class={styles['editor-title']}>Edit action</h2>
							<button type="button" title="Close editor" aria-label="Close editor" class={styles['icon-btn']} onClick={() => setOpen(false)}>
								<IconClose size={16} />
							</button>
						</div>
						<div class={styles['modal-body']}>
							<StepBuilder mode="action" editId={props.id} initialName={props.name} initialSteps={initialSteps()} onSaved={afterSave} stickyFooter />
						</div>
					</div>
				</div>
			</Show>
		</>
	);
}
