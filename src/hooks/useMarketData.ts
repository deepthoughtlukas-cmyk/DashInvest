import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { inferAssetClass, resolveCanonicalSymbol } from '../../shared/catalog.ts';
import type {
  AssetCandlesResponse,
  CatalogAsset,
  ElliottDegree,
  MacroOverview,
  QuoteSummary,
  SymbolSearchResult,
  Timeframe,
} from '../../shared/types.ts';
import {
  evaluateMacroRegime,
  runFullAssetAnalysis,
  type FullAssetAnalysis,
  type MacroRegimeEvaluation,
} from '../engine/signals.ts';
import {
  generateAssetProseReport,
  generateMacroProseReport,
  type AssetQuickSummary,
  type ProseReport,
} from '../engine/proseAnalysis.ts';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) msg = errBody.error;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export function useQuotesQuery(refetchIntervalMs = 60_000) {
  return useQuery({
    queryKey: ['market', 'quotes'],
    queryFn: () =>
      fetchJson<{ quotes: QuoteSummary[]; updatedAt: string }>('/api/market/quotes'),
    refetchInterval: refetchIntervalMs,
    staleTime: 25_000,
  });
}

export function useBatchQuotesQuery(symbols: string[], refetchIntervalMs = 60_000) {
  const normalized = useMemo(
    () => Array.from(new Set(symbols.map((s) => resolveCanonicalSymbol(s)))).slice(0, 45),
    [symbols],
  );
  const queryParam = normalized.join(',');

  return useQuery({
    queryKey: ['market', 'quotes', 'batch', queryParam],
    queryFn: () =>
      fetchJson<{ quotes: QuoteSummary[]; failed?: string[]; updatedAt: string }>(
        `/api/market/quotes?symbols=${encodeURIComponent(queryParam)}`,
      ),
    enabled: normalized.length > 0,
    refetchInterval: refetchIntervalMs,
    staleTime: 30_000,
  });
}

