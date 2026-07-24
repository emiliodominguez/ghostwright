import { parseTest, type Step } from '@ghostwright/dsl';
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconClose } from './icons';
import LoginFlows from './LoginFlows';
import StepBuilder from './StepBuilder';
import styles from './manager.module.scss';

type Flow = { id: string; name: string; dsl: string };

/**
 * Owns the Logins page layout so the editor can break out of the narrow list
 * column. When a flow is being edited, its builder renders full-width above the
 * two-column split; otherwise the split shows the flow list plus the create
 * builder. Sharing editing state here is what lets the editor use the full page.
 */
export default function LoginsManager() {
	const [editingId, setEditingId] = createSignal<string | null>(null);
	const [flows, setFlows] = createSignal<Flow[]>([]);
	const [reloadKey, setReloadKey] = createSignal(0);

	onMount(loadFlows);
	async function loadFlows() {
		setFlows((await trpc.loginFlows.list.query()) as Flow[]);
	}

	function edit(id: string | null) {
		if (id) void loadFlows(); // make sure we have the latest steps to seed the editor
		setEditingId(id);
	}

	// While the modal is open: lock body scroll and close on Escape.
	createEffect(() => {
		if (!editingId()) return;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setEditingId(null);
		};
		document.addEventListener('keydown', onKey);
		onCleanup(() => {
			document.body.style.overflow = prevOverflow;
			document.removeEventListener('keydown', onKey);
		});
	});

	const editingFlow = () => flows().find((f) => f.id === editingId());
	function stepsOf(dsl: string): Step[] {
		try {
			return parseTest(JSON.parse(dsl)).steps;
		} catch {
			return [];
		}
	}

	// After a save the StepBuilder navigates to /logins, so a full reload happens;
	// this callback covers the in-place path if that ever changes.
	function afterSave() {
		setEditingId(null);
		void loadFlows();
		setReloadKey((k) => k + 1);
	}

	return (
		<>
			<Show when={editingFlow()}>
				{(f) => (
					<div
						class={styles['modal-backdrop']}
						role="presentation"
						onClick={(e) => {
							// Close only when the click is on the backdrop itself, not inside the dialog.
							if (e.target === e.currentTarget) setEditingId(null);
						}}
					>
						<div class={styles['modal']} role="dialog" aria-modal="true" aria-label="Edit login flow">
							<div class={styles['modal-head']}>
								<h2 class={styles['editor-title']}>Edit login flow</h2>
								<button type="button" title="Close editor" aria-label="Close editor" class={styles['icon-btn']} onClick={() => setEditingId(null)}>
									<IconClose size={16} />
								</button>
							</div>
							<div class={styles['modal-body']}>
								<p class={styles['edit-note']}>Editing the steps clears the captured session. Capture it again after you save.</p>
								<StepBuilder mode="login" editId={f().id} initialName={f().name} initialSteps={stepsOf(f().dsl)} onSaved={afterSave} stickyFooter />
							</div>
						</div>
					</div>
				)}
			</Show>

			<div class={styles['split']}>
				<section>
					<h2 class={styles['col-title']}>Your login flows</h2>
					<LoginFlows onEdit={edit} reloadKey={reloadKey()} />
				</section>
				<section>
					<h2 class={styles['col-title']}>Build a login flow</h2>
					<p class={styles['col-sub']}>Go to the login page, type credentials, sign in, and check that you are signed in.</p>
					<StepBuilder mode="login" />
				</section>
			</div>
		</>
	);
}
