/**
 * CSV Ingestion & Local DuckDB Table Creator
 * Loads client-side CSV files into DuckDB-WASM virtual filesystem and creates analytical tables.
 * Data remains 100% inside browser memory.
 */

let activeTableName = null;

/**
 * Sanitizes a filename to a valid SQL identifier
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeTableName(filename) {
  if (!filename) return 'dataset';
  const base = filename.replace(/\.[^/.]+$/, '').trim().toLowerCase();
  let clean = base.replace(/[^a-z0-9_]/g, '_');
  // Avoid leading numbers or empty strings
  if (/^[0-9]/.test(clean)) {
    clean = 't_' + clean;
  }
  return clean || 'dataset';
}

/**
 * Loads a CSV file into the DuckDB virtual filesystem and instantiates an analytical table
 * @param {Object} params
 * @param {Object} params.db - AsyncDuckDB instance
 * @param {Object} params.conn - Active database connection
 * @param {File|Blob|ArrayBuffer|Uint8Array|string} params.source - The CSV data source
 * @param {string} params.filename - Original filename
 * @returns {Promise<{ tableName: string, rowCount: number }>}
 */
export async function loadCsvIntoDuckDB({ db, conn, source, filename }) {
  const tableName = sanitizeTableName(filename);
  const virtualFilename = `data_${Date.now()}.csv`;

  // Drop previous table if replacing dataset
  if (activeTableName && activeTableName !== tableName) {
    try {
      await conn.query(`DROP TABLE IF EXISTS "${activeTableName}";`);
    } catch (e) {}
  }

  // Browser FileReader or buffer handling
  if (typeof window !== 'undefined' || typeof Worker !== 'undefined') {
    let uint8Data;

    if (source instanceof Uint8Array) {
      uint8Data = source;
    } else if (source instanceof ArrayBuffer) {
      uint8Data = new Uint8Array(source);
    } else if (source instanceof Blob || (typeof File !== 'undefined' && source instanceof File)) {
      const arrayBuffer = await source.arrayBuffer();
      uint8Data = new Uint8Array(arrayBuffer);
    } else if (typeof source === 'string') {
      const encoder = new TextEncoder();
      uint8Data = encoder.encode(source);
    } else {
      throw new Error('Unsupported CSV source format. Expected File, Blob, ArrayBuffer, or string.');
    }

    if (!uint8Data || uint8Data.length === 0) {
      throw new Error('The uploaded CSV file is empty. Please provide a file with valid headers and rows.');
    }

    // Register into DuckDB virtual filesystem
    await db.registerFileBuffer(virtualFilename, uint8Data);

    // Create table using DuckDB CSV auto-detection
    await conn.query(`
      CREATE OR REPLACE TABLE "${tableName}" AS 
      SELECT * FROM read_csv_auto('${virtualFilename}', header=true);
    `);
  } else {
    // Node.js test environment
    if (typeof source === 'string' && (source.endsWith('.csv') || source.includes('/') || source.includes('\\'))) {
      const safePath = source.replace(/\\/g, '/');
      await conn.query(`
        CREATE OR REPLACE TABLE "${tableName}" AS 
        SELECT * FROM read_csv_auto('${safePath}', header=true);
      `);
    } else {
      // In-memory string in Node
      const fsMod = 'fs';
      const pathMod = 'path';
      const osMod = 'os';
      const fs = await import(/* @vite-ignore */ fsMod);
      const path = await import(/* @vite-ignore */ pathMod);
      const os = await import(/* @vite-ignore */ osMod);
      const tempPath = path.join(os.tmpdir(), `querymind_test_${Date.now()}.csv`).replace(/\\/g, '/');
      fs.writeFileSync(tempPath, typeof source === 'string' ? source : Buffer.from(source));
      await conn.query(`
        CREATE OR REPLACE TABLE "${tableName}" AS 
        SELECT * FROM read_csv_auto('${tempPath}', header=true);
      `);
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
  }

  // Verify and count rows
  const countRes = await conn.query(`SELECT COUNT(*) AS total FROM "${tableName}";`);
  const countRows = countRes.toArray ? countRes.toArray() : countRes;
  const rowCount = countRows[0]?.total !== undefined ? Number(countRows[0].total) : 0;

  activeTableName = tableName;

  return {
    tableName,
    rowCount
  };
}

/**
 * Returns the currently active table name
 * @returns {string|null}
 */
export function getActiveTableName() {
  return activeTableName;
}

/**
 * Drops the active table from DuckDB
 * @param {Object} conn
 */
export async function clearActiveDataset(conn) {
  if (activeTableName && conn) {
    try {
      await conn.query(`DROP TABLE IF EXISTS "${activeTableName}";`);
    } catch (e) {}
  }
  activeTableName = null;
}
