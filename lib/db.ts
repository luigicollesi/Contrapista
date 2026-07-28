import { Pool } from "pg";

const connectionString = process.env.DATABASE;

if (!connectionString) {
  throw new Error("Variavel DATABASE nao configurada.");
}

const databaseUrl = new URL(connectionString);
const requiresSsl = databaseUrl.searchParams.get("sslmode") === "require";

databaseUrl.searchParams.delete("sslmode");

const globalForPg = globalThis as typeof globalThis & {
  __scotlandYardPgPool?: Pool;
};

export const pool =
  globalForPg.__scotlandYardPgPool ??
  (globalForPg.__scotlandYardPgPool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  }));
