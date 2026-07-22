import { minimalSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, placeholder as cmPlaceholder } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting, bracketMatching, indentOnInput } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { tags as t } from '@lezer/highlight';
import { createEffect, onCleanup, onMount } from 'solid-js';
import styles from './CodeEditor.module.scss';

// Editor chrome — all colors reference the design-system CSS custom properties,
// so a single `data-theme` flip re-themes the editor along with the rest of the app.
const cmTheme = EditorView.theme({
	'&': { color: 'var(--text)', backgroundColor: 'transparent', fontSize: '12.5px' },
	'&.cm-focused': { outline: 'none' },
	'.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', minHeight: 'var(--cm-min-height, 3.5rem)' },
	'.cm-content': { padding: '10px 0', caretColor: 'var(--accent)' },
	'.cm-line': { padding: '0 14px' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
	'.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-faint)', border: 'none' },
	'.cm-placeholder': { color: 'var(--text-faint)' },
	'.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
});

const cmHighlight = HighlightStyle.define([
	{ tag: [t.keyword, t.moduleKeyword, t.controlKeyword, t.operatorKeyword], color: 'var(--code-keyword)' },
	{ tag: [t.string, t.special(t.string), t.regexp], color: 'var(--code-string)' },
	{ tag: [t.number, t.bool, t.null], color: 'var(--code-number)' },
	{ tag: [t.lineComment, t.blockComment, t.comment], color: 'var(--code-comment)', fontStyle: 'italic' },
	{ tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: 'var(--code-func)' },
	{ tag: [t.typeName, t.className, t.namespace], color: 'var(--code-func)' },
	{ tag: [t.variableName, t.propertyName, t.attributeName], color: 'var(--code-var)' },
	{ tag: [t.operator, t.punctuation, t.separator, t.bracket, t.brace, t.paren], color: 'var(--code-punct)' },
]);

interface Props {
	value: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	readOnly?: boolean;
	minHeight?: string;
}

/**
 * A real embedded code editor (CodeMirror 6) with JS syntax highlighting, themed
 * from the design-system tokens. Used for custom-code steps and the generated-code
 * preview so developers can read and edit code comfortably.
 */
export default function CodeEditor(props: Props) {
	let host!: HTMLDivElement;
	let view: EditorView | undefined;

	onMount(() => {
		view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: props.value ?? '',
				extensions: [
					minimalSetup,
					javascript(),
					syntaxHighlighting(cmHighlight),
					bracketMatching(),
					indentOnInput(),
					EditorView.lineWrapping,
					cmTheme,
					cmPlaceholder(props.placeholder ?? ''),
					EditorState.readOnly.of(Boolean(props.readOnly)),
					EditorView.editable.of(!props.readOnly),
					EditorView.updateListener.of((u) => {
						if (u.docChanged) props.onChange?.(u.state.doc.toString());
					}),
				],
			}),
		});
	});

	onCleanup(() => view?.destroy());

	// Keep the editor in sync when the value changes from outside (e.g. generated code).
	createEffect(() => {
		const next = props.value ?? '';
		if (view && next !== view.state.doc.toString()) {
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		}
	});

	return (
		<div
			ref={host}
			class={styles['editor']}
			classList={{ [styles['read-only']]: Boolean(props.readOnly) }}
			style={{ '--cm-min-height': props.minHeight ?? '3.5rem' }}
		/>
	);
}
