import "server-only";

import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

const connectionString = process.env.DATABASE;

if (!connectionString) {
  throw new Error("Variável DATABASE não configurada.");
}

const databaseUrl = new URL(connectionString);
const requiresSsl = databaseUrl.searchParams.get("sslmode") === "require";

databaseUrl.searchParams.delete("sslmode");

export type DatabaseClient = Pick<PoolClient, "query">;
export type DatabaseConnection = DatabaseClient & Pick<PoolClient, "release">;

const globalForPg = globalThis as typeof globalThis & {
  __contrapistaPgPool?: Pool;
};

const pool =
  globalForPg.__contrapistaPgPool ??
  (globalForPg.__contrapistaPgPool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  }));

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}

export async function getDbClient(): Promise<DatabaseConnection> {
  return pool.connect();
}
