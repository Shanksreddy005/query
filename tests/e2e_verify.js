const server = require('../server');
const assert = require('assert');

server.listen(3002, async () => {
  try {
    console.log('Testing live server on port 3002...');

    // 1. Health check
    const healthRes = await fetch('http://localhost:3002/api/health');
    const healthData = await healthRes.json();
    console.log('Healthcheck status:', healthData.status, 'Mode:', healthData.mode);
    assert.equal(healthData.status, 'ok');

    // 2. Test all 5 golden queries
    const testQueries = [
      'Show me the top 5 customers by total revenue last quarter',
      'Which Enterprise customers have churned in the last 30 days?',
      'What is the average MRR by plan tier?',
      'List customers with more than 3 orders still on a trial plan',
      'Show monthly revenue growth for the past 6 months'
    ];

    for (let i = 0; i < testQueries.length; i++) {
      const q = testQueries[i];
      const start = Date.now();
      const res = await fetch('http://localhost:3002/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
      const data = await res.json();
      console.log(`\n[Query ${i+1}] "${q}"`);
      console.log(`  - Success: ${data.success} (${Date.now() - start}ms)`);
      console.log(`  - Steps count: ${data.steps.length}`);
      console.log(`  - Badge: ${data.badgeLabel}`);
      console.log(`  - SQL clause comments: ${data.sql.includes('--')}`);
      console.log(`  - Results: ${data.results.rows.length} rows, ${data.results.columns.length} columns`);
      console.log(`  - Insight: "${data.insight.slice(0, 75)}..."`);

      assert.equal(data.success, true);
      assert.equal(data.steps.length, 6);
      assert.ok(data.sql.length > 20);
      assert.ok(data.results.rows.length > 0);
      assert.ok(data.insight.length > 20);
    }

    // 3. Test custom query with live in-memory DB execution
    const customQ = "SELECT name, plan, mrr FROM customers WHERE status = 'active' ORDER BY mrr DESC LIMIT 3";
    const customRes = await fetch('http://localhost:3002/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: customQ })
    });
    const customData = await customRes.json();
    console.log(`\n[Custom Query]: "${customQ}"`);
    console.log(`  - Live DB Execution: ${customData.results.isLiveDb}`);
    console.log(`  - Rows returned: ${customData.results.rows.length}`);
    assert.equal(customData.success, true);
    assert.equal(customData.results.isLiveDb, true);
    assert.equal(customData.results.rows.length, 3);

    // 4. Test security attack rejection
    const hackRes = await fetch('http://localhost:3002/api/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'DROP TABLE customers;' })
    });
    const hackData = await hackRes.json();
    console.log('\n[Security Attack Test]: "DROP TABLE customers;"');
    console.log(`  - Success: ${hackData.success}, Error: "${hackData.error}"`);
    assert.equal(hackData.success, false);
    assert.match(hackData.error, /Security violation/i);

    console.log('\n======================================================');
    console.log('✅ ALL END-TO-END ACCEPTANCE CRITERIA VERIFIED & PASSED');
    console.log('======================================================\n');
    server.close();
    setTimeout(() => {
      process.exit(0);
    }, 150);
  } catch (err) {
    console.error('E2E Test Failed:', err);
    server.close();
    setTimeout(() => {
      process.exit(1);
    }, 150);
  }
});
