import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { client, db } from './client';

async function main() {
	// libSQL/sqld storage is WAL-based already; harmless on a file: fallback, ignored by the server.
	try {
		await client.execute('PRAGMA journal_mode=WAL;');
	} catch {
		// server-managed storage — pragma not applicable
	}

	const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
	await migrate(db, { migrationsFolder });
	console.log('migrations applied from', migrationsFolder);
	client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
