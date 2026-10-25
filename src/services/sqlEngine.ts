import * as duckdb from '@duckdb/duckdb-wasm';
import { Dataset } from '../types';
import { validateSqlSafety } from './validators';

export interface ExecutionOutput {
  success: boolean;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  sanitizedSql: string;
}

let workerInstance: Worker | null = null;
let dbInstance: duckdb.AsyncDuckDB | null = null;
let connInstance: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<{ db: duckdb.AsyncDuckDB; conn: duckdb.AsyncDuckDBConnection }> | null = null;

let globalQuerySequenceId = 0;

/**
 * Cleanly terminates the active DuckDB worker and releases all resources.
 * Used for hard timeout cancellation and resetting contaminated worker states.
 */
export async function terminateDuckDBWorker(): Promise<void> {
  globalQuerySequenceId++;
  try {
    if (connInstance) {
      await connInstance.close().catch(() => {});
    }
    if (dbInstance) {
      await dbInstance.terminate().catch(() => {});
    }
  } catch {}
  if (workerInstance) {
    try {
      workerInstance.terminate();
    } catch {}
  }
  workerInstance = null;
  dbInstance = null;
  connInstance = null;
  initPromise = null;
  registeredDatasetCacheKey = null;
}

/**
 * Manually cancels the currently executing query and resets the worker generation.
 */
export async function cancelCurrentQuery(): Promise<void> {
  await terminateDuckDBWorker();
}

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
    workerInstance = worker;
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

let registeredDatasetCacheKey: string | null = null;
const DEFAULT_QUERY_TIMEOUT_MS = 15000;
const MAX_RESULT_ROWS = 5000;

export interface ExecutionOutput {
  success: boolean;
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  sanitizedSql: string;
  truncated?: boolean;
}

/**
 * Registers a dataset as an in-memory SQL table in DuckDB.
 * Uses smart caching to avoid expensive JSON serialization and re-registration on subsequent queries.
 */
export async function registerDatasetInSql(dataset: Dataset): Promise<void> {
  const currentKey = `${dataset.id}_${dataset.rowCount}_${dataset.columns.length}`;
  if (registeredDatasetCacheKey === currentKey) {
    return; // Already registered and up to date
  }

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
    registeredDatasetCacheKey = currentKey;
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
 * Executes a SELECT query safely in-memory using DuckDB with timeout and size limits.
 */
export async function executeClientSql(
  sql: string,
  dataset?: Dataset,
  timeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<ExecutionOutput> {
  const mySeqId = ++globalQuerySequenceId;
  const startTime = performance.now();
  const sanitizedSql = cleanSql(sql, dataset?.tableName);

  // Enforce strict runtime SQL security on EVERY execution path
  const safety = validateSqlSafety(sanitizedSql, dataset?.tableName);
  if (!safety.isValid) {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: `Security Guard: ${safety.errors.join(' ')}`,
      sanitizedSql,
    };
  }

  // Gracefully handle non-browser test runner environments
  if (typeof Worker === 'undefined') {
    return {
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      executionTimeMs: 0,
      error: 'Environment Notice: DuckDB-WASM Web Worker requires a browser runtime with WebAssembly support.',
      sanitizedSql,
    };
  }

  if (dataset) {
    await registerDatasetInSql(dataset);
  }

  try {
    const { conn } = await getDuckDB();

    // Enforce bounded query execution timeout
    const queryPromise = conn.query(sanitizedSql);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Query execution timed out after ${timeoutMs}ms. Consider applying tighter filters or LIMIT.`)),
        timeoutMs
      )
    );

    const result = await Promise.race([queryPromise, timeoutPromise]);
    let rows = result.toArray().map((r: any) => r.toJSON());
    const duration = Math.max(1, Math.round(performance.now() - startTime));

    // Reject stale superseded execution
    if (mySeqId !== globalQuerySequenceId) {
      return {
        success: false,
        columns: [],
        rows: [],
        rowCount: 0,
        executionTimeMs: duration,
        error: 'Query execution superseded or cancelled by newer request.',
        sanitizedSql,
      };
    }

    let truncated = false;
    if (rows.length > MAX_RESULT_ROWS) {
      rows = rows.slice(0, MAX_RESULT_ROWS);
      truncated = true;
    }

    const columnSet = new Set<string>();
    rows.forEach((r: any) => {
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
      truncated,
    };
  } catch (err: any) {
    const duration = Math.max(1, Math.round(performance.now() - startTime));
    let errorMessage = err?.message || String(err);
    
    // Hard cancellation on execution timeout
    if (errorMessage.includes('timed out after')) {
      await terminateDuckDBWorker();
      errorMessage = `Execution Timeout: ${errorMessage} Active worker was terminated to prevent memory leakage and thread lock.`;
    } else if (errorMessage.includes('Parser Error') || errorMessage.includes('syntax error')) {
      errorMessage = `SQL Syntax Error: ${errorMessage}`;
    }
    // Scrub internal worker paths or blob URLs from error message
    errorMessage = errorMessage.replace(/blob:https?:\/\/[^\s]+/g, '[sandbox_worker]');

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
