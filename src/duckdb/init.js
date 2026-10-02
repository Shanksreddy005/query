/**
 * DuckDB Engine Initialization
 * Browser-native WebAssembly database using @duckdb/duckdb-wasm.
 * Seamlessly manages Web Worker instantiation, Wasm module loading, and database connections.
 */

let dbInstance = null;
let connInstance = null;
let initPromise = null;

export async function getDuckDB() {
  if (dbInstance && connInstance) {
    return { db: dbInstance, conn: connInstance };
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    // Browser environment
    if (typeof window !== 'undefined' || typeof Worker !== 'undefined') {
      const duckdb = await import('@duckdb/duckdb-wasm');
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
    } else {
      // Node.js test environment fallback
      try {
        const duckdbModule = await import('duckdb');
        const duckdb = duckdbModule.default || duckdbModule;
        const db = new duckdb.Database(':memory:');
        const conn = db.connect();

        const asyncConn = {
          query: (sql) => new Promise((resolve, reject) => {
            conn.all(sql, (err, res) => {
              if (err) return reject(err);
              resolve({
                toArray: () => res,
                schema: {
                  fields: res && res[0] ? Object.keys(res[0]).map(name => ({ name })) : []
                }
              });
            });
          }),
          close: () => new Promise(resolve => {
            conn.close();
            resolve();
          })
        };

        dbInstance = db;
        connInstance = asyncConn;
        return { db: dbInstance, conn: connInstance };
      } catch (err) {
        throw new Error(`DuckDB could not be initialized: ${err.message}`);
      }
    }
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function resetDatabase() {
  if (connInstance) {
    try {
      if (typeof connInstance.close === 'function') {
        await connInstance.close();
      }
    } catch (e) {}
    connInstance = null;
  }
  if (dbInstance) {
    try {
      if (typeof dbInstance.terminate === 'function') {
        await dbInstance.terminate();
      }
    } catch (e) {}
    dbInstance = null;
  }
}
