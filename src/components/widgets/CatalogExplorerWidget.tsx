import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { resolveCanonicalSymbol } from '../../../shared/catalog.ts';
import type { AssetFolder, CatalogAsset, QuoteSummary } from '../../../shared/types.ts';
import { useDashboardStore } from '../../store/dashboardStore.ts';
import { useSymbolSearchQuery } from '../../hooks/useMarketData.ts';

interface CatalogExplorerWidgetProps {
  quoteMap: Map<string, QuoteSummary>;
  onAssetSelected?: (symbol: string) => void;
}

const fmtPrice = (val: number, decimals = 2) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);

export const CatalogExplorerWidget: React.FC<CatalogExplorerWidgetProps> = ({
  quoteMap,
  onAssetSelected,
}) => {
  const {
    activeSymbol,
    folders,
    catalogAssets,
    setActiveSymbol,
    toggleBookmark,
    addAssetToCatalog,
    removeAssetFromCatalog,
    moveAssetToFolder,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderCollapsed,
    resetCatalogToDefaults,
  } = useDashboardStore();

  const [viewMode, setViewMode] = useState<'folders' | 'bookmarks'>('folders');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Create folder / subfolder inline UI state
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<string>('');

  // Rename folder inline UI state
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Target folder when adding global search result
  const [targetAddFolderId, setTargetAddFolderId] = useState<string>(
    folders[0]?.id ?? 'folder-equities',
  );

  useEffect(() => {
    if (!folders.some((f) => f.id === targetAddFolderId) && folders[0]) {
      setTargetAddFolderId(folders[0].id);
    }
  }, [folders, targetAddFolderId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput.trim()), 260);
    return () => clearTimeout(t);
  }, [searchInput]);

  const searchQuery = useSymbolSearchQuery(debouncedQuery);

  const bookmarkedAssets = useMemo(
    () => catalogAssets.filter((a) => a.bookmarked),
    [catalogAssets],
  );

  const existingSymbolSet = useMemo(
    () => new Set(catalogAssets.map((a) => a.symbol)),
    [catalogAssets],
  );

  const folderPathLabels = useMemo(() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const labels = new Map<string, string>();
    for (const f of folders) {
      const parent = f.parentId ? byId.get(f.parentId) : undefined;
      labels.set(f.id, parent ? `${parent.name} / ${f.name}` : f.name);
    }
    return labels;
  }, [folders]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, AssetFolder[]>();
    for (const f of folders) {
      const key = f.parentId && folders.some((p) => p.id === f.parentId) ? f.parentId : null;
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return map;
  }, [folders]);

  const assetsByFolder = useMemo(() => {
    const map = new Map<string, CatalogAsset[]>();
    for (const a of catalogAssets) {
      const list = map.get(a.folderId) ?? [];
      list.push(a);
      map.set(a.folderId, list);
    }
    return map;
  }, [catalogAssets]);

  const countRecursive = (folderId: string): number => {
    const direct = assetsByFolder.get(folderId)?.length ?? 0;
    const subs = childrenByParent.get(folderId) ?? [];
    return direct + subs.reduce((sum, sub) => sum + countRecursive(sub.id), 0);
  };

  const selectAsset = (symbol: string) => {
    setActiveSymbol(symbol);
    onAssetSelected?.(symbol);
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const createdId = createFolder(trimmed, newFolderParent || null);
    setTargetAddFolderId(createdId);
    setNewFolderName('');
    setNewFolderParent('');
    setCreatingFolder(false);
  };

  const handleRenameSubmit = (e: React.FormEvent, folderId: string) => {
    e.preventDefault();
    if (renameValue.trim()) {
      renameFolder(folderId, renameValue);
    }
    setRenamingFolderId(null);
    setRenameValue('');
  };

  const normalizedFilter = searchInput.trim().toLowerCase();
  const matchingLocalAssets = useMemo(() => {
    if (!normalizedFilter) return [];
    return catalogAssets.filter(
      (a) =>
        a.symbol.toLowerCase().includes(normalizedFilter) ||
        a.name.toLowerCase().includes(normalizedFilter) ||
        a.shortName.toLowerCase().includes(normalizedFilter),
    );
  }, [catalogAssets, normalizedFilter]);

  const renderAssetRow = (asset: CatalogAsset, indentPx = 0) => {
    const isActive = resolveCanonicalSymbol(activeSymbol) === asset.symbol;
    const quote = quoteMap.get(asset.symbol);
    const isUp = (quote?.changePercent ?? 0) >= 0;

    return (
      <div
        key={asset.symbol}
        style={{ paddingLeft: `${Math.max(4, indentPx)}px` }}
        className={`group flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 transition ${
          isActive
            ? 'border-sky-500/60 bg-sky-500/12'
            : 'border-transparent bg-slate-900/40 hover:border-slate-800 hover:bg-slate-900/75'
        }`}
      >
        <button
          type="button"
          onClick={() => selectAsset(asset.symbol)}
          className="widget-no-drag min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-slate-100">
              {asset.shortName}
            </span>
            <span className="font-mono-num shrink-0 rounded bg-slate-800/90 px-1 py-0.2 text-[9.5px] text-slate-400">
              {asset.symbol}
            </span>
          </div>
          {quote ? (
            <div className="font-mono-num mt-0.5 flex items-center gap-1.5 text-[10.5px]">
              <span className="text-slate-300">{fmtPrice(quote.price, asset.decimals)}</span>
              <span className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
                {isUp ? '+' : ''}
                {quote.changePercent.toFixed(2)}%
              </span>
            </div>
          ) : (
            <div className="mt-0.5 truncate text-[10px] text-slate-500">{asset.name}</div>
          )}
        </button>

        <div className="widget-no-drag flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => toggleBookmark(asset.symbol)}
            aria-label={`Bookmark ${asset.shortName}`}
            title={asset.bookmarked ? 'Bookmark entfernen' : 'Als Bookmark merken'}
            className={`rounded p-1 transition ${
              asset.bookmarked
                ? 'text-amber-400 hover:bg-amber-500/15'
                : 'text-slate-600 hover:bg-slate-800 hover:text-amber-300'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${asset.bookmarked ? 'fill-amber-400' : ''}`} />
          </button>

          <select
            aria-label={`Ordner für ${asset.shortName}`}
            title="In Ordner verschieben"
            value={asset.folderId}
            onChange={(e) => moveAssetToFolder(asset.symbol, e.target.value)}
            className="max-w-[74px] truncate rounded border border-slate-800 bg-slate-900/90 px-1 py-0.5 text-[10px] text-slate-400 outline-none focus:border-sky-500"
          >
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {folderPathLabels.get(f.id) ?? f.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => removeAssetFromCatalog(asset.symbol)}
            aria-label={`${asset.shortName} entfernen`}
            title={`${asset.shortName} aus Katalog entfernen`}
            className="rounded p-1 text-slate-600 opacity-70 transition hover:bg-slate-800 hover:text-rose-400 group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  };

  const renderFolderBranch = (folder: AssetFolder, depth = 0): React.ReactNode => {
    const subFolders = childrenByParent.get(folder.id) ?? [];
    const items = assetsByFolder.get(folder.id) ?? [];
    const totalCount = countRecursive(folder.id);
    const isCollapsed = Boolean(folder.collapsed);
    const isRenaming = renamingFolderId === folder.id;

    return (
      <div key={folder.id} className="space-y-1">
        <div
          style={{ paddingLeft: `${depth * 12}px` }}
          className="group flex items-center justify-between gap-1 rounded-md px-1.5 py-1 hover:bg-slate-800/50"
        >
          {isRenaming ? (
            <form
              onSubmit={(e) => handleRenameSubmit(e, folder.id)}
              className="widget-no-drag flex flex-1 items-center gap-1"
            >
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                aria-label="Ordner umbenennen"
                className="min-w-0 flex-1 rounded border border-sky-500/60 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 outline-none"
              />
              <button
                type="submit"
                className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setRenamingFolderId(null)}
                className="rounded px-1 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => toggleFolderCollapsed(folder.id)}
                className="widget-no-drag flex min-w-0 flex-1 items-center gap-1.5 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                )}
                <Folder
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: folder.color ?? '#38bdf8' }}
                />
                <span className="truncate text-xs font-semibold text-slate-200">
                  {folder.name}
                </span>
                <span className="font-mono-num shrink-0 rounded bg-slate-800/80 px-1.5 py-0.2 text-[10px] text-slate-400">
                  {totalCount}
                </span>
              </button>

              <div className="widget-no-drag flex shrink-0 items-center gap-0.5 opacity-80 transition group-hover:opacity-100">
                <button
                  type="button"
                  title="Unterordner erstellen"
                  aria-label={`Unterordner in ${folder.name} erstellen`}
                  onClick={() => {
                    setNewFolderParent(folder.id);
                    setCreatingFolder(true);
                  }}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-700/60 hover:text-sky-300"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="Ordner umbenennen"
                  aria-label={`Ordner ${folder.name} umbenennen`}
                  onClick={() => {
                    setRenamingFolderId(folder.id);
                    setRenameValue(folder.name);
                  }}
                  className="rounded p-0.5 text-slate-400 hover:bg-slate-700/60 hover:text-amber-300"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={folders.length <= 1}
                  title="Ordner löschen (Werte bleiben erhalten)"
                  aria-label={`Ordner ${folder.name} löschen`}
                  onClick={() => deleteFolder(folder.id)}
                  className="rounded p-0.5 text-slate-500 hover:bg-slate-700/60 hover:text-rose-400 disabled:opacity-30"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </>
          )}
        </div>

        {!isCollapsed && (
          <div className="space-y-1">
            {subFolders.map((sub) => renderFolderBranch(sub, depth + 1))}
            {items.map((item) => renderAssetRow(item, (depth + 1) * 10))}
            {subFolders.length === 0 && items.length === 0 && (
              <div
                style={{ paddingLeft: `${(depth + 1) * 14 + 8}px` }}
                className="py-1 text-[10.5px] italic text-slate-600"
              >
                Leerer Ordner
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const rootFolders = childrenByParent.get(null) ?? [];

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      {/* Top Tabs + + Ordner */}
      <div className="widget-no-drag flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/80 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setViewMode('folders')}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition ${
              viewMode === 'folders'
                ? 'bg-sky-500/20 text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="h-3 w-3" />
            Ordner
          </button>
          <button
            type="button"
            onClick={() => setViewMode('bookmarks')}
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 font-medium transition ${
              viewMode === 'bookmarks'
                ? 'bg-amber-500/20 text-amber-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="h-3 w-3" />
            Bookmarks ({bookmarkedAssets.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setNewFolderParent('');
            setCreatingFolder((v) => !v);
          }}
          className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-[11px] font-medium text-slate-300 transition hover:border-sky-500/50 hover:text-sky-200"
        >
          <FolderPlus className="h-3 w-3 text-sky-400" />
          + Ordner
        </button>
      </div>

      {/* Inline Create Folder / Subfolder Bar */}
      {creatingFolder && (
        <form
          onSubmit={handleCreateFolderSubmit}
          className="widget-no-drag space-y-1.5 rounded-lg border border-sky-500/40 bg-slate-900/90 p-2 text-xs"
        >
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Ordnername (z. B. Halbleiter)…"
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none focus:border-sky-500"
          />
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Übergeordneter Ordner"
              value={newFolderParent}
              onChange={(e) => setNewFolderParent(e.target.value)}
              className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-300 outline-none"
            >
              <option value="">(Stammverzeichnis)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  Unterordner in: {folderPathLabels.get(f.id) ?? f.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded bg-sky-500/25 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/35"
            >
              Erstellen
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder(false)}
              className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Search & Global Yahoo Finance Ticker Add */}
      <div className="widget-no-drag relative">
        <Search className="pointer-events-none absolute top-2 left-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Wert suchen oder Ticker hinzufügen (z. B. AMD, DAX)…"
          className="w-full rounded-lg border border-slate-800 bg-slate-950/90 py-1.5 pr-7 pl-8 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-sky-500/70"
        />
        {searchInput && (
          <button
            type="button"
            aria-label="Suche leeren"
            onClick={() => setSearchInput('')}
            className="absolute top-1.5 right-2 rounded p-0.5 text-slate-500 hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Main Scroll Area */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
        {normalizedFilter ? (
          <div className="space-y-2.5">
            {/* Local Matches */}
            <div className="space-y-1">
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                Im Katalog ({matchingLocalAssets.length})
              </div>
              {matchingLocalAssets.length > 0 ? (
                matchingLocalAssets.map((a) => renderAssetRow(a, 4))
              ) : (
                <div className="text-[11px] text-slate-500">Kein Treffer im lokalen Katalog.</div>
              )}
            </div>

            {/* Global Yahoo Search Results */}
            {debouncedQuery.length >= 2 && (
              <div className="space-y-1.5 border-t border-slate-800/80 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-sky-400">
                    Global hinzufügen (Yahoo Finance)
                  </span>
                  <select
                    aria-label="Zielordner für neuen Wert"
                    value={targetAddFolderId}
                    onChange={(e) => setTargetAddFolderId(e.target.value)}
                    className="max-w-[140px] rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-300 outline-none"
                  >
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        → {folderPathLabels.get(f.id) ?? f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {searchQuery.isFetching ? (
                  <div className="text-[11px] text-slate-500">Suche globale Ticker…</div>
                ) : searchQuery.isError ? (
                  <div className="text-[11px] text-rose-400">
                    Suche fehlgeschlagen: {(searchQuery.error as Error).message}
                  </div>
                ) : (searchQuery.data?.results ?? []).length === 0 ? (
                  <div className="text-[11px] text-slate-500">Keine weiteren Ticker gefunden.</div>
                ) : (
                  (searchQuery.data?.results ?? []).map((item) => {
                    const already = existingSymbolSet.has(item.symbol);
                    return (
                      <div
                        key={item.symbol}
                        className="widget-no-drag flex items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-2 py-1.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono-num text-xs font-semibold text-slate-100">
                              {item.symbol}
                            </span>
                            <span className="rounded bg-slate-800 px-1 py-0.2 text-[9.5px] text-slate-400">
                              {item.quoteType}
                            </span>
                            {item.exchange && (
                              <span className="truncate text-[9.5px] text-slate-500">
                                {item.exchange}
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[10.5px] text-slate-400">{item.name}</div>
                        </div>

                        {already ? (
                          <button
                            type="button"
                            onClick={() => {
                              selectAsset(item.symbol);
                              setSearchInput('');
                            }}
                            className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10.5px] font-semibold text-emerald-300"
                          >
                            Öffnen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              addAssetToCatalog({
                                symbol: item.symbol,
                                name: item.name,
                                shortName: item.shortName,
                                assetClass: item.assetClass,
                                unit: item.unit,
                                decimals: item.decimals,
                                exchange: item.exchange,
                                folderId: targetAddFolderId,
                                bookmarked: true,
                              });
                              selectAsset(item.symbol);
                              setSearchInput('');
                            }}
                            className="shrink-0 rounded border border-sky-500/50 bg-sky-500/20 px-2 py-1 text-[10.5px] font-semibold text-sky-200 hover:bg-sky-500/30"
                          >
                            + Hinzufügen
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : viewMode === 'bookmarks' ? (
          <div className="space-y-1">
            {bookmarkedAssets.length > 0 ? (
              bookmarkedAssets.map((a) => renderAssetRow(a, 4))
            ) : (
              <div className="py-4 text-center text-xs text-slate-500">
                Noch keine Bookmarks gesetzt — klicke auf ⭐ bei einem Wert.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5">
            {rootFolders.map((folder) => renderFolderBranch(folder, 0))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="widget-no-drag flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[10.5px] text-slate-500">
        <span>
          {catalogAssets.length} Werte · {folders.length} Ordner
        </span>
        <button
          type="button"
          onClick={resetCatalogToDefaults}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <RotateCcw className="h-3 w-3" />
          Standard
        </button>
      </div>
    </div>
  );
};
