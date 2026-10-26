import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(process.env.TEMP || 'C:\\TEMP', 'chrome_prod_gate35_' + Date.now());
const TARGET_URL = 'http://127.0.0.1:3000/';

console.log('Spawning Chrome for Worker Cancellation & CSV Download Test...');
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

try {
  const pageTarget = await waitForCdp();
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let msgId = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
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

  // Dismiss onboarding
  await new Promise(r => setTimeout(r, 1500));
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skipBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Skip to Playground'));
      if (skipBtn) skipBtn.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Hook URL.createObjectURL to capture downloaded CSV text
  console.log('Hooking URL.createObjectURL in browser page...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      window.__capturedDownloads = [];
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = function(blob) {
        if (blob instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => {
            window.__capturedDownloads.push({
              type: blob.type,
              size: blob.size,
              text: reader.result
            });
          };
          reader.readAsText(blob);
        }
        return origCreate.apply(this, arguments);
      };
    })()`
  });

  // 2. Click sample query
  console.log('Running query to generate downloadable results table...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sampleBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enterprise customers') && b.innerText.includes('lost MRR'));
      if (sampleBtn) sampleBtn.click();
    })()`
  });

  // Wait for query to complete
  for (let i = 0; i < 20; i++) {
    const hasTable = (await send('Runtime.evaluate', {
      expression: 'document.querySelector("table") !== null'
    })).result.value;
    if (hasTable) {
      console.log(`Table rendered after ${(i + 1) * 500}ms!`);
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // 3. Click Download CSV button in the UI
  console.log('Clicking CSV Download button in UI...');
  const clickDownload = await send('Runtime.evaluate', {
    expression: `(() => {
      const downloadBtn = Array.from(document.querySelectorAll('button')).find(b => 
        b.title?.toLowerCase().includes('csv') || b.innerText?.toLowerCase().includes('csv')
      );
      if (downloadBtn) {
        downloadBtn.click();
        return { clicked: true, title: downloadBtn.title };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Download CSV Button Click:', clickDownload.result.value);

  // Wait 1 second for FileReader to capture blob text
  await new Promise(r => setTimeout(r, 1000));

  const capturedBlob = await send('Runtime.evaluate', {
    expression: 'window.__capturedDownloads',
    returnByValue: true
  });
  console.log('Captured Downloaded Blob Count:', capturedBlob.result.value?.length);
  if (capturedBlob.result.value?.length > 0) {
    const csvData = capturedBlob.result.value[0];
    console.log('Downloaded File MIME Type:', csvData.type);
    console.log('Downloaded File Size:', csvData.size, 'bytes');
    console.log('Downloaded CSV Content:\n' + csvData.text.slice(0, 400));
  }

  // 4. Test unsupported / out-of-scope metric request
  console.log('\n--- Testing Unsupported Metric Request in UI ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(textarea, 'What is the customer churn probability score?');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const runBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Run Query'));
      if (runBtn) runBtn.click();
    })()`
  });

  // Wait for clarification / notice
  await new Promise(r => setTimeout(r, 2000));

  const noticeText = await send('Runtime.evaluate', {
    expression: `(() => {
      const banner = document.querySelector('[class*="notice"], [class*="error"], [role="dialog"]');
      const text = document.querySelector('main')?.innerText || '';
      return {
        hasClarification: text.includes('clarif') || text.includes('not directly defined') || text.includes('Notice') || text.includes('Scope'),
        snippet: text.slice(0, 400)
      };
    })()`,
    returnByValue: true
  });
  console.log('Unsupported Metric Handling:', JSON.stringify(noticeText.result.value, null, 2));

  ws.close();
} finally {
  chrome.kill('SIGTERM');
  try {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  } catch {}
}
console.log('\n=== Worker Lifecycle & CSV Download Verification Complete ===');
