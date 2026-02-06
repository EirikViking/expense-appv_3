import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { computeFileHash } from '../lib/hash';
import { parseXlsxFile } from '../lib/xlsx-parser';
import { extractPdfText } from '../lib/pdf-extractor';
import type { IngestResponse } from '@expense/shared';
import { useTranslation } from 'react-i18next';

const DEV_LOGS = import.meta.env.VITE_DEV_LOGS === 'true';

interface FileResult {
  filename: string;
  status: 'processing' | 'success' | 'error';
  result?: IngestResponse;
  error?: string;
}

const SKIPPED_SUMMARY_LABELS = [
  ['header', 'upload.skipped.header'],
  ['section_marker', 'upload.skipped.sectionMarker'],
  ['page_number', 'upload.skipped.pageNumber'],
  ['no_date', 'upload.skipped.noDate'],
  ['no_amount', 'upload.skipped.noAmount'],
  ['parse_failed', 'upload.skipped.parseFailed'],
  ['excluded_pattern', 'upload.skipped.excludedPattern'],
] as const;

export function UploadPage() {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [detailsOpen, setDetailsOpen] = useState<Record<string, boolean>>({});

  const updateResult = (filename: string, update: Partial<FileResult>) => {
    setResults((prev) =>
      prev.map((r) => (r.filename === filename ? { ...r, ...update } : r))
    );
  };

  const renderSkippedSummary = (
    summary: IngestResponse['skipped_lines_summary'] | undefined,
    showDetails: boolean
  ) => {
    if (!summary || !showDetails) return null;
    const summaryItems = SKIPPED_SUMMARY_LABELS.filter(([key]) => summary[key] > 0);
    if (summaryItems.length === 0) return null;

    return (
      <div className="mt-2 text-xs text-gray-500">
        <p className="font-medium text-gray-700">{t('upload.skippedReasons')}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {summaryItems.map(([key, labelKey]) => (
            <span key={key}>
              {summary[key]} {t(labelKey)}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const toggleDetails = (key: string) => {
    setDetailsOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const processFile = useCallback(async (file: File) => {
    const filename = file.name;

    setResults((prev) => [...prev, { filename, status: 'processing' }]);

    try {
      // Compute file hash
      const fileHash = await computeFileHash(file);

      if (DEV_LOGS) {
        console.log(`[DEV] File: ${filename}, Hash: ${fileHash}`);
      }

      const arrayBuffer = await file.arrayBuffer();

      if (file.name.toLowerCase().endsWith('.xlsx')) {
        // Parse XLSX in browser
        const { transactions, error, debugInfo, detectedFormat } = parseXlsxFile(arrayBuffer);

        if (error) {
          console.error(`[XLSX Parse Error] ${filename}: ${error}`);
          if (debugInfo) {
            console.error(`[XLSX Debug] ${debugInfo}`);
          }
          updateResult(filename, { status: 'error', error });
          return;
        }

        if (DEV_LOGS || detectedFormat) {
          console.log(`[XLSX Parser] ${filename}: Detected format: ${detectedFormat}`);
          console.log(`[XLSX Parser] Parsed ${transactions.length} transactions from XLSX`);
        }

        // Send to API
        const result = await api.ingestXlsx({
          file_hash: fileHash,
          filename,
          source: 'xlsx',
          transactions,
        });

        if (DEV_LOGS) {
          console.log(`[DEV] Ingest result:`, result);
        }

        updateResult(filename, { status: 'success', result });
      } else if (file.name.toLowerCase().endsWith('.pdf')) {
        // Extract text from PDF in browser
        const { text, error } = await extractPdfText(arrayBuffer);

        if (error) {
          updateResult(filename, { status: 'error', error });
          return;
        }

        if (DEV_LOGS) {
          console.log(`[DEV] Extracted ${text.length} chars from PDF`);
        }

        // Send to API for parsing
        const result = await api.ingestPdf({
          file_hash: fileHash,
          filename,
          source: 'pdf',
          extracted_text: text,
        });

        if (DEV_LOGS) {
          console.log(`[DEV] Ingest result:`, result);
        }

        updateResult(filename, { status: 'success', result });
      } else {
        updateResult(filename, {
          status: 'error',
          error: 'Unsupported file type. Please upload .xlsx or .pdf files.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      updateResult(filename, { status: 'error', error: message });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      files.forEach(processFile);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      files.forEach(processFile);
      e.target.value = ''; // Reset input
    },
    [processFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div className="px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('upload.title')}</h1>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
          }`}
      >
        <div className="space-y-4">
          <div className="text-gray-600">
            <p className="text-lg">{t('upload.dragDrop')}</p>
            <p className="text-sm">{t('upload.or')}</p>
          </div>
          <label className="inline-block">
            <input
              type="file"
              accept=".xlsx,.pdf"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <span className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              {t('upload.browse')}
            </span>
          </label>
          <p className="text-sm text-gray-500">
            {t('upload.supportedFormats')}
          </p>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('upload.results')}</h2>
          {results.map((result, index) => {
            const resultKey = `${result.filename}-${index}`;
            const showDetails = Boolean(detailsOpen[resultKey]);
            const hasDetails = Boolean(
              result.status === 'success' &&
                result.result &&
                !result.result.file_duplicate &&
                (result.result.skipped_invalid > 0 || result.result.skipped_lines_summary)
            );

            return (
              <div
                key={resultKey}
                className={`p-4 rounded-lg border ${result.status === 'processing'
                    ? 'bg-gray-50 border-gray-200'
                    : result.status === 'success'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{result.filename}</span>
                  {result.status === 'processing' && (
                    <span className="text-gray-500">{t('upload.processing')}</span>
                  )}
                </div>

                {result.status === 'success' && result.result && (
                  <div className="mt-2 text-sm">
                    {result.result.file_duplicate ? (
                      <p className="text-amber-600 font-medium">
                        {t('upload.duplicate')}
                      </p>
                    ) : (
                      <div className="space-y-1 text-gray-600">
                        <p>
                          <span className="text-green-600 font-medium">
                            {result.result.inserted}
                          </span>{' '}
                          {t('upload.transactionsInserted')}
                        </p>
                        {result.result.skipped_duplicates > 0 && (
                          <p>
                            <span className="text-amber-600 font-medium">
                              {result.result.skipped_duplicates}
                            </span>{' '}
                            {t('upload.duplicatesSkipped')}
                          </p>
                        )}
                      </div>
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleDetails(resultKey)}
                        className="mt-2 text-xs font-medium text-gray-600 hover:text-gray-800"
                      >
                        {showDetails ? t('dashboard.hideDetails') : t('dashboard.showDetails')}
                      </button>
                    )}

                    {showDetails && result.result.skipped_invalid > 0 && (
                      <p className="mt-2 text-xs text-gray-600">
                        {t('upload.invalidRowsSkipped', { count: result.result.skipped_invalid })}
                      </p>
                    )}
                    {renderSkippedSummary(result.result.skipped_lines_summary, showDetails)}
                  </div>
                )}

                {result.status === 'error' && (
                  <p className="mt-2 text-sm text-red-600">{result.error}</p>
                )}
              </div>
            );
          })}

          <button
            onClick={() => {
              setResults([]);
              setDetailsOpen({});
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t('upload.clearResults')}
          </button>
        </div>
      )}
    </div>
  );
}
