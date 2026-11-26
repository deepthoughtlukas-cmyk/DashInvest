import { useMemo, useRef } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { inferAssetClass, resolveCanonicalSymbol } from '../../shared/catalog.ts';
import type {
  AssetClass,
  Candle,
  CatalogAsset,
  ElliottDegree,
  MacroOverview,
  QuoteSummary,
  Timeframe,
} from '../../shared/types.ts';
import {
  collectBookmarkedSignals,
  evaluateMacroRegime,
  runFullAssetAnalysis,
  type BookmarkedSignalEvent,
  type FullAssetAnalysis,
  type MacroRegimeEvaluation,
} from '../engine/signals.ts';
import {
  generateAssetProseReport,
  generateMacroProseReport,
  type AssetQuickSummary,
  type ProseReport,
} from '../engine/proseAnalysis.ts';
import {
  fetchAssetCandlesApi,
  fetchAssetFundamentalsApi,
  fetchBookmarkDailyCandlesApi,
  fetchMacroOverviewApi,
  fetchQuotesApi,
  fetchSymbolSearchApi,
} from '../services/apiClient.ts';

export function useQuotesQuery(refetchIntervalMs = 60_000) {
  return useQuery({
    queryKey: ['market', 'quotes'],
    queryFn: () => fetchQuotesApi(),
    refetchInterval: refetchIntervalMs,
    staleTime: 25_000,
  });
}

export function useBatchQuotesQuery(symbols: string[], refetchIntervalMs = 60_000) {
  const normalized = useMemo(
    () => Array.from(new Set(symbols.map((s) => resolveCanonicalSymbol(s)))).slice(0, 250),
    [symbols],
  );
  const queryParam = normalized.join(',');

  return useQuery({
    queryKey: ['market', 'quotes', 'batch', queryParam],
    queryFn: () => fetchQuotesApi(normalized),
    enabled: normalized.length > 0,
    refetchInterval: refetchIntervalMs,
    staleTime: 30_000,
  });
}

