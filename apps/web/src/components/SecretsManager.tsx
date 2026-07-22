import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';

type Secret = { id: string; name: string; kind: string };

const field = 'rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-white/30';

/** Manage encrypted org secrets: passwords ({{secret.NAME}}) and TOTP seeds (for the 2FA step). */
export default function SecretsManager() {
	const [secrets, setSecrets] = createSignal<Secret[]>([]);
	const [name, setName] = createSignal('');
	const [value, setValue] = createSignal('');
	const [kind, setKind] = createSignal('password');
	const [busy, setBusy] = createSignal(false);

	onMount(refresh);
	async function refresh() {
		setSecrets((await trpc.secrets.list.query()) as Secret[]);
	}
	async function add() {
		if (!name().trim() || !value().trim()) return;
		setBusy(true);
		try {
			await trpc.secrets.create.mutate({ name: name().trim(), value: value(), kind: kind() as never });
			setName('');
			setValue('');
			await refresh();
		} finally {
			setBusy(false);
		}
	}
	async function remove(id: string) {
		await trpc.secrets.remove.mutate({ id });
		await refresh();
	}

	return (
		<div class="space-y-4">
			<Show when={secrets().length > 0} fallback={<p class="text-sm text-white/40">No secrets yet. Add a password or a 2FA seed below.</p>}>
				<ul class="space-y-2">
					<For each={secrets()}>
						{(s) => (
							<li class="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
								<span class="flex items-center gap-2">
									<span>{s.kind === 'totp' ? '🔐' : '🔑'}</span>
									<span class="font-medium">{s.name}</span>
									<span class="text-white/30">
										— use as{' '}
										<code class="text-white/50">{s.kind === 'totp' ? `2-factor step, secret "${s.name}"` : `{{secret.${s.name}}}`}</code>
									</span>
								</span>
								<button class="text-xs text-white/40 hover:text-red-300" onClick={() => remove(s.id)}>
									delete
								</button>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<div class="rounded-xl border border-white/10 bg-white/[0.03] p-4">
				<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
					<input class={field} placeholder="Name (e.g. appPassword)" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
					<select class={field} value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
						<option value="password">Password / value</option>
						<option value="totp">2-factor seed (base32)</option>
					</select>
					<input
						class={`${field} sm:col-span-2`}
						type="password"
						placeholder={kind() === 'totp' ? 'JBSWY3DPEHPK3PXP' : 'the secret value'}
						value={value()}
						onInput={(e) => setValue(e.currentTarget.value)}
					/>
				</div>
				<button onClick={add} disabled={busy()} class="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50">
					{busy() ? 'Saving…' : 'Add secret'}
				</button>
				<p class="mt-2 text-xs text-white/30">Stored encrypted (AES-256-GCM). Values are never shown again.</p>
			</div>
		</div>
	);
}
