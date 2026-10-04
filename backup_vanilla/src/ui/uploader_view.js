/**
 * CSV Uploader & Dataset Workspace Controller
 * Linear / Vercel style effortless CSV dropzone and dataset management.
 */

import { loadCsvIntoDuckDB, clearActiveDataset } from '../duckdb/csv_loader.js';
import { extractSchema } from '../duckdb/schema.js';

export class UploaderView {
  constructor({ containerEl, getDuckDB, onDatasetLoaded = () => {}, onDatasetCleared = () => {} }) {
    this.container = containerEl;
    this.getDuckDB = getDuckDB;
    this.onDatasetLoaded = onDatasetLoaded;
    this.onDatasetCleared = onDatasetCleared;
    this.currentDataset = null;
    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div id="dropZone" class="dropzone-card">
        <input type="file" id="csvFileInput" accept=".csv" style="display: none;" />
        <div class="dropzone-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div>
          <div class="dropzone-title">Drop your CSV here, or <button type="button" id="btnBrowseFile" class="btn-link">choose file</button></div>
          <div class="dropzone-subtitle" style="margin-top: 4px;">
            100% in-browser WebAssembly database. Your full data never leaves your device.
          </div>
        </div>

        <div class="dropzone-actions">
          <span style="font-size: 12px; color: var(--text-muted);">or</span>
          <button type="button" id="btnLoadDemoCsv" class="btn btn-secondary btn-sm">
            📊 Load Sample customers.csv
          </button>
        </div>
      </div>

      <div id="uploaderLoading" style="display: none; align-items: center; justify-content: center; gap: 12px; padding: 32px 0;">
        <span style="display: inline-block; width: 16px; height: 16px; border: 2px solid var(--accent); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite;"></span>
        <span id="uploaderLoadingText" style="font-size: 13px; color: var(--text-secondary); font-family: var(--font-mono);">
          Initializing DuckDB-WASM engine...
        </span>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');
    const browseBtn = document.getElementById('btnBrowseFile');
    const demoBtn = document.getElementById('btnLoadDemoCsv');

    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => {
        fileInput.click();
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.processCsvFile(file);
      });
    }

    if (demoBtn) {
      demoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loadDemoDataset();
      });
    }

    // Drag and drop handlers
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please upload a valid .csv file.');
            return;
          }
          this.processCsvFile(file);
        }
      });
    }
  }

  showLoading(text = 'Processing CSV...') {
    const loading = document.getElementById('uploaderLoading');
    const loadingText = document.getElementById('uploaderLoadingText');
    const dropZone = document.getElementById('dropZone');
    if (loading) {
      loading.style.display = 'flex';
      if (loadingText) loadingText.textContent = text;
    }
    if (dropZone) dropZone.style.display = 'none';
  }

  hideLoading() {
    const loading = document.getElementById('uploaderLoading');
    if (loading) loading.style.display = 'none';
  }

  async processCsvFile(file) {
    this.showLoading(`Loading "${file.name}" into DuckDB-WASM...`);

    try {
      const { db, conn } = await this.getDuckDB();
      const { tableName } = await loadCsvIntoDuckDB({
        db,
        conn,
        source: file,
        filename: file.name
      });

      const schemaData = await extractSchema(conn, tableName);
      this.currentDataset = schemaData;
      this.showMetadata(schemaData);
      this.onDatasetLoaded(schemaData);
    } catch (err) {
      alert(`Failed to load CSV: ${err.message}`);
      this.resetDataset();
    } finally {
      this.hideLoading();
    }
  }

  async loadDemoDataset() {
    this.showLoading('Loading sample customers.csv into DuckDB-WASM...');

    try {
      const res = await fetch('/sample-data/customers.csv');
      if (!res.ok) {
        throw new Error(`Could not fetch demo dataset: HTTP ${res.status}`);
      }
      const csvText = await res.text();
      const { db, conn } = await this.getDuckDB();

      const { tableName } = await loadCsvIntoDuckDB({
        db,
        conn,
        source: csvText,
        filename: 'customers.csv'
      });

      const schemaData = await extractSchema(conn, tableName);
      this.currentDataset = schemaData;
      this.showMetadata(schemaData);
      this.onDatasetLoaded(schemaData);
    } catch (err) {
      alert(`Failed to load demo CSV: ${err.message}`);
      this.resetDataset();
    } finally {
      this.hideLoading();
    }
  }

  showMetadata(datasetInfo) {
    const dropZone = document.getElementById('dropZone');
    const queryWrap = document.getElementById('queryWorkspaceWrap');
    const topbarBadge = document.getElementById('topbarDatasetBadge');
    const topbarText = document.getElementById('topbarDatasetText');
    const sidebarSlot = document.getElementById('sidebarDatasetSlot');

    if (dropZone) dropZone.style.display = 'none';
    if (queryWrap) queryWrap.style.display = 'flex';

    if (topbarBadge && topbarText) {
      topbarBadge.style.display = 'inline-flex';
      topbarText.textContent = `${datasetInfo.tableName}.csv · ${datasetInfo.totalRows.toLocaleString()} rows`;
    }

    if (sidebarSlot) {
      sidebarSlot.style.display = 'flex';
      sidebarSlot.innerHTML = `
        <div class="sb-heading">DATASET</div>
        <div class="sb-dataset-card">
          <div class="sb-dataset-title">
            <span style="color: var(--accent);">📊</span>
            <span>${datasetInfo.tableName}.csv</span>
          </div>
          <div class="sb-dataset-stats">
            <span>${datasetInfo.totalRows.toLocaleString()} rows</span>
            <span>·</span>
            <span>${datasetInfo.columns.length} cols</span>
          </div>
          <div class="sb-dataset-actions">
            <button id="btnReplaceDataset" class="btn btn-ghost btn-sm" style="padding: 0; font-size: 11.5px; color: var(--accent);">
              Replace CSV ↺
            </button>
          </div>
        </div>
      `;

      const replaceBtn = document.getElementById('btnReplaceDataset');
      if (replaceBtn) {
        replaceBtn.addEventListener('click', () => this.resetDataset());
      }
    }
  }

  async resetDataset() {
    try {
      const { conn } = await this.getDuckDB();
      await clearActiveDataset(conn);
    } catch (e) {}

    this.currentDataset = null;
    const dropZone = document.getElementById('dropZone');
    const queryWrap = document.getElementById('queryWorkspaceWrap');
    const topbarBadge = document.getElementById('topbarDatasetBadge');
    const sidebarSlot = document.getElementById('sidebarDatasetSlot');
    const fileInput = document.getElementById('csvFileInput');

    if (dropZone) dropZone.style.display = 'flex';
    if (queryWrap) queryWrap.style.display = 'none';
    if (topbarBadge) topbarBadge.style.display = 'none';
    if (sidebarSlot) {
      sidebarSlot.style.display = 'none';
      sidebarSlot.innerHTML = '';
    }
    if (fileInput) fileInput.value = '';

    this.onDatasetCleared();
  }
}