export function useSymbolSearchQuery(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['market', 'search', trimmed],
    queryFn: () => fetchSymbolSearchApi(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useMacroOverviewQuery(refetchIntervalMs = 120_000) {
  return useQuery({
    queryKey: ['macro', 'overview'],
    queryFn: () => fetchMacroOverviewApi(),
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
    queryFn: () => fetchAssetCandlesApi(symbol, timeframe),
    enabled: symbol.length > 0,
    refetchInterval: refetchIntervalMs,
    staleTime: 25_000,
  });
}

export function useAssetFundamentalsQuery(symbolOrId: string, enabled = true) {
  const symbol = resolveCanonicalSymbol(symbolOrId);
  return useQuery({
    queryKey: ['market', 'fundamentals', symbol],
    queryFn: () => fetchAssetFundamentalsApi(symbol),
    enabled: enabled && symbol.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

export function useFxRateQuery(fxSymbol: string | null) {
  return useQuery({
    queryKey: ['market', 'fx', fxSymbol],
    queryFn: async () => {
      if (!fxSymbol) return null;
      const res = await fetchQuotesApi([fxSymbol]);
      return res.quotes[0]?.price ?? null;
    },
    enabled: Boolean(fxSymbol),
    staleTime: 15 * 60_000,
    retry: 1,
  });
}

const assetAnalysisCache = new WeakMap<Candle[], Map<string, FullAssetAnalysis>>();

export function getCachedFullAssetAnalysis(
  symbol: string,
  candles: Candle[],
  macro: MacroOverview | undefined,
  timeframe: Timeframe,
  elliottDegree: ElliottDegree,
  assetClass: AssetClass,
  precomputedMacroRegime?: MacroRegimeEvaluation | null,
): FullAssetAnalysis {
  let byKey = assetAnalysisCache.get(candles);
  if (!byKey) {
    byKey = new Map<string, FullAssetAnalysis>();
    assetAnalysisCache.set(candles, byKey);
  }
  const cacheKey = `${symbol}|${timeframe}|${elliottDegree}|${assetClass}|${macro?.updatedAt ?? 'none'}`;
  const cached = byKey.get(cacheKey);
  if (cached) return cached;

  const computed = runFullAssetAnalysis(
    symbol,
    candles,
    macro,
    timeframe,
    elliottDegree,
    assetClass,
    precomputedMacroRegime,
  );
  byKey.set(cacheKey, computed);
  return computed;
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

  const bookmarkedAssets = useMemo(
    () => catalogAssets.filter((a) => a.bookmarked),
    [catalogAssets],
  );

  // Focus assets for Signal Matrix & Macro Cross-Asset Prose: up to 6 bookmarked assets (or first 6 catalog items)
  const focusAssets = useMemo(() => {
    const base = bookmarkedAssets.length > 0 ? bookmarkedAssets : catalogAssets;
    return base.slice(0, 6);
  }, [bookmarkedAssets, catalogAssets]);

  // Track daily data for ALL bookmarked assets (no 6-asset cap) so the 7-day signal widget covers every bookmark
  const dailyTrackedAssets = useMemo(
    () => (bookmarkedAssets.length > 0 ? bookmarkedAssets : focusAssets),
    [bookmarkedAssets, focusAssets],
  );

  const largePortfolio = dailyTrackedAssets.length > 15;

  const dailyCombined = useQueries({
    queries: dailyTrackedAssets.map((item) => ({
      queryKey: ['market', 'candles', item.symbol, '1d'],
      queryFn: () => fetchBookmarkDailyCandlesApi(item.symbol),
      refetchInterval: largePortfolio
        ? Math.max(refetchIntervalMs, 10 * 60_000)
        : refetchIntervalMs,
      staleTime: largePortfolio ? 10 * 60_000 : 45_000,
      gcTime: largePortfolio ? 30 * 60_000 : 5 * 60_000,
      refetchOnReconnect: !largePortfolio,
      retry: 1,
    })),
    combine: (results) => {
      let signature = '';
      let anyLoading = false;
      const candlesBySymbol: Record<string, Candle[]> = {};
      const quotesBySymbol: Record<string, QuoteSummary> = {};

      for (let i = 0; i < dailyTrackedAssets.length; i++) {
        const sym = dailyTrackedAssets[i].symbol;
        const res = results[i];
        if (res?.isLoading) anyLoading = true;
        if (res?.data?.candles && res.data.candles.length > 0) {
          candlesBySymbol[sym] = res.data.candles;
          if (res.data.quote) quotesBySymbol[sym] = res.data.quote;
          signature += `${sym}:${res.dataUpdatedAt};`;
        }
      }
      return { signature, candlesBySymbol, quotesBySymbol, anyLoading };
    },
  });

  const prevDailyDataRef = useRef<{
    signature: string;
    candlesMap: Record<string, Candle[]>;
    quotesMap: Record<string, QuoteSummary>;
  }>({ signature: '', candlesMap: {}, quotesMap: {} });

  const { dailyCandlesMap, dailyQuotesMap } = useMemo(() => {
    if (prevDailyDataRef.current.signature === dailyCombined.signature) {
      return {
        dailyCandlesMap: prevDailyDataRef.current.candlesMap,
        dailyQuotesMap: prevDailyDataRef.current.quotesMap,
      };
    }
    prevDailyDataRef.current = {
      signature: dailyCombined.signature,
      candlesMap: dailyCombined.candlesBySymbol,
      quotesMap: dailyCombined.quotesBySymbol,
    };
    return {
      dailyCandlesMap: dailyCombined.candlesBySymbol,
      dailyQuotesMap: dailyCombined.quotesBySymbol,
    };
  }, [dailyCombined.signature, dailyCombined.candlesBySymbol, dailyCombined.quotesBySymbol]);

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
    const analysesMap: Record<string, FullAssetAnalysis> = {};
    for (const item of dailyTrackedAssets) {
      const candles = dailyCandlesMap[item.symbol];
      if (candles && candles.length > 0) {
        analysesMap[item.symbol] = getCachedFullAssetAnalysis(
          item.symbol,
          candles,
          macroQuery.data,
          '1d',
          elliottDegree,
          item.assetClass,
          macroRegime,
        );
      }
    }
    return analysesMap;
  }, [dailyTrackedAssets, dailyCandlesMap, macroQuery.data, macroRegime, elliottDegree]);

  const bookmarkedSignals7d: BookmarkedSignalEvent[] = useMemo(
    () => collectBookmarkedSignals(bookmarkedAssets, dailyCandlesMap, dailyAnalyses, 7),
    [bookmarkedAssets, dailyCandlesMap, dailyAnalyses],
  );

  const bookmarkedSignalsLoading =
    bookmarkedAssets.length > 0 &&
    dailyCombined.anyLoading &&
    bookmarkedSignals7d.length === 0;

  const activeCatalogAsset = useMemo(
    () => catalogAssets.find((a) => a.symbol === canonicalActive),
    [catalogAssets, canonicalActive],
  );

  const activeAnalysis: FullAssetAnalysis | null = useMemo(() => {
    const candles = activeCandlesQuery.data?.candles;
    if (!candles || candles.length === 0) return null;
    const assetClass =
      activeCatalogAsset?.assetClass ?? inferAssetClass(canonicalActive);
    return getCachedFullAssetAnalysis(
      canonicalActive,
      candles,
      macroQuery.data,
      activeTimeframe,
      elliottDegree,
      assetClass,
      macroRegime,
    );
  }, [
    canonicalActive,
    activeCatalogAsset,
    activeCandlesQuery.data,
    macroQuery.data,
    macroRegime,
    activeTimeframe,
    elliottDegree,
  ]);

  const macroProseReport: ProseReport | null = useMemo(() => {
    if (!macroQuery.data || !macroRegime) return null;
    const summaries: AssetQuickSummary[] = focusAssets.map((item) => {
      const q = quoteMap.get(item.symbol) ?? dailyQuotesMap[item.symbol];
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
  }, [macroQuery.data, macroRegime, focusAssets, quoteMap, dailyQuotesMap, dailyAnalyses]);

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
    bookmarkedAssets,
    bookmarkedSignals7d,
    bookmarkedSignalsLoading,
    dailyAnalyses,
    activeAnalysis,
    macroProseReport,
    assetProseReport,
  };
}
