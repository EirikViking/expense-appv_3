import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type ValidateIngestResponse } from '../lib/api';
import { computeFileHash } from '../lib/hash';
import { parseXlsxFile } from '../lib/xlsx-parser';
import type { IngestResponse } from '@expense/shared';
import { useTranslation } from 'react-i18next';
import { buildTransactionsLinkForRange, getRangeFromIngestResponse } from '@/lib/upload-range';

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
  post_process?: {
    scanned: number;
    updated: number;
    remaining_other_like: number;
    done: boolean;
  };
  post_process_error?: string;
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ total: 0, completed: 0 });

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
      <div className="mt-2 text-xs text-white/60">
        <p className="font-medium text-white/80">{t('upload.skippedReasons')}</p>
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

  const runPostProcessOther = async (filename: string, fileHash: string) => {
    updateResult(filename, {
      post_process_error: undefined,
      post_process: { scanned: 0, updated: 0, remaining_other_like: 0, done: false },
    });

    try {
      const runLoop = async (opts: { force: boolean }) => {
        let cursor: string | null = null;
        let totalScanned = 0;
        let totalUpdated = 0;
        let remaining = 0;
        let done = false;

        for (let i = 0; i < 50; i++) {
          const res = await api.reclassifyOther({
            source_file_hash: fileHash,
            cursor,
            limit: 200,
            dry_run: false,
            force: opts.force,
          });

          totalScanned += Number(res.scanned || 0);
          totalUpdated += Number(res.updated || 0);
          remaining = Number(res.remaining_other_like || 0);
          done = Boolean(res.done);

          updateResult(filename, {
            post_process: { scanned: totalScanned, updated: totalUpdated, remaining_other_like: remaining, done },
          });

          if (done || !res.next_cursor) break;
          cursor = res.next_cursor;
        }

        return { totalScanned, totalUpdated, remaining };
      };

      // Phase 1: safe model thresholds.
      const safe = await runLoop({ force: false });

      // Phase 2: aggressive collapse-to-top-level if we still have lots of "Other/uncategorized".
      if (safe.remaining > 50) {
        const aggressive = await runLoop({ force: true });
        updateResult(filename, {
          post_process: {
            scanned: safe.totalScanned + aggressive.totalScanned,
            updated: safe.totalUpdated + aggressive.totalUpdated,
            remaining_other_like: aggressive.remaining,
            done: true,
          },
        });
      } else {
        updateResult(filename, {
          post_process: { scanned: safe.totalScanned, updated: safe.totalUpdated, remaining_other_like: safe.remaining, done: true },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Post-processing failed';
      updateResult(filename, { post_process_error: message });
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

        const ingestRange = getRangeFromIngestResponse(result) ?? rangeFromXlsxTransactions(transactions);
        updateResult(filename, { status: 'success', result, validation_range: ingestRange });
        if (!result.file_duplicate && result.inserted > 0) {
          void runValidation(filename, ingestRange);
          // After validation, run an automatic "Other"/uncategorized reduction scoped to this file.
          // This keeps the app usable even when rules are incomplete.
          void runPostProcessOther(filename, fileHash).then(() => runValidation(filename, ingestRange));
        }
      } else {
        updateResult(filename, {
          status: 'error',
          error: t('upload.unsupportedFileType'),
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
  }, [t]);

  const queueFiles = useCallback((files: File[]) => {
    setPendingFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}|${f.size}|${f.lastModified}`));
      const next = [...prev];
      for (const file of files) {
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      }
      return next;
    });
  }, []);

  const startImport = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setImporting(true);
    setImportProgress({ total: pendingFiles.length, completed: 0 });
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      // eslint-disable-next-line no-await-in-loop
      await processFile(file);
      setImportProgress({ total: pendingFiles.length, completed: i + 1 });
    }
    setPendingFiles([]);
    setImporting(false);
  }, [pendingFiles, processFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      queueFiles(files);
    },
    [queueFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      queueFiles(files);
      e.target.value = ''; // Reset input
    },
    [queueFiles]
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
      <h1 className="text-2xl font-bold text-white mb-6">{t('upload.title')}</h1>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
       className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${isDragging
            ? 'border-blue-400/60 bg-blue-500/10'
            : 'border-white/20 hover:border-white/35'
          }`}
      >
        <div className="space-y-4">
          <div className="text-white/70">
            <p className="text-lg">{t('upload.dragDrop')}</p>
            <p className="text-sm">{t('upload.or')}</p>
          </div>
          <label className="inline-block">
            <input
              type="file"
              accept=".xlsx"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <span className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
              {t('upload.browse')}
            </span>
          </label>
          <p className="text-sm text-white/60">
            {t('upload.supportedFormats')}
          </p>
        </div>
      </div>

      {pendingFiles.length > 0 && (
        <div className="mt-6 rounded-lg border border-white/15 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Import preview ({pendingFiles.length} files)</p>
              <p className="text-xs text-white/60">
                Review files before import. Only XLSX files are supported.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingFiles([])}
                disabled={importing}
                className="rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-50"
              >
                Clear queue
              </button>
              <button
                type="button"
                onClick={startImport}
                disabled={importing}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Confirm import'}
              </button>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {pendingFiles.map((file) => (
              <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span className="truncate text-white/85">{file.name}</span>
                <span className="ml-3 shrink-0 text-white/60">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </span>
              </div>
            ))}
          </div>
          {importing && importProgress.total > 0 && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs text-white/70">
                <span>Progress</span>
                <span>
                  {importProgress.completed}/{importProgress.total}
                </span>
              </div>
              <div className="h-2 rounded bg-white/10">
                <div
                  className="h-2 rounded bg-cyan-400"
                  style={{ width: `${Math.min(100, (importProgress.completed / importProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-white">{t('upload.results')}</h2>
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
                 className={`p-4 rounded-lg border ${
                   result.status === 'processing'
                     ? 'bg-white/5 border-white/10'
                     : result.status === 'success'
                       ? 'bg-emerald-500/10 border-emerald-400/30'
                       : 'bg-red-500/10 border-red-400/30'
                 }`}
               >
                 <div className="flex items-center justify-between">
                   <span className="font-medium text-white">{result.filename}</span>
                   {result.status === 'processing' && (
                     <span className="text-white/60">{t('upload.processing')}</span>
                  )}
                </div>

                 {result.status === 'success' && result.result && (
                   <div className="mt-2 text-sm">
                     {result.result.file_duplicate ? (
                       <p className="text-amber-300 font-medium">
                         {t('upload.duplicate')}
                       </p>
                     ) : (
                       <div className="space-y-1 text-white/70">
                         <p>
                           <span className="text-emerald-300 font-medium">
                             {result.result.inserted}
                           </span>{' '}
                           {t('upload.transactionsInserted')}
                         </p>
                         {result.result.skipped_duplicates > 0 && (
                           <p>
                             <span className="text-amber-300 font-medium">
                               {result.result.skipped_duplicates}
                             </span>{' '}
                             {t('upload.duplicatesSkipped')}
                           </p>
                         )}
                         {result.post_process ? (
                           <p className="text-white/70">
                             <span className="text-white/80 font-medium">{t('upload.postProcess.label')}</span>{' '}
                             {t('upload.postProcess.updated', { count: result.post_process.updated })},{' '}
                             {t('upload.postProcess.remaining', { count: result.post_process.remaining_other_like })}
                           </p>
                         ) : result.post_process_error ? (
                           <p className="text-red-200">
                             <span className="font-medium">{t('upload.postProcess.failed')}</span>{' '}
                             <span className="text-red-200/80 text-xs">{result.post_process_error}</span>
                           </p>
                         ) : null}
                       </div>
                     )}

                     {!result.result.file_duplicate && (
                       <div className="mt-3">
                         {result.validation ? (
                           <div
                             className={`rounded-md border p-3 ${result.validation.ok
                                 ? 'border-emerald-400/30 bg-emerald-500/10 text-white'
                                 : 'border-red-400/30 bg-red-500/10 text-white'
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
                                 to={buildTransactionsLinkForRange(result.validation_range)}
                                    className="shrink-0 rounded-md bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/15"
                                  >
                                   {t('upload.validation.viewTransactions')}
                                 </Link>
                               )}
                             </div>
                          </div>
                        ) : result.validation_range ? (
                          <p className="text-xs text-white/70">{t('upload.validation.running')}</p>
                        ) : null}
                      </div>
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleDetails(resultKey)}
                        className="mt-2 text-xs font-medium text-white/70 hover:text-white"
                      >
                        {showDetails ? t('dashboard.hideDetails') : t('dashboard.showDetails')}
                      </button>
                    )}

                    {showDetails && result.result.skipped_invalid > 0 && (
                      <p className="mt-2 text-xs text-white/70">
                        {t('upload.invalidRowsSkipped', { count: result.result.skipped_invalid })}
                      </p>
                    )}
                    {renderSkippedSummary(result.result.skipped_lines_summary, showDetails)}
                  </div>
                )}

                {result.status === 'error' && (
                  <div className="mt-2 text-sm text-red-700">
                    <p className="font-medium">{result.error}</p>

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
            className="text-sm text-white/60 hover:text-white/80"
          >
            {t('upload.clearResults')}
          </button>
        </div>
      )}
    </div>
  );
}
