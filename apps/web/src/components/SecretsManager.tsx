import { createSignal, For, onMount, Show } from 'solid-js';
import { trpc } from '../lib/trpc';
import Select from './Select';
import { IconKey, IconLock, IconTrash } from './icons';
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
		<div class={styles['split']}>
			<section>
				<h2 class={styles['col-title']}>Your secrets</h2>
				<Show when={secrets().length > 0} fallback={<p class={styles['empty']}>No secrets yet. Add a password or a 2FA seed on the right.</p>}>
					<ul class={styles['list']}>
						<For each={secrets()}>
							{(s) => (
								<li class={`${styles['item']} ${styles['secret']}`}>
									<div class={styles['secret-head']}>
										<span class={styles['item-name']}>
											{s.kind === 'totp' ? <IconLock size={15} /> : <IconKey size={15} />}
											{s.name}
										</span>
										<button type="button" title="Delete secret" aria-label="Delete secret" class={`${styles['icon-btn']} ${styles['danger']}`} onClick={() => remove(s.id)}>
											<IconTrash size={15} />
										</button>
									</div>
									<p class={styles['secret-use']}>
										Use as <code>{s.kind === 'totp' ? `2-factor step, secret "${s.name}"` : `{{secret.${s.name}}}`}</code>
									</p>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>

			<section>
				<h2 class={styles['col-title']}>Add a secret</h2>
				<p class={styles['col-sub']}>A password or value to reference in tests, or a 2-factor seed for the 2FA step.</p>
				<div class={styles['form']}>
					<div class={styles['form-grid']}>
						<input class={styles['input']} placeholder="Name (e.g. appPassword)" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
						<div class={styles['kind-select']}>
							<Select
								value={kind()}
								onChange={setKind}
								ariaLabel="Secret type"
								options={[
									{ value: 'password', label: 'Password / value' },
									{ value: 'totp', label: '2-factor seed (base32)' },
								]}
							/>
						</div>
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
			</section>
		</div>
	);
}
