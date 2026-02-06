import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type ValidateIngestResponse } from '../lib/api';
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
  api_error?: { code?: string; message?: string; debug?: unknown };
  validation?: ValidateIngestResponse;
  validation_range?: { date_from: string; date_to: string };
  validation_error?: string;
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

  const isoDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const fallbackRange = () => {
    const now = new Date();
    const date_to = isoDate(now);
    const date_from = isoDate(new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000));
    return { date_from, date_to };
  };

  const rangeFromXlsxTransactions = (transactions: Array<{ tx_date: string }>) => {
    const dates = transactions
      .map((t) => t?.tx_date)
      .filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (dates.length === 0) return fallbackRange();
    return { date_from: dates[0], date_to: dates[dates.length - 1] };
  };

  const rangeFromPdfText = (text: string) => {
    const isoDates = new Set<string>();
    const ddmmyyyy = /\b(\d{2})\.(\d{2})\.(\d{4})\b/g;
    const yyyymmdd = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

    for (const m of text.matchAll(ddmmyyyy)) {
      const [, dd, mm, yyyy] = m;
      isoDates.add(`${yyyy}-${mm}-${dd}`);
    }
    for (const m of text.matchAll(yyyymmdd)) {
      isoDates.add(m[0]);
    }

    const sorted = [...isoDates].filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
    if (sorted.length === 0) return fallbackRange();
    return { date_from: sorted[0], date_to: sorted[sorted.length - 1] };
  };

  const runValidation = async (filename: string, range: { date_from: string; date_to: string }) => {
    updateResult(filename, { validation_range: range, validation_error: undefined });
    try {
      const validation = await api.validateIngest(range);
      updateResult(filename, { validation });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation request failed';
      updateResult(filename, {
        validation: {
          ok: false,
          failures: ['validate_request_failed'],
          period: range,
        },
        validation_error: message,
      });
    }
  };

  const failureLabel = (code: string) => {
    const key = `upload.validation.failures.${code}`;
    const translated = t(key);
    return translated === key ? code : translated;
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
        if (!result.file_duplicate && result.inserted > 0) {
          void runValidation(filename, rangeFromXlsxTransactions(transactions));
        }
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
        if (!result.file_duplicate && result.inserted > 0) {
          void runValidation(filename, rangeFromPdfText(text));
        }
      } else {
        updateResult(filename, {
          status: 'error',
          error: 'Unsupported file type. Please upload .xlsx or .pdf files.',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const apiError =
        err instanceof ApiError && err.data && typeof err.data === 'object'
          ? (err.data as any)
          : null;

      updateResult(filename, {
        status: 'error',
        error: apiError?.message || apiError?.error || message,
        api_error: apiError
          ? {
              code: typeof apiError.code === 'string' ? apiError.code : undefined,
              message: typeof apiError.message === 'string' ? apiError.message : undefined,
              debug: apiError.debug,
            }
          : undefined,
      });
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

                    {!result.result.file_duplicate && (
                      <div className="mt-3">
                        {result.validation ? (
                          <div
                            className={`rounded-md border p-3 ${result.validation.ok
                                ? 'border-green-200 bg-green-100/60 text-green-900'
                                : 'border-red-200 bg-red-100/60 text-red-900'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold">
                                  {result.validation.ok ? t('upload.validation.ok') : t('upload.validation.failed')}
                                </p>
                                {!result.validation.ok && (
                                  <ul className="mt-1 list-disc pl-5 text-sm">
                                    {(result.validation.failures || []).map((code) => (
                                      <li key={code}>{failureLabel(code)}</li>
                                    ))}
                                  </ul>
                                )}
                                {result.validation_error && (
                                  <p className="mt-1 text-xs opacity-80">{result.validation_error}</p>
                                )}
                              </div>
                              {result.validation_range && (
                                <Link
                                  to={
                                    '/transactions?' +
                                    new URLSearchParams({
                                      date_from: result.validation_range.date_from,
                                      date_to: result.validation_range.date_to,
                                      include_excluded: 'true',
                                    }).toString()
                                  }
                                  className="shrink-0 rounded-md bg-white/70 px-3 py-2 text-xs font-medium hover:bg-white"
                                >
                                  {t('upload.validation.viewTransactions')}
                                </Link>
                              )}
                            </div>
                          </div>
                        ) : result.validation_range ? (
                          <p className="text-xs text-gray-600">{t('upload.validation.running')}</p>
                        ) : null}
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
                  <div className="mt-2 text-sm text-red-700">
                    <p className="font-medium">{result.error}</p>

                    {result.api_error?.code === 'PDF_NO_TRANSACTIONS' && (
                      <p className="mt-1 text-xs text-red-700/80">
                        {t('upload.pdfNoTransactionsHelp')}
                      </p>
                    )}

                    {result.api_error?.debug != null && (
                      <details className="mt-2 rounded-md border border-red-200 bg-red-50 p-2">
                        <summary className="cursor-pointer select-none text-xs font-medium text-red-800">
                          {t('upload.showErrorDetails')}
                        </summary>
                        <pre className="mt-2 overflow-auto text-[11px] leading-snug text-red-900/90">
                          {JSON.stringify(result.api_error.debug, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
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
