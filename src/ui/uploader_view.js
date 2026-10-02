/**
 * CSV Uploader & Dataset Workspace Controller
 * Handles drag-and-drop, file reading, demo CSV loading, and dataset replacement.
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
      <div class="dataset-card" id="datasetUploaderCard">
        <div class="card-hdr">
          <div class="card-hdr-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            Dataset · In-Browser DuckDB
          </div>
          <div id="datasetActions" class="card-hdr-right" style="display: none;">
            <button id="btnReplaceDataset" class="btn-sm btn-ghost">Replace CSV</button>
          </div>
        </div>

        <div id="dropZone" class="drop-zone">
          <input type="file" id="csvFileInput" accept=".csv" style="display: none;" />
          <div class="drop-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" stroke-width="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div class="drop-title">Drop your CSV here, or <button type="button" id="btnBrowseFile" class="btn-link">choose file</button></div>
          <div class="drop-subtitle">Your data is parsed and queried 100% locally with WebAssembly. Never uploaded to QueryMind.</div>
          
          <div class="demo-chip-wrap">
            <span class="muted-text">Or try with sample data:</span>
            <button type="button" id="btnLoadDemoCsv" class="demo-chip">
              📊 Load Sample customers.csv
            </button>
          </div>
        </div>

        <div id="datasetMetaBanner" class="dataset-meta-banner" style="display: none;">
          <div class="meta-item">
            <span class="meta-label">TABLE</span>
            <span id="metaTableName" class="meta-val mono-badge">customers</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">ROWS</span>
            <span id="metaRowCount" class="meta-val">0</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">COLUMNS</span>
            <span id="metaColCount" class="meta-val">0</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">ENGINE</span>
            <span class="meta-val badge badge-green">DuckDB-WASM · Local</span>
          </div>
        </div>

        <div id="uploaderLoading" class="uploader-loading" style="display: none;">
          <div class="spinner"></div>
          <div id="uploaderLoadingText">Initializing DuckDB-WASM engine...</div>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFileInput');
    const browseBtn = document.getElementById('btnBrowseFile');
    const demoBtn = document.getElementById('btnLoadDemoCsv');
    const replaceBtn = document.getElementById('btnReplaceDataset');

    browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.processCsvFile(file);
    });

    demoBtn.addEventListener('click', () => this.loadDemoDataset());

    replaceBtn.addEventListener('click', () => this.resetDataset());

    // Drag and drop handlers
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
    this.showLoading('Loading demo dataset (sample-data/customers.csv)...');

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
    const banner = document.getElementById('datasetMetaBanner');
    const actions = document.getElementById('datasetActions');

    if (dropZone) dropZone.style.display = 'none';
    if (banner) banner.style.display = 'flex';
    if (actions) actions.style.display = 'block';

    document.getElementById('metaTableName').textContent = datasetInfo.tableName;
    document.getElementById('metaRowCount').textContent = datasetInfo.totalRows.toLocaleString();
    document.getElementById('metaColCount').textContent = datasetInfo.columns.length;
  }

  async resetDataset() {
    try {
      const { conn } = await this.getDuckDB();
      await clearActiveDataset(conn);
    } catch (e) {}

    this.currentDataset = null;
    const dropZone = document.getElementById('dropZone');
    const banner = document.getElementById('datasetMetaBanner');
    const actions = document.getElementById('datasetActions');
    const fileInput = document.getElementById('csvFileInput');

    if (dropZone) dropZone.style.display = 'block';
    if (banner) banner.style.display = 'none';
    if (actions) actions.style.display = 'none';
    if (fileInput) fileInput.value = '';

    this.onDatasetCleared();
  }
}
