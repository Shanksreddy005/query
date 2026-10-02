/**
 * Privacy Guarantee Widget
 * Visually communicates that CSV and SQL remain local, and only capped operational context is sent to Claude.
 */

export function renderPrivacyIndicator(containerEl) {
  const box = document.createElement('div');
  box.className = 'privacy-indicator-widget';
  box.innerHTML = `
    <div class="pi-header">
      <div class="pi-icon">🔒</div>
      <div class="pi-title">Privacy-First Architecture</div>
    </div>
    <div class="pi-checklist">
      <div class="pi-item">
        <span class="pi-check">✓</span>
        <span class="pi-label">Uploaded CSV:</span>
        <span class="pi-val">100% In-Browser Memory</span>
      </div>
      <div class="pi-item">
        <span class="pi-check">✓</span>
        <span class="pi-label">SQL Execution:</span>
        <span class="pi-val">Local DuckDB-WASM</span>
      </div>
      <div class="pi-item">
        <span class="pi-check">✓</span>
        <span class="pi-label">Full Dataset to AI:</span>
        <span class="pi-val">Never Transmitted</span>
      </div>
      <div class="pi-item">
        <span class="pi-check">✓</span>
        <span class="pi-label">AI Receives:</span>
        <span class="pi-val">Schema + 5 Samples + Capped Results</span>
      </div>
    </div>
  `;
  containerEl.appendChild(box);
}
