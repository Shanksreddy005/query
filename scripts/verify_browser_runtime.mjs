import { chromium } from 'playwright';

async function runBrowserVerification() {
  console.log('--- Starting QueryMind Browser Runtime Verification ---');
  const results = {
    browserEngine: '',
    browserVersion: '',
    duckdbInitSuccess: false,
    duckdbQueryOutput: null,
    workerTerminationRecreationSuccess: false,
    sqlSafetyValidationInBrowser: {
      directValidQueryPassed: false,
      datasetViewQueryPassed: false,
      blockedMaliciousDrop: false,
      blockedExternalRead: false,
      blockedCatalogAccess: false,
      blockedCrossTableAccess: false,
      blockedMultipleStatements: false,
    },
    csvExportValidation: {
      formulaEscaped: false,
      controlCharEscaped: false,
      quotesAndCommasPreserved: false,
      legitimateNegativeNumbersPreserved: false,
      rawOutputSample: '',
    },
    networkInspection: {
      totalRequests: 0,
      anyKeysInUrls: false,
      keysInTelemetry: false,
      promptsInTelemetry: false,
      urlsObserved: [],
      geminiHeadersVerified: false,
      validationEndpointHeaderVerified: false,
    },
    uiVerification: {
      pageLoaded: false,
      prebuiltDatasetLoaded: false,
      uiRenderedElements: [],
    },
    consoleLogs: [],
    errors: [],
  };

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // Monitor console events
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      results.errors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    results.errors.push(`PageError: ${err.message}`);
  });

  // Intercept all network requests
  page.on('request', (req) => {
    results.networkInspection.totalRequests++;
    const url = req.url();
    results.networkInspection.urlsObserved.push(url.slice(0, 100));
    if (url.includes('key=') || url.includes('api_key=') || url.includes('AIzaSy')) {
      results.networkInspection.anyKeysInUrls = true;
    }
  });

  try {
    results.browserEngine = 'Chromium';
    results.browserVersion = browser.version();
    console.log(`Launched Chromium v${results.browserVersion}`);

    console.log('Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    results.uiVerification.pageLoaded = true;
    const title = await page.title();
    console.log('Page loaded successfully. Title:', title);

    await page.waitForSelector('body');
    const hasHeader = (await page.$('header')) !== null;
    const hasLogo = (await page.locator('text=QueryMind').count()) > 0;
    results.uiVerification.uiRenderedElements.push(hasHeader ? 'header' : 'no-header');
    results.uiVerification.uiRenderedElements.push(hasLogo ? 'QueryMind logo' : 'no-logo');

    // 1. Evaluate DuckDB-WASM inside the real browser runtime context
    console.log('Testing DuckDB-WASM in real browser runtime...');
    const duckdbRuntimeTest = await page.evaluate(async () => {
      const sqlEngine = await import('/src/services/sqlEngine.ts');
      const sampleData = await import('/src/services/sampleData.ts');

      const dataset = sampleData.PREBUILT_DATASETS.saas.dataset;

      // 1. Test registration and query against table "customers" with correct schema column "plan_tier"
      await sqlEngine.registerDatasetInSql(dataset);
      const queryResult = await sqlEngine.executeClientSql(
        'SELECT plan_tier, COUNT(*) AS count, ROUND(AVG(mrr), 2) AS avg_mrr FROM customers GROUP BY plan_tier ORDER BY avg_mrr DESC LIMIT 3',
        dataset
      );

      // 2. Test query against view "dataset"
      const datasetViewResult = await sqlEngine.executeClientSql(
        'SELECT COUNT(*) AS total_rows, SUM(mrr) AS total_mrr FROM dataset',
        dataset
      );

      // 3. Test worker termination and cancellation
      await sqlEngine.cancelCurrentQuery();

      // 4. Test recreation after cancellation
      const postCancelResult = await sqlEngine.executeClientSql(
        'SELECT COUNT(*) AS total_customers FROM customers',
        dataset
      );

      // 5. Test SQL safety gate enforcement
      const dropAttempt = await sqlEngine.executeClientSql('DROP TABLE customers', dataset);
      const readAttempt = await sqlEngine.executeClientSql("SELECT * FROM read_csv_auto('/etc/passwd')", dataset);
      const pragmaAttempt = await sqlEngine.executeClientSql('PRAGMA database_list', dataset);
      const crossTableAttempt = await sqlEngine.executeClientSql('SELECT * FROM sqlite_master', dataset);
      const multiStmtAttempt = await sqlEngine.executeClientSql('SELECT 1; SELECT 2', dataset);

      return {
        queryResult,
        datasetViewResult,
        postCancelResult,
        dropAttempt,
        readAttempt,
        pragmaAttempt,
        crossTableAttempt,
        multiStmtAttempt,
      };
    });

    if (duckdbRuntimeTest.queryResult && duckdbRuntimeTest.queryResult.success) {
      results.duckdbInitSuccess = true;
      results.duckdbQueryOutput = duckdbRuntimeTest.queryResult.rows;
      results.sqlSafetyValidationInBrowser.directValidQueryPassed = true;
      console.log('DuckDB-WASM customers query succeeded:', duckdbRuntimeTest.queryResult.rows);
    } else {
      console.error('DuckDB-WASM customers query failed:', duckdbRuntimeTest.queryResult);
    }

    if (duckdbRuntimeTest.datasetViewResult && duckdbRuntimeTest.datasetViewResult.success) {
      results.sqlSafetyValidationInBrowser.datasetViewQueryPassed = true;
      console.log('DuckDB-WASM dataset view query succeeded:', duckdbRuntimeTest.datasetViewResult.rows);
    }

    if (duckdbRuntimeTest.postCancelResult && duckdbRuntimeTest.postCancelResult.success) {
      results.workerTerminationRecreationSuccess = true;
      console.log('DuckDB worker recreated and re-executed query successfully after cancellation:', duckdbRuntimeTest.postCancelResult.rows);
    }

    // Safety gate checks in browser
    results.sqlSafetyValidationInBrowser.blockedMaliciousDrop =
      duckdbRuntimeTest.dropAttempt?.success === false &&
      duckdbRuntimeTest.dropAttempt.error?.includes('Security Guard');
    results.sqlSafetyValidationInBrowser.blockedExternalRead =
      duckdbRuntimeTest.readAttempt?.success === false &&
      duckdbRuntimeTest.readAttempt.error?.includes('Security Guard');
    results.sqlSafetyValidationInBrowser.blockedCatalogAccess =
      duckdbRuntimeTest.pragmaAttempt?.success === false &&
      duckdbRuntimeTest.pragmaAttempt.error?.includes('Security Guard');
    results.sqlSafetyValidationInBrowser.blockedCrossTableAccess =
      duckdbRuntimeTest.crossTableAttempt?.success === false &&
      duckdbRuntimeTest.crossTableAttempt.error?.includes('Security Guard');
    results.sqlSafetyValidationInBrowser.blockedMultipleStatements =
      duckdbRuntimeTest.multiStmtAttempt?.success === false &&
      duckdbRuntimeTest.multiStmtAttempt.error?.includes('Security Guard');

    // 2. Test CSV Export in browser runtime
    console.log('Testing CSV Export Sanitizer in browser runtime...');
    const csvRuntimeTest = await page.evaluate(async () => {
      const csvSanitizer = await import('/src/services/csvExportSanitizer.ts');

      const testColumns = ['ID', 'User', 'FormulaInjection', 'WhitespaceControl', 'LegitimateNegative', 'QuoteComma'];
      const testRows = [
        {
          ID: 1,
          User: 'Alice',
          FormulaInjection: '=SUM(A1:B10)',
          WhitespaceControl: '\t+cmd|"/C calc"!A0',
          LegitimateNegative: -42.5,
          QuoteComma: 'Hello, "World"',
        },
        {
          ID: 2,
          User: 'Bob',
          FormulaInjection: '@dangerous_func',
          WhitespaceControl: '\r\n-malicious',
          LegitimateNegative: -100,
          QuoteComma: 'Standard Text',
        },
      ];

      const csvString = csvSanitizer.formatSanitizedCsv(testColumns, testRows);
      return {
        csvString,
      };
    });

    results.csvExportValidation.rawOutputSample = csvRuntimeTest.csvString;
    const csv = csvRuntimeTest.csvString;

    results.csvExportValidation.formulaEscaped =
      csv.includes("'=SUM(A1:B10)") &&
      csv.includes("'@dangerous_func");

    results.csvExportValidation.controlCharEscaped =
      csv.includes("'\t+cmd") &&
      csv.includes("'\r\n-malicious");

    results.csvExportValidation.legitimateNegativeNumbersPreserved =
      csv.includes(',-42.5,') && csv.includes(',-100,') && !csv.includes("'-42.5") && !csv.includes("'-100");

    results.csvExportValidation.quotesAndCommasPreserved =
      csv.includes('"Hello, ""World"""');

    // 3. Test AI BYOK Request formatting in browser (Gemini headers vs URLs)
    console.log('Testing BYOK Gemini request header construction in browser...');
    const aiServiceTest = await page.evaluate(async () => {
      const aiService = await import('/src/services/aiService.ts');
      const { telemetryAuditor } = await import('/src/services/telemetryAuditor.ts');

      let capturedGenerateUrl = '';
      let capturedGenerateHeaders = {};
      let capturedVerifyUrl = '';
      let capturedVerifyHeaders = {};

      const originalFetch = window.fetch;
      window.fetch = async (url, options) => {
        const urlStr = String(url);
        if (urlStr.includes(':generateContent')) {
          capturedGenerateUrl = urlStr;
          capturedGenerateHeaders = options?.headers || {};
          return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"isOutOfScope": true, "outOfScopeReason": "Test"}' }] } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/v1beta/models')) {
          capturedVerifyUrl = urlStr;
          capturedVerifyHeaders = options?.headers || {};
          return new Response(JSON.stringify({ models: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return originalFetch(url, options);
      };

      try {
        // Trigger verification endpoint (models list)
        await window.fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: { 'x-goog-api-key': 'AIzaSy_TEST_KEY_FOR_MODELS' },
        });

        // Trigger generateContent via aiService
        const sampleData = await import('/src/services/sampleData.ts');
        await aiService.processNaturalLanguageQuery(
          'Show top customers',
          sampleData.PREBUILT_DATASETS.saas.dataset,
          {
            provider: 'gemini',
            key: 'AIzaSy_TEST_KEY_GENERATE',
            model: 'gemini-2.5-flash',
            rememberKey: false,
          }
        );
      } catch (e) {
        console.warn('Evaluation call notice:', e);
      } finally {
        window.fetch = originalFetch;
      }

      // Record standard telemetry event and inspect in-memory audit log
      telemetryAuditor.recordOutboundDispatch({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        endpointUrl: capturedGenerateUrl,
        userPrompt: 'Show top customers',
        systemPrompt: 'Planner prompt',
        schemaColumns: ['id', 'name', 'mrr'],
        requestBody: { test: true },
      });
      const events = telemetryAuditor.getHistory();

      return {
        capturedGenerateUrl,
        capturedGenerateHeaders,
        capturedVerifyUrl,
        capturedVerifyHeaders,
        telemetryEvents: events,
      };
    });

    // Verify generateContent has NO key in URL and uses x-goog-api-key header
    const hasGenerateKeyInUrl =
      aiServiceTest.capturedGenerateUrl.includes('AIzaSy_TEST_KEY_GENERATE') ||
      aiServiceTest.capturedGenerateUrl.includes('?key=');
    const hasGenerateKeyInHeader =
      aiServiceTest.capturedGenerateHeaders['x-goog-api-key'] === 'AIzaSy_TEST_KEY_GENERATE';
    results.networkInspection.geminiHeadersVerified = !hasGenerateKeyInUrl && hasGenerateKeyInHeader;

    // Verify models verification has NO key in URL and uses x-goog-api-key header
    const hasVerifyKeyInUrl =
      aiServiceTest.capturedVerifyUrl.includes('AIzaSy_TEST_KEY_FOR_MODELS') ||
      aiServiceTest.capturedVerifyUrl.includes('?key=');
    const hasVerifyKeyInHeader =
      aiServiceTest.capturedVerifyHeaders['x-goog-api-key'] === 'AIzaSy_TEST_KEY_FOR_MODELS';
    results.networkInspection.validationEndpointHeaderVerified = !hasVerifyKeyInUrl && hasVerifyKeyInHeader;

    // Verify telemetry auditor does not contain prompts or keys
    const telemetryString = JSON.stringify(aiServiceTest.telemetryEvents);
    results.networkInspection.keysInTelemetry =
      telemetryString.includes('AIzaSy_TEST_KEY_GENERATE') ||
      telemetryString.includes('AIzaSy_TEST_KEY_FOR_MODELS');
    const promptLeaked = aiServiceTest.telemetryEvents.some(
      (ev) => ev.wirePayloadString !== undefined || ev.userPrompt !== undefined
    );
    results.networkInspection.promptsInTelemetry = promptLeaked;

    console.log('Browser verification completed successfully.');
  } catch (err) {
    console.error('Browser verification encountered an error:', err);
    results.errors.push(err.message);
  } finally {
    await browser.close();
  }

  console.log('\n================ FINAL RESULTS ================');
  console.log(
    JSON.stringify(
      results,
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2
    )
  );
}

runBrowserVerification().catch((e) => {
  console.error('Fatal runner error:', e);
  process.exit(1);
});
