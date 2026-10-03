/**
 * Privacy Trust Indicator Widget
 * Concise, honest communication that data stays local in DuckDB-WASM and only limited AI context leaves the browser.
 */

export function renderPrivacyIndicator(containerEl) {
  containerEl.innerHTML = `
    <div class="sidebar-privacy-header">
      <span>🔒</span>
      <span>Data stays in your browser</span>
    </div>
    <div class="sidebar-privacy-body">
      SQL runs locally with DuckDB-WASM. Only schema metadata and capped results are sent to your selected AI provider.
    </div>
  `;
}
