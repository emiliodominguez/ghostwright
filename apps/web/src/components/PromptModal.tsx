import { createEffect, createSignal, onCleanup, Show } from 'solid-js';
import { IconClose } from './icons';
import styles from './PromptModal.module.scss';

interface Props {
	open: boolean;
	title: string;
	label?: string;
	placeholder?: string;
	initialValue?: string;
	confirmLabel?: string;
	onConfirm: (value: string) => void;
	onCancel: () => void;
}

/**
 * A small single-field prompt dialog — an in-app replacement for window.prompt, used
 * for naming/renaming folders. Autofocuses the input, submits on Enter, cancels on
 * Escape or backdrop click, and disables Confirm until the field is non-empty.
 */
export default function PromptModal(props: Props) {
	const [value, setValue] = createSignal('');
	let input: HTMLInputElement | undefined;

	// Seed the field and focus it each time the dialog opens.
	createEffect(() => {
		if (!props.open) return;
		setValue(props.initialValue ?? '');
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => {
			input?.focus();
			input?.select();
		});
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') props.onCancel();
		};
		document.addEventListener('keydown', onKey);
		onCleanup(() => {
			document.body.style.overflow = prevOverflow;
			document.removeEventListener('keydown', onKey);
		});
	});

	function submit(e: Event) {
		e.preventDefault();
		const v = value().trim();
		if (v) props.onConfirm(v);
	}

	return (
		<Show when={props.open}>
			<div
				class={styles['backdrop']}
				role="presentation"
				onClick={(e) => {
					if (e.target === e.currentTarget) props.onCancel();
				}}
			>
				<form class={styles['modal']} role="dialog" aria-modal="true" aria-label={props.title} onSubmit={submit}>
					<div class={styles['head']}>
						<h2 class={styles['title']}>{props.title}</h2>
						<button type="button" title="Close" aria-label="Close" class={styles['close']} onClick={props.onCancel}>
							<IconClose size={16} />
						</button>
					</div>
					<Show when={props.label}>
						<label class={styles['label']}>{props.label}</label>
					</Show>
					<input
						ref={input}
						type="text"
						class={styles['input']}
						placeholder={props.placeholder}
						value={value()}
						onInput={(e) => setValue(e.currentTarget.value)}
					/>
					<div class={styles['actions']}>
						<button type="button" class={styles['cancel']} onClick={props.onCancel}>
							Cancel
						</button>
						<button type="submit" class={styles['confirm']} disabled={!value().trim()}>
							{props.confirmLabel ?? 'Save'}
						</button>
					</div>
				</form>
			</div>
		</Show>
	);
}
