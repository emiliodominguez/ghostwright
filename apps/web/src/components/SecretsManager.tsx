import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import { IconKey, IconLock } from './icons';
import styles from './manager.module.scss';

type Secret = { id: string; name: string; kind: string };

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
		<div class={styles['stack']}>
			<Show when={secrets().length > 0} fallback={<p class={styles['empty']}>No secrets yet. Add a password or a 2FA seed below.</p>}>
				<ul class={styles['list']}>
					<For each={secrets()}>
						{(s) => (
							<li class={`${styles['item']} ${styles['item-row']}`}>
								<span class={styles['item-name']}>
									{s.kind === 'totp' ? <IconLock size={15} /> : <IconKey size={15} />}
									{s.name}
									<span class={styles['item-note']}>
										— use as <code>{s.kind === 'totp' ? `2-factor step, secret "${s.name}"` : `{{secret.${s.name}}}`}</code>
									</span>
								</span>
								<button type="button" class={styles['delete-link']} onClick={() => remove(s.id)}>
									delete
								</button>
							</li>
						)}
					</For>
				</ul>
			</Show>

			<div class={styles['form']}>
				<div class={styles['form-grid']}>
					<input class={styles['input']} placeholder="Name (e.g. appPassword)" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
					<select class={styles['select']} value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
						<option value="password">Password / value</option>
						<option value="totp">2-factor seed (base32)</option>
					</select>
					<input
						class={`${styles['input']} ${styles['col-span-2']}`}
						type="password"
						placeholder={kind() === 'totp' ? 'JBSWY3DPEHPK3PXP' : 'the secret value'}
						value={value()}
						onInput={(e) => setValue(e.currentTarget.value)}
					/>
				</div>
				<button type="button" onClick={add} disabled={busy()} class={styles['add-btn']}>
					{busy() ? 'Saving…' : 'Add secret'}
				</button>
				<p class={styles['hint']}>Stored encrypted (AES-256-GCM). Values are never shown again.</p>
			</div>
		</div>
	);
}
