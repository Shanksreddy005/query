import * as duckdb from '@duckdb/duckdb-wasm';
import { Dataset } from '../types';

export interface ExecutionOutput {
  success: boolean;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  sanitizedSql: string;
}

let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<{ db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection }> | null = null;

export async function getDuckDB() {
  if (dbInstance && connInstance) {
    return { db: dbInstance, conn: connInstance };
  }
  if (initPromise) {
    return initPromise;
  }
  initPromise = (async () => {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    const workerUrl = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);

    const conn = await db.connect();
    dbInstance = db;
    connInstance = conn;
    return { db, conn };
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

/**
 * Registers a dataset as an in-memory SQL table in DuckDB.
 */
export async function registerDatasetInSql(dataset: Dataset): Promise<void> {
  try {
    const { db, conn } = await getDuckDB();
    const tableName = dataset.tableName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    // Clear previous definitions
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await conn.query(`DROP TABLE IF EXISTS "dataset"`);
    } catch {}

    const jsonStr = JSON.stringify(dataset.data);
    const virtualFilename = `data_${Date.now()}.json`;
    await db.registerFileText(virtualFilename, jsonStr);

    await conn.query(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM read_json_auto('${virtualFilename}')`);
    await conn.query(`CREATE OR REPLACE TABLE "dataset" AS SELECT * FROM "${tableName}"`);
  } catch (err: any) {
    console.error('Failed to register dataset in DuckDB:', err);
  }
}

/**
 * Sanitizes and cleans AI-generated SQL query before in-memory execution.
 */
export function cleanSql(rawSql: string, activeTableName?: string): string {
  let sql = rawSql.trim();
  sql = sql.replace(/```sql/gi, '').replace(/```/g, '').trim();
  sql = sql.replace(/;+$/, '').trim();

  if (activeTableName) {
    const sanitizedName = activeTableName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    sql = sql.replace(new RegExp(`"${activeTableName}"`, 'gi'), `"${sanitizedName}"`);
    sql = sql.replace(new RegExp(`\`${activeTableName}\``, 'gi'), `"${sanitizedName}"`);
  }

  return sql;
}

/**
 * Executes a SELECT query safely in-memory using DuckDB.
 */
export async function executeClientSql(sql: string, dataset?: Dataset): Promise<ExecutionOutput> {
  const startTime = performance.now();
  const sanitizedSql = cleanSql(sql, dataset?.tableName);

  const normalized = sanitizedSql.trim().toUpperCase();
  const isSelectOrWith = normalized.startsWith('SELECT') || normalized.startsWith('WITH');

  if (!isSelectOrWith) {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: 'Security Notice: Only SELECT queries are permitted in client-side analytics mode.',
      sanitizedSql,
    };
  }

  if (dataset) {
    // If it hasn't been registered yet, this will register it.
    // However, App.tsx should ideally await registration, but we do it here too just in case.
    await registerDatasetInSql(dataset);
  }

  try {
    const { conn } = await getDuckDB();
    const result = await conn.query(sanitizedSql);
    const rows = result.toArray().map(r => r.toJSON());
    const duration = Math.max(1, Math.round(performance.now() - startTime));

    const columnSet = new Set<string>();
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => columnSet.add(k));
    });
    const columns = Array.from(columnSet);

    return {
      success: true,
      columns,
      rows,
      rowCount: rows.length,
      executionTimeMs: duration,
      sanitizedSql,
    };
  } catch (err: any) {
    const duration = Math.max(1, Math.round(performance.now() - startTime));
    let errorMessage = err?.message || String(err);
    if (errorMessage.includes('Parser Error') || errorMessage.includes('syntax error')) {
      errorMessage = `SQL Syntax Error: ${errorMessage}`;
    }
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: duration,
      error: errorMessage,
      sanitizedSql,
    };
  }
}
