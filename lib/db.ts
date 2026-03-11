import { Pool } from "pg";

// Reuse a single pool across hot-reloads in dev
const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export const db =
	globalForPg._pgPool ??
	new Pool({
		connectionString: process.env.DATABASE_URL,
		// Supabase pooler works with SSL but doesn't require it for the transaction pooler
		ssl: { rejectUnauthorized: false },
		max: 5,
	});

if (process.env.NODE_ENV !== "production") {
	globalForPg._pgPool = db;
}
