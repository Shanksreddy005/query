import { chromium } from 'playwright';

async function testDuckDBMethods() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));

  await page.goto('http://localhost:3000');

  const result = await page.evaluate(async () => {
    const { getDuckDB } = await import('/src/services/sqlEngine.ts');
    const { db, conn } = await getDuckDB();

    console.log('DuckDB instantiated. Testing json insertion...');
    const testData = JSON.stringify([
      { id: 1, name: 'Customer A', mrr: 120 },
      { id: 2, name: 'Customer B', mrr: 350 },
    ]);

    const filename = 'test_sample.json';
    await db.registerFileText(filename, testData);

    let errReadJson = null;
    try {
      await conn.query(`CREATE TABLE test_via_read_json AS SELECT * FROM read_json_auto('${filename}')`);
    } catch (e) {
      errReadJson = e.toString();
    }

    let errInsertJson = null;
    let rows = null;
    try {
      await conn.insertJSONFromPath(filename, { name: 'test_via_insert', create: true });
      const q = await conn.query('SELECT * FROM test_via_insert');
      rows = q.toArray().map(r => r.toJSON());
    } catch (e) {
      errInsertJson = e.toString();
    }

    return { errReadJson, errInsertJson, rows };
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  await browser.close();
}

testDuckDBMethods().catch(console.error);
