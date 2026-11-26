import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderSync,
  HardDrive,
  Link2,
  Loader2,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { isValidTickerSymbol, resolveCanonicalSymbol } from '../../../shared/catalog.ts';
import type { PattySyncMeta } from '../../../shared/types.ts';
import {
  fetchLocalPattyWorkspaceApi,
  type LocalPattyWorkspaceResponse,
} from '../../services/apiClient.ts';
import {
  PATTY_AUTO_SYNC_STORAGE_KEY,
  PattyPinRequiredError,
  buildPattySyncMeta,
  normalizePattyInvestments,
  parsePattyWorkspaceText,
  readBrowserPattyWorkspace,
  resolvePattyInvestments,
  type PattyNormalizedAsset,
  type PattySyncBuildResult,
  type PattyWorkspaceFile,
} from '../../services/pattySync.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';

interface PattySyncModalProps {
  open: boolean;
  onClose: () => void;
}

interface PendingPinPrompt {
  rawText: string;
  sourceType: PattySyncMeta['sourceType'];
  sourceLabel: string;
}

export const PattySyncModal: React.FC<PattySyncModalProps> = ({ open, onClose }) => {
  const {
    pattyLastSync,
    pattySymbolOverrides,
    catalogAssets,
    syncPattyPortfolio,
    setPattySymbolOverride,
    clearPattySync,
  } = useDashboardStore();

  const [browserWorkspace, setBrowserWorkspace] = useState<PattyWorkspaceFile | null>(null);
  const [localFile, setLocalFile] = useState<LocalPattyWorkspaceResponse | null>(null);
  const [loadingSources, setLoadingSources] = useState(false);

  const [includeZeroQuantity, setIncludeZeroQuantity] = useState<boolean>(
    pattyLastSync?.includeZeroQuantity ?? false,
  );
  const [includeCostBasis, setIncludeCostBasis] = useState<boolean>(true);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' &&
        window.localStorage?.getItem(PATTY_AUTO_SYNC_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<PendingPinPrompt | null>(null);
  const [pinInput, setPinInput] = useState('');

  const [lastResult, setLastResult] = useState<PattySyncBuildResult | null>(null);
  const [lastMeta, setLastMeta] = useState<PattySyncMeta | null>(null);
  const [lastNormalized, setLastNormalized] = useState<PattyNormalizedAsset[] | null>(null);
  const [showUnresolved, setShowUnresolved] = useState(true);
  const [overrideInputs, setOverrideInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setPinPrompt(null);
    setPinInput('');
    setBrowserWorkspace(readBrowserPattyWorkspace());
    setLoadingSources(true);
    void fetchLocalPattyWorkspaceApi({ includeCostBasis })
      .then((res) => setLocalFile(res))
      .finally(() => setLoadingSources(false));
  }, [open, includeCostBasis]);

  const handleToggleAutoSync = (checked: boolean) => {
    setAutoSyncEnabled(checked);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(PATTY_AUTO_SYNC_STORAGE_KEY, checked ? 'true' : 'false');
      }
    } catch {
      // ignore storage errors
    }
  };

  const executeSyncFromWorkspace = useCallback(
    async (
      workspace: PattyWorkspaceFile,
      sourceType: PattySyncMeta['sourceType'],
      sourceLabel: string,
    ) => {
      setBusy(true);
      setErrorMsg(null);
      setProgress({ done: 0, total: 1, name: 'Vorbereitung…' });
      try {
        const normalized = normalizePattyInvestments(
          workspace.investments ?? [],
          workspace.rules ?? [],
          includeZeroQuantity,
        );
        if (normalized.length === 0) {
          throw new Error(
            'Keine aktiven Assets in Patty gefunden (optional „0€-Positionen einschließen“ aktivieren).',
          );
        }

        const result = await resolvePattyInvestments({
          investments: normalized,
          overrides: useDashboardStore.getState().pattySymbolOverrides,
          existingCatalogAssets: useDashboardStore.getState().catalogAssets,
          onProgress: (done, total, currentName) => {
            setProgress({ done, total, name: currentName });
          },
        });

        const meta = buildPattySyncMeta(sourceType, sourceLabel, result, includeZeroQuantity);
        syncPattyPortfolio({
          folders: result.folders,
          assets: result.assets,
          overrides: result.overrides,
          meta,
          costBasis: includeCostBasis ? result.costBasis : {},
        });

        setLastNormalized(normalized);
        setLastResult(result);
        setLastMeta(meta);
        setShowUnresolved(result.unresolved.length > 0);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Synchronisierung fehlgeschlagen.');
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [includeZeroQuantity, includeCostBasis, syncPattyPortfolio],
  );

  const syncFromRawText = useCallback(
    async (
      rawText: string,
      sourceType: PattySyncMeta['sourceType'],
      sourceLabel: string,
      pin?: string,
    ) => {
      setErrorMsg(null);
      try {
        const workspace = await parsePattyWorkspaceText(rawText, pin);
        setPinPrompt(null);
        setPinInput('');
        await executeSyncFromWorkspace(workspace, sourceType, sourceLabel);
      } catch (err) {
        if (err instanceof PattyPinRequiredError) {
          setPinPrompt({ rawText, sourceType, sourceLabel });
          setPinInput('');
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : 'Patty-Datei konnte nicht gelesen werden.');
      }
    },
    [executeSyncFromWorkspace],
  );

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      await syncFromRawText(text, 'upload', file.name);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Datei konnte nicht gelesen werden.');
    }
  };

  const handleAssignOverride = async (pattyKey: string) => {
    const rawTicker = (overrideInputs[pattyKey] ?? '').trim();
    if (!rawTicker || !isValidTickerSymbol(rawTicker)) {
      setErrorMsg(`Ungültiger Yahoo-Ticker: „${rawTicker}“`);
      return;
    }
    const canonical = resolveCanonicalSymbol(rawTicker);
    setPattySymbolOverride(pattyKey, canonical);

    if (!lastNormalized || !lastMeta) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const updatedOverrides = {
        ...pattySymbolOverrides,
        [pattyKey]: canonical,
      };
      const result = await resolvePattyInvestments({
        investments: lastNormalized,
        overrides: updatedOverrides,
        existingCatalogAssets: catalogAssets,
      });
      const nextMeta = buildPattySyncMeta(
        lastMeta.sourceType,
        lastMeta.sourceLabel,
        result,
        lastMeta.includeZeroQuantity,
      );
      syncPattyPortfolio({
        folders: result.folders,
        assets: result.assets,
        overrides: result.overrides,
        meta: nextMeta,
        costBasis: includeCostBasis ? result.costBasis : {},
      });
      setLastResult(result);
      setLastMeta(nextMeta);
      setOverrideInputs((prev) => {
        const next = { ...prev };
        delete next[pattyKey];
        return next;
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Zuweisung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const browserActiveCount = browserWorkspace?.investments
    ? normalizePattyInvestments(
        browserWorkspace.investments,
        browserWorkspace.rules ?? [],
        includeZeroQuantity,
      ).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Patty Portfolio Synchronisation"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0f1623] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <FolderSync className="h-4 w-4 text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Patty → DashInvest Bookmark-Sync
              </h2>
              <p className="text-[11px] text-slate-400">
                Importiert deine Patty-Assets als Bookmarks in derselben Kategorie- &amp; Unterordnerstruktur
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Patty-Sync schließen"
            disabled={busy}
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
          {pattyLastSync && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <div>
                  <span className="font-semibold">{pattyLastSync.syncedCount} Bookmarks</span>{' '}
                  synchronisiert ({pattyLastSync.sourceLabel}) ·{' '}
                  <span className="text-emerald-300/80">
                    {new Date(pattyLastSync.syncedAt).toLocaleString('de-DE')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  clearPattySync();
                  setLastResult(null);
                  setLastMeta(null);
                }}
                className="flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/25 disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Sync entfernen
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/12 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          {/* Option Toggles */}
          <div className="space-y-1.5">
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              <span>Auch verkaufte / 0€-Positionen einschließen</span>
              <input
                type="checkbox"
                checked={includeZeroQuantity}
                disabled={busy}
                onChange={(e) => setIncludeZeroQuantity(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs text-slate-300">
              <span>
                Einstandskurse für pers. Dividendenrendite (YoC) übernehmen{' '}
                <span className="text-[10.5px] text-slate-500">
                  (nur Stückpreis, keine Stückzahlen/Depotwerte)
                </span>
              </span>
              <input
                type="checkbox"
                checked={includeCostBasis}
                disabled={busy}
                onChange={(e) => setIncludeCostBasis(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950"
              />
            </label>
          </div>

          {/* PIN Prompt when encrypted Patty JSON is selected */}
          {pinPrompt && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void syncFromRawText(
                  pinPrompt.rawText,
                  pinPrompt.sourceType,
                  pinPrompt.sourceLabel,
                  pinInput,
                );
              }}
              className="space-y-2.5 rounded-lg border border-amber-500/45 bg-amber-500/10 p-3"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                Verschlüsseltes Patty-Backup ({pinPrompt.sourceLabel})
              </div>
              <p className="text-[11px] text-slate-300">
                Bitte gib den 6-stelligen Patty-PIN ein, um die Datei zu entschlüsseln:
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-stelliger PIN"
                  className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-slate-950 px-3 py-1.5 font-mono text-xs tracking-widest text-slate-100 outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  disabled={busy || pinInput.length !== 6}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  Entschlüsseln
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinPrompt(null);
                    setPinInput('');
                  }}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}

          {/* Source 1: Browser Live Sync (same-origin localStorage) */}
          {browserWorkspace && (
            <div className="space-y-2 rounded-lg border border-sky-500/35 bg-sky-500/8 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-200">
                    <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                    Patty im Browser (Live erkannt)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {browserActiveCount} relevante Positionen in <code className="text-slate-300">localStorage</code> gefunden
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void executeSyncFromWorkspace(browserWorkspace, 'browser', 'Patty Browser Live')
                  }
                  className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
                >
                  Jetzt aus Browser syncen
                </button>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300">
                <input
                  type="checkbox"
                  checked={autoSyncEnabled}
                  disabled={busy}
                  onChange={(e) => handleToggleAutoSync(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                Auto-Sync bei Patty-Änderungen im selben Browser aktivieren
              </label>
            </div>
          )}

          {/* Source 2: Local Stockpicker Folder */}
          {loadingSources ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Suche lokalen Patty-Ordner…
            </div>
          ) : (
            localFile?.found &&
            localFile.content && (() => {
              const updatedMs = localFile.updatedAt ? Date.parse(localFile.updatedAt) : NaN;
              const isOlderBackup =
                Number.isFinite(updatedMs) && Date.now() - updatedMs > 7 * 24 * 60 * 60 * 1000;
              return (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/8 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-200">
                      <HardDrive className="h-3.5 w-3.5 text-amber-400" />
                      <span>Lokales Patty-Backup ({localFile.folderLabel || 'Lokal'})</span>
                      {isOlderBackup && (
                        <span className="rounded border border-amber-400/40 bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-medium text-amber-200">
                          Älteres Backup — ggf. neues Backup in Patty exportieren
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-slate-400">
                      {localFile.filename}
                      {localFile.updatedAt &&
                        ` · ${new Date(localFile.updatedAt).toLocaleString('de-DE')}`}
                      {localFile.encrypted ? ' · PIN-geschützt' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void syncFromRawText(
                        localFile.content!,
                        'local-file',
                        localFile.filename ?? 'patty-workspace.json',
                      )
                    }
                    className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    Aus lokalem Ordner syncen
                  </button>
                </div>
              );
            })()
          )}

          {/* Source 3: Universal JSON File Upload */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFileUpload(file);
            }}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-5 text-center transition ${
              dragOver
                ? 'border-amber-400 bg-amber-500/12'
                : 'border-slate-700/80 bg-slate-900/40 hover:border-amber-500/50 hover:bg-slate-900/70'
            }`}
          >
            <Upload className="h-5 w-5 text-amber-400" />
            <div className="text-xs font-semibold text-slate-200">
              Patty Workspace-Datei (.json) hier ablegen oder auswählen
            </div>
            <div className="text-[11px] text-slate-400">
              Unterstützt unverschlüsselte und 6-stellige PIN-verschlüsselte Exporte aus Patty
            </div>
            <input
              type="file"
              aria-label="Patty Workspace-Datei auswählen"
              accept=".json,application/json,text/plain"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
                e.target.value = '';
              }}
              className="sr-only"
            />
          </label>

          {/* Progress Bar */}
          {progress && (
            <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 truncate">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />
                  <span className="truncate">
                    Auflösung {progress.done} / {progress.total} — {progress.name}
                  </span>
                </span>
                <span className="font-mono-num text-[11px] text-slate-400">
                  {Math.round((progress.done / Math.max(1, progress.total)) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{
                    width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Sync Report & Unresolved Overrides */}
          {lastResult && lastMeta && (
            <div className="space-y-2.5 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 font-semibold text-emerald-300">
                  {lastResult.assets.length} Bookmarks synchronisiert
                </span>
                <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-2.5 py-0.5 font-semibold text-sky-300">
                  {lastResult.folders.length} Ordner
                </span>
                {lastResult.unresolved.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowUnresolved((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-semibold text-amber-300 hover:bg-amber-500/25"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {lastResult.unresolved.length} nicht aufgelöst
                  </button>
                )}
              </div>

              {showUnresolved && lastResult.unresolved.length > 0 && (
                <div className="max-h-52 space-y-1.5 overflow-y-auto border-t border-slate-800 pt-2">
                  <div className="text-[10.5px] text-slate-400">
                    Optional kannst du fehlenden Assets (z. B. Derivaten) manuell einen Yahoo-Ticker zuweisen:
                  </div>
                  {lastResult.unresolved.map((item) => (
                    <div
                      key={item.pattyKey}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/70 px-2.5 py-1.5 text-[11px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-200">
                          {item.displayName}
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {item.category} / {item.subcategory}
                          {item.isin ? ` · ${item.isin}` : ''} · {item.reason}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          type="text"
                          value={overrideInputs[item.pattyKey] ?? ''}
                          onChange={(e) =>
                            setOverrideInputs((prev) => ({
                              ...prev,
                              [item.pattyKey]: e.target.value,
                            }))
                          }
                          placeholder="Ticker (z. B. SAP.DE)"
                          aria-label={`Ticker für ${item.displayName}`}
                          className="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          disabled={busy || !(overrideInputs[item.pattyKey] ?? '').trim()}
                          onClick={() => void handleAssignOverride(item.pattyKey)}
                          className="inline-flex items-center gap-1 rounded bg-sky-500/20 px-2 py-1 text-[10.5px] font-semibold text-sky-200 hover:bg-sky-500/30 disabled:opacity-40"
                        >
                          <Link2 className="h-3 w-3" />
                          Zuweisen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-800 px-4 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-3.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
