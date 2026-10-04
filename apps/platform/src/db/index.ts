import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import * as schema from './schema';

export type Db = ReturnType<typeof createDb>;

export function createDb(url: string) {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  return drizzle(client, { schema });
}

/** Applies the SQL migrations in `drizzle/` (generated with `pnpm db:generate`). */
export async function runMigrations(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  await migrate(drizzle(client), { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
  await client.end();
}

export { schema };
