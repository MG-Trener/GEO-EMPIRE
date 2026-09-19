import pg from 'pg';

const { Pool } = pg;

const rawConnectionString = process.env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DATABASE_URL is required');
}

function normalizeConnectionString(value: string): string {
  try {
    const url = new URL(value);
    const sslMode = url.searchParams.get('sslmode');

    if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
      url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
  } catch {
    // Keep the original value for non-URL libpq-style connection strings.
    return value;
  }
}

const connectionString = normalizeConnectionString(rawConnectionString);

export const db = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function closeDatabase(): Promise<void> {
  await db.end();
}
