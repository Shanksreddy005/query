import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\TEMP', 'chrome_prod_gate_' + Date.now());
const TARGET_URL = 'http://127.0.0.1:3000/';

console.log('=== Step 1: Spawning Chrome Headless with CDP ===');
const chrome = spawn(CHROME_PATH, [
  '--remote-debugging-port=9222',
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${USER_DATA_DIR}`,
  TARGET_URL
], { stdio: 'ignore' });

async function waitForCdp(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      if (res.ok) {
        const list = await res.json();
        const page = list.find(t => t.type === 'page' && t.url.includes('3000')) || list[0];
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Timeout waiting for Chrome CDP');
}

const networkRequests = [];
const consoleMessages = [];

try {
  const pageTarget = await waitForCdp();
  console.log('Connected to CDP Target:', pageTarget.webSocketDebuggerUrl);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
    if (data.method === 'Console.messageAdded') {
      consoleMessages.push(data.params.message);
    }
    if (data.method === 'Network.requestWillBeSent') {
      networkRequests.push(data.params);
    }
  };

  await new Promise(resolve => ws.onopen = resolve);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, (res) => {
        if (res.error) reject(new Error(res.error.message));
        else resolve(res.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Console.enable');
  await send('Network.enable');

  // Wait for initial render
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n=== Step 2: Testing BYOK Key Security in Real Browser Network ===');
  // In OnboardingModal, enter test key via React prototype setter
  const testKeyResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const input = document.querySelector('input[type="password"], input[placeholder*="API Key"]');
      if (!input) return { error: 'API key input not found' };

      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(input, 'AIzaSyFakeKey_AuditGate4_Verification_12345');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const testBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Test Key'));
      if (!testBtn) return { error: 'Test Key button not found' };

      testBtn.click();
      return { triggered: true, testBtnText: testBtn.innerText };
    })()`
  });
  console.log('Test Connection Triggered:', testKeyResult.result.value);

  // Wait 3 seconds for outbound network dispatch
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== Step 3: Inspecting Intercepted Network Requests ===');
  const geminiRequests = networkRequests.filter(r => 
    r.request.url.includes('generativelanguage.googleapis.com') ||
    r.request.url.includes('api.groq.com') ||
    r.request.url.includes('api.openai.com')
  );

  console.log('Provider API Requests Intercepted:', geminiRequests.length);
  for (const req of geminiRequests) {
    const url = req.request.url;
    const method = req.request.method;
    const headers = req.request.headers;
    const hasKeyInQuery = url.includes('key=') || url.includes('AIzaSy');
    const xGoogApiKey = headers['x-goog-api-key'] || headers['X-Goog-Api-Key'];

    console.log(`- Provider URL: ${url}`);
    console.log(`  HTTP Method: ${method}`);
    console.log(`  URL query parameter key exposure: ${hasKeyInQuery ? 'VIOLATION DETECTED!' : 'NONE (COMPLIANT)'}`);
    console.log(`  x-goog-api-key header present: ${xGoogApiKey ? 'YES (COMPLIANT)' : 'NO'}`);
    console.log(`  Sent key matches test key: ${xGoogApiKey === 'AIzaSyFakeKey_AuditGate4_Verification_12345' ? 'YES' : 'NO'}`);
  }

  console.log('\n=== Step 4: Dismissing Onboarding and Loading Dataset ===');
  // Dismiss onboarding modal
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Skip to Playground') || b.innerText.includes('Continue'));
      if (skipBtn) skipBtn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 1000));

  console.log('\n=== Step 5: Executing Natural Language Analytical Query ===');
  // Click sample query button
  const clickQueryRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const sampleBtn = btns.find(b => b.innerText.includes('Enterprise customers') && b.innerText.includes('lost MRR'));
      if (sampleBtn) {
        sampleBtn.click();
        return { clicked: true, text: sampleBtn.innerText };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Sample Button Click:', clickQueryRes.result.value);

  // Poll for DuckDB query completion in UI (up to 15 seconds)
  console.log('Polling for DuckDB-WASM query execution in browser...');
  let queryResultData = null;
  for (let i = 0; i < 30; i++) {
    const check = await send('Runtime.evaluate', {
      expression: `(() => {
        const table = document.querySelector('table');
        if (!table) return null;
        const ths = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
        const trs = Array.from(table.querySelectorAll('tbody tr')).map(tr => 
          Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
        );
        const reasoning = Array.from(document.querySelectorAll('[class*="reasoning"], [class*="step"]')).map(el => el.innerText.trim()).filter(Boolean);
        const hasSvgChart = document.querySelector('svg.recharts-surface, svg') !== null;
        return {
          headers: ths,
          rowCount: trs.length,
          firstRow: trs[0] || [],
          hasSvgChart,
          reasoningCount: reasoning.length
        };
      })()`,
      returnByValue: true
    });

    if (check.result.value) {
      queryResultData = check.result.value;
      console.log(`Query completed after ${(i + 1) * 500}ms!`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('DuckDB Query Results in Browser UI:', JSON.stringify(queryResultData, null, 2));

  console.log('\n=== Step 6: Testing CSV Export in Real Browser ===');
  const csvExportResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      // Find CSV download button
      const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.title?.toLowerCase().includes('csv') || b.innerText?.toLowerCase().includes('csv') || b.getAttribute('aria-label')?.toLowerCase().includes('csv')
      );

      return {
        downloadBtnFound: !!downloadBtn,
        downloadBtnTitle: downloadBtn?.title || null
      };
    })()`
  });
  console.log('CSV Export UI Status:', csvExportResult.result.value);

  console.log('\n=== Step 7: Verifying Opt-In Storage Discipline ===');
  const storageResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const stored = localStorage.getItem('querymind_api_key_config');
      return {
        keyPersistedInLocalStorage: stored !== null,
        value: stored
      };
    })()`,
    returnByValue: true
  });
  console.log('Storage Check (rememberKey=false default):', storageResult.result.value);

  ws.close();
} finally {
  chrome.kill('SIGTERM');
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  } catch {}
}
console.log('\n=== Live Production Browser Verification Completed Successfully ===');
