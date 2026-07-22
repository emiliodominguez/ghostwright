import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import Panel from './Panel';
import { IconCheck, IconData } from './icons';
import styles from './panels.module.scss';

/** Attach data-driven rows (CSV or JSON) — one run per row, columns bound to {{variables}}. */
export default function TestData(props: { testId: string; initialRows: number }) {
	const [text, setText] = createSignal('');
	const [busy, setBusy] = createSignal(false);
	const [rows, setRows] = createSignal(props.initialRows);
	const [saved, setSaved] = createSignal(false);
	const [err, setErr] = createSignal('');

	async function save() {
		setBusy(true);
		setErr('');
		try {
			const res = await trpc.tests.setData.mutate({ id: props.testId, text: text() });
			setRows(res.rows);
			setSaved(true);
			setTimeout(() => setSaved(false), 3000);
		} catch (e) {
			setErr(e instanceof Error ? e.message : 'Could not save data.');
		} finally {
			setBusy(false);
		}
	}

	return (
		<Panel icon={<IconData size={16} />} title="Data" subtitle={rows() > 0 ? `${rows()} row(s), runs once per row` : undefined}>
			<div class={styles['field-group']} style={{ gap: '0.5rem' }}>
				<p class={styles['hint']}>
					Paste CSV (headers on the first row) or a JSON array. Each row runs the test once; reference a column as <code>{'{{columnName}}'}</code>.
				</p>
				<textarea
					class={styles['textarea']}
					placeholder={'email,plan\nada@x.test,pro\ngrace@x.test,free'}
					value={text()}
					onInput={(e) => setText(e.currentTarget.value)}
				/>
				<div class={styles['actions']}>
					<button type="button" onClick={save} disabled={busy()} class={styles['save-btn']}>
						{busy() ? 'Saving…' : 'Save data'}
					</button>
					<Show when={saved()}>
						<span class={styles['saved']}>
							<IconCheck size={14} /> Saved {rows()} row(s)
						</span>
					</Show>
					<Show when={err()}>
						<span class={styles['hint']} style={{ color: 'var(--danger-text)' }}>
							{err()}
						</span>
					</Show>
				</div>
			</div>
		</Panel>
	);
}
