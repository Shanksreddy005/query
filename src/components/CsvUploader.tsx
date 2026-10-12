import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { UploadCloud, Database, AlertCircle } from 'lucide-react';
import { Dataset } from '../types';
import { inferDatasetSchema, PREBUILT_DATASETS } from '../services/sampleData';

interface CsvUploaderProps {
  onDatasetLoaded: (dataset: Dataset) => void;
  isDarkMode: boolean;
}

export const CsvUploader: React.FC<CsvUploaderProps> = ({ onDatasetLoaded, isDarkMode }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!file) return;
    setError(null);
    setIsLoading(true);

    const isCsvOrTsv = file.name.endsWith('.csv') || file.name.endsWith('.tsv') || file.name.endsWith('.txt');
    const isJson = file.name.endsWith('.json');

    if (!isCsvOrTsv && !isJson) {
      setError('Please upload a valid .csv, .tsv, or .json file.');
      setIsLoading(false);
      return;
    }

    const reader = new FileReader();

    if (isJson) {
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          const records = Array.isArray(parsed) ? parsed : [parsed];
          const rawName = file.name.replace(/\.[^/.]+$/, '');
          const tableName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const dataset = inferDatasetSchema(records, tableName, rawName);
          dataset.fileSizeFormatted = `${(file.size / 1024).toFixed(1)} KB`;
          onDatasetLoaded(dataset);
        } catch (err: any) {
          setError(`JSON Parse error: ${err?.message || 'Invalid JSON format'}`);
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsText(file);
    } else {
      // CSV / TSV Parsing
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          setIsLoading(false);
          if (results.errors && results.errors.length > 0 && results.data.length === 0) {
            setError(`CSV Parsing Error: ${results.errors[0].message}`);
            return;
          }

          const rawName = file.name.replace(/\.[^/.]+$/, '');
          const tableName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
          const dataset = inferDatasetSchema(results.data as Record<string, any>[], tableName, rawName);
          dataset.fileSizeFormatted = `${(file.size / 1024).toFixed(1)} KB`;
          onDatasetLoaded(dataset);
        },
        error: (err) => {
          setIsLoading(false);
          setError(`File reading failed: ${err.message}`);
        },
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const loadSample = (key: 'saas' | 'ecommerce') => {
    const sample = PREBUILT_DATASETS[key];
    if (sample) {
      onDatasetLoaded(sample.dataset);
    }
  };

  const borderClass = isDragging
    ? 'border-accent bg-badge-accent-bg'
    : 'border-border-strong bg-surface-secondary/40 hover:border-accent hover:bg-surface-secondary/70';

  return (
    <div className="w-full space-y-4">
      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 transition-all duration-fast cursor-pointer text-center group ${borderClass}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.json,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-badge-accent-bg text-badge-accent-fg border border-badge-accent-border flex items-center justify-center transition-transform duration-fast group-hover:scale-105 shadow-2xs">
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <UploadCloud className="w-7 h-7 text-accent" />
            )}
          </div>

          <div>
            <p className="text-sm font-semibold tracking-tight text-text-primary">
              Drop your CSV, TSV, or JSON dataset here, or <span className="text-accent underline">browse</span>
            </p>
            <p className="text-xs text-text-muted mt-1 leading-relaxed">
              100% private · Browser-native DuckDB engine · No data ever leaves your device
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-2.5 rounded-lg bg-badge-error-bg border border-badge-error-border text-badge-error-fg text-xs flex items-center justify-center gap-2 shadow-2xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Instant Demo Datasets Picker */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-border-subtle bg-surface-secondary/60">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Database className="w-4 h-4 text-accent" />
          <span>Don't have a dataset ready? Explore instant demo datasets:</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => loadSample('saas')}
            className="btn-interactive flex-1 sm:flex-initial text-xs font-medium px-3 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <span>SaaS Retention & MRR</span>
            <span className="text-[10px] font-mono text-text-muted">(25 rows)</span>
          </button>

          <button
            type="button"
            onClick={() => loadSample('ecommerce')}
            className="btn-interactive flex-1 sm:flex-initial text-xs font-medium px-3 py-1.5 rounded-lg border border-border-strong bg-surface text-text-secondary hover:text-text-primary hover:border-border-strong hover:bg-surface-elevated flex items-center justify-center gap-1.5 shadow-2xs"
          >
            <span>E-Commerce Profitability</span>
            <span className="text-[10px] font-mono text-text-muted">(15 rows)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
