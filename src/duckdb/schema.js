/**
 * Dynamic Schema & Sample Row Extractor
 * Inspects DuckDB-WASM tables, extracts column types, and fetches representative sample rows.
 */

/**
 * Extracts compact schema metadata and 5 representative sample rows from an active table
 * @param {Object} conn - Active DuckDB connection
 * @param {string} tableName - Name of the table to inspect
 * @returns {Promise<{ tableName: string, columns: Array<{name: string, type: string, nullable: boolean}>, sampleRows: Array<Object>, totalRows: number, columnCount: number }>}
 */
export async function extractSchema(conn, tableName) {
  if (!conn || !tableName) {
    throw new Error('Database connection and table name are required to extract schema.');
  }

  // 1. Column metadata via DESCRIBE
  const describeRes = await conn.query(`DESCRIBE "${tableName}";`);
  const describeRows = describeRes.toArray ? describeRes.toArray() : describeRes;

  const columns = describeRows.map(row => {
    const name = row.column_name || row.Field || row.name || '';
    const type = row.column_type || row.Type || row.type || 'VARCHAR';
    const nullStr = String(row.null || row.Null || row.nullable || 'YES').toUpperCase();
    const nullable = nullStr === 'YES' || nullStr === 'TRUE';

    return {
      name,
      type: String(type).toUpperCase(),
      nullable
    };
  });

  // 2. Total row count
  const countRes = await conn.query(`SELECT COUNT(*) AS total FROM "${tableName}";`);
  const countRows = countRes.toArray ? countRes.toArray() : countRes;
  const totalRows = countRows[0]?.total !== undefined ? Number(countRows[0].total) : 0;

  // 3. Representative sample rows (capped at 5)
  const sampleRes = await conn.query(`SELECT * FROM "${tableName}" LIMIT 5;`);
  const rawSampleRows = sampleRes.toArray ? sampleRes.toArray() : sampleRes;

  // Convert raw row objects / BigInt / Decimal to plain JSON-serializable primitives
  const sampleRows = rawSampleRows.map(row => {
    const plainObj = {};
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (typeof val === 'bigint') {
        plainObj[key] = Number(val);
      } else if (val instanceof Date) {
        plainObj[key] = val.toISOString().split('T')[0];
      } else {
        plainObj[key] = val;
      }
    }
    return plainObj;
  });

  return {
    tableName,
    columns,
    sampleRows,
    totalRows,
    columnCount: columns.length
  };
}