export function useSymbolSearchQuery(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['market', 'search', trimmed],
    queryFn: () =>
      fetchJson<{ query: string; results: SymbolSearchResult[] }>(
        `/api/market/search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useMacroOverviewQuery(refetchIntervalMs = 120_000) {
  return useQuery({
    queryKey: ['macro', 'overview'],
    queryFn: () => fetchJson<MacroOverview>('/api/macro/overview'),
    refetchInterval: refetchIntervalMs,
    staleTime: 60_000,
  });
}

export function useAssetCandlesQuery(
  symbolOrId: string,
  timeframe: Timeframe,
  refetchIntervalMs = 60_000,
) {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  return useQuery({
    queryKey: ['market', 'candles', symbol, timeframe],
    queryFn: () =>
      fetchJson<AssetCandlesResponse>(
        `/api/market/candles?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(timeframe)}`,
      ),
    enabled: symbol.length > 0,
    refetchInterval: refetchIntervalMs,
    staleTime: 25_000,
  });
}

export function useDashboardIntelligence(
  activeSymbol: string,
  catalogAssets: CatalogAsset[],
  activeTimeframe: Timeframe,
  elliottDegree: ElliottDegree,
  refetchIntervalMs: number,
) {
  const canonicalActive = resolveCanonicalSymbol(activeSymbol);

  // Batch fetch quotes for all catalog items + active symbol
  const allSymbols = useMemo(() => {
    const list = catalogAssets.map((a) => a.symbol);
    if (!list.includes(canonicalActive)) list.unshift(canonicalActive);
    return list;
  }, [catalogAssets, canonicalActive]);

  const quotesQuery = useBatchQuotesQuery(allSymbols, refetchIntervalMs);
  const macroQuery = useMacroOverviewQuery(Math.max(refetchIntervalMs, 120_000));

  // Focus assets for Signal Matrix & Macro Cross-Asset Prose: up to 6 bookmarked assets (or first 4 catalog items)
  const focusAssets = useMemo(() => {
    const bookmarked = catalogAssets.filter((a) => a.bookmarked);
    const base = bookmarked.length > 0 ? bookmarked : catalogAssets;
    return base.slice(0, 6);
  }, [catalogAssets]);

  const dailyQueries = useQueries({
    queries: focusAssets.map((item) => ({
      queryKey: ['market', 'candles', item.symbol, '1d'],
      queryFn: () =>
        fetchJson<AssetCandlesResponse>(
          `/api/market/candles?symbol=${encodeURIComponent(item.symbol)}&tf=1d`,
        ),
      refetchInterval: refetchIntervalMs,
      staleTime: 45_000,
    })),
  });

  const activeCandlesQuery = useAssetCandlesQuery(
    canonicalActive,
    activeTimeframe,
    refetchIntervalMs,
  );

  const macroRegime: MacroRegimeEvaluation | null = useMemo(() => {
    if (!macroQuery.data) return null;
    return evaluateMacroRegime(macroQuery.data);
  }, [macroQuery.data]);

  const quoteMap = useMemo(() => {
    const map = new Map<string, QuoteSummary>();
    for (const q of quotesQuery.data?.quotes ?? []) {
      map.set(q.symbol, q);
      map.set(q.id, q);
    }
    return map;
  }, [quotesQuery.data]);

  const dailyAnalyses = useMemo(() => {
    const map: Record<string, FullAssetAnalysis> = {};
    focusAssets.forEach((item, idx) => {
      const candles = dailyQueries[idx]?.data?.candles;
      if (candles && candles.length > 0) {
        map[item.symbol] = runFullAssetAnalysis(
          item.symbol,
          candles,
          macroQuery.data,
          '1d',
          elliottDegree,
          item.assetClass,
        );
      }
    });
    return map;
  }, [focusAssets, dailyQueries, macroQuery.data, elliottDegree]);

  const activeCatalogAsset = useMemo(
    () => catalogAssets.find((a) => a.symbol === canonicalActive),
    [catalogAssets, canonicalActive],
  );

  const activeAnalysis: FullAssetAnalysis | null = useMemo(() => {
    const candles = activeCandlesQuery.data?.candles;
    if (!candles || candles.length === 0) return null;
    const assetClass =
      activeCatalogAsset?.assetClass ?? inferAssetClass(canonicalActive);
    return runFullAssetAnalysis(
      canonicalActive,
      candles,
      macroQuery.data,
      activeTimeframe,
      elliottDegree,
      assetClass,
    );
  }, [
    canonicalActive,
    activeCatalogAsset,
    activeCandlesQuery.data,
    macroQuery.data,
    activeTimeframe,
    elliottDegree,
  ]);

  const macroProseReport: ProseReport | null = useMemo(() => {
    if (!macroQuery.data || !macroRegime) return null;
    const summaries: AssetQuickSummary[] = focusAssets.map((item, idx) => {
      const q = quoteMap.get(item.symbol) ?? dailyQueries[idx]?.data?.quote;
      const an = dailyAnalyses[item.symbol];
      return {
        assetId: item.symbol,
        name: item.shortName,
        price: q?.price ?? an?.latestPrice ?? 0,
        changePercent: q?.changePercent ?? 0,
        confluence: an?.scores.confluence ?? 0,
        bias: an?.scores.bias ?? 'Neutral',
      };
    });
    return generateMacroProseReport(macroQuery.data, macroRegime, summaries);
  }, [macroQuery.data, macroRegime, focusAssets, quoteMap, dailyQueries, dailyAnalyses]);

  const assetProseReport: ProseReport | null = useMemo(() => {
    if (!activeAnalysis) return null;
    const quote = activeCandlesQuery.data?.quote ?? quoteMap.get(canonicalActive);
    const displayName =
      activeCatalogAsset?.name ?? quote?.name ?? canonicalActive;
    return generateAssetProseReport(
      displayName,
      activeTimeframe,
      quote,
      activeAnalysis,
      macroRegime,
    );
  }, [
    activeAnalysis,
    activeCandlesQuery.data?.quote,
    quoteMap,
    canonicalActive,
    activeCatalogAsset,
    activeTimeframe,
    macroRegime,
  ]);

  return {
    quotesQuery,
    macroQuery,
    activeCandlesQuery,
    quoteMap,
    macroRegime,
    focusAssets,
    dailyAnalyses,
    activeAnalysis,
    macroProseReport,
    assetProseReport,
  };
}
