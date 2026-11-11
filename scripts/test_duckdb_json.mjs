import { chromium } from 'playwright';

async function testDuckDBJson() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:3000');

  const result = await page.evaluate(async () => {
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
    
    // Test json registration
    const data = JSON.stringify([{ id: 1, name: 'Alice' }]);
    await db.registerFileText('test.json', data);

    let err1 = null;
    try {
      await conn.query("CREATE TABLE test AS SELECT * FROM read_json_auto('test.json')");
    } catch (e) {
      err1 = e.toString();
    }

    let err2 = null;
    let rows = null;
    try {
      // DuckDB-WASM insertJSONFromPath API:
      await conn.insertJSONFromPath('test.json', { name: 'test_table', create: true });
      const q = await conn.query('SELECT * FROM test_table');
      rows = q.toArray().map(r => r.toJSON());
    } catch (e) {
      err2 = e.toString();
    }

    return { err1, err2, rows };
  });

  console.log('Test result:', JSON.stringify(result, null, 2));
  await browser.close();
}

testDuckDBJson().catch(console.error);
