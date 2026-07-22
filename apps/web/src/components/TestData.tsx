import { createSignal, Show } from 'solid-js';
import { trpc } from '../lib/trpc';

/** Attach data-driven rows (CSV or JSON) — one run per row, columns bound to {{variables}}. */
export default function TestData(props: { testId: string; initialRows: number }) {
	const [text, setText] = createSignal('');
	const [open, setOpen] = createSignal(false);
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
		<div class="rounded-xl border border-white/10 bg-white/[0.03]">
			<button class="flex w-full items-center justify-between px-4 py-3 text-sm text-white/70" onClick={() => setOpen((v) => !v)}>
				<span class="font-medium">🗂️ Data {rows() > 0 && <span class="text-white/40">— {rows()} row(s), runs once per row</span>}</span>
				<span class="text-white/30">{open() ? '▲' : '▼'}</span>
			</button>
			<Show when={open()}>
				<div class="space-y-2 border-t border-white/10 p-4">
					<p class="text-xs text-white/40">
						Paste CSV (headers on the first row) or a JSON array. Each row runs the test once; reference a column as{' '}
						<code class="text-white/60">{'{{columnName}}'}</code>.
					</p>
					<textarea
						class="min-h-28 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-white/30"
						placeholder={'email,plan\nada@x.test,pro\ngrace@x.test,free'}
						value={text()}
						onInput={(e) => setText(e.currentTarget.value)}
					/>
					<div class="flex items-center gap-3">
						<button onClick={save} disabled={busy()} class="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50">
							{busy() ? 'Saving…' : 'Save data'}
						</button>
						<Show when={saved()}>
							<span class="text-sm text-emerald-300">Saved {rows()} row(s) ✓</span>
						</Show>
						<Show when={err()}>
							<span class="text-sm text-red-300">{err()}</span>
						</Show>
					</div>
				</div>
			</Show>
		</div>
	);
}
