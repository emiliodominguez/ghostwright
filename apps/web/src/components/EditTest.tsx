import { parseTest, type Step } from '@ghostwright/dsl';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconClose, IconPencil } from './icons';
import StepBuilder from './StepBuilder';
import controls from './controls.module.scss';
import styles from './manager.module.scss';

/**
 * "Edit" button for a test. Opens the visual step builder in a modal, preloaded
 * with the test's name and steps, so a test can be renamed and its steps changed
 * after creation (mirrors editing a login flow). Saving reloads the page so the
 * step list and everything derived from the new version refresh.
 *
 * The DSL may be passed in (test detail page, already loaded) or omitted, in which
 * case it is fetched on first open (the tests list, which doesn't carry every DSL).
 * When `iconOnly` is set the trigger is a compact icon button for dense row layouts.
 */
export default function EditTest(props: { id: string; name: string; dsl?: string | null; iconOnly?: boolean; controlledOpen?: boolean; onClose?: () => void }) {
	const [open, setOpen] = createSignal(false);
	const [dsl, setDsl] = createSignal<string | null>(props.dsl ?? null);
	const [loading, setLoading] = createSignal(false);

	// Controlled mode: no trigger button; open immediately and report closes to the
	// parent (used by the row's actions menu, which owns the "Edit" entry point).
	if (props.controlledOpen) onMount(openEditor);
	function requestClose() {
		setOpen(false);
		props.onClose?.();
	}

	function initialSteps(): Step[] {
		const d = dsl();
		if (!d) return [];
		try {
			return parseTest(JSON.parse(d)).steps;
		} catch {
			return [];
		}
	}

	async function openEditor() {
		// Lazy-load the DSL if it wasn't provided (list view).
		if (dsl() === null && props.dsl === undefined) {
			setLoading(true);
			try {
				const data = await trpc.tests.get.query({ id: props.id });
				setDsl(data?.version?.dsl ?? '');
			} catch {
				setDsl('');
			} finally {
				setLoading(false);
			}
		}
		setOpen(true);
	}

	// While open: lock body scroll and close on Escape.
	createEffect(() => {
		if (!open()) return;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') requestClose();
		};
		document.addEventListener('keydown', onKey);
		onCleanup(() => {
			document.body.style.overflow = prevOverflow;
			document.removeEventListener('keydown', onKey);
		});
	});

	function afterSave() {
		requestClose();
		window.location.reload();
	}

	return (
		<>
			<Show when={!props.controlledOpen}>
				<Show
					when={props.iconOnly}
					fallback={
						<button type="button" aria-label="Edit test" class={controls['secondary-btn']} onClick={openEditor} disabled={loading()}>
							<IconPencil size={14} />
							Edit
						</button>
					}
				>
					<button type="button" title="Edit test" aria-label="Edit test" class={styles['icon-btn']} onClick={openEditor} disabled={loading()}>
						<IconPencil size={15} />
					</button>
				</Show>
			</Show>

			<Show when={open()}>
				<div
					class={styles['modal-backdrop']}
					role="presentation"
					onClick={(e) => {
						if (e.target === e.currentTarget) requestClose();
					}}
				>
					<div class={styles['modal']} role="dialog" aria-modal="true" aria-label="Edit test">
						<div class={styles['modal-head']}>
							<h2 class={styles['editor-title']}>Edit test</h2>
							<button type="button" title="Close editor" aria-label="Close editor" class={styles['icon-btn']} onClick={requestClose}>
								<IconClose size={16} />
							</button>
						</div>
						<div class={styles['modal-body']}>
							<StepBuilder mode="test" editId={props.id} initialName={props.name} initialSteps={initialSteps()} onSaved={afterSave} stickyFooter />
						</div>
					</div>
				</div>
			</Show>
		</>
	);
}
