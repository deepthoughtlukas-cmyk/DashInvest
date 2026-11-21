import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type {
  AssetCandlesResponse,
  AssetId,
  ElliottDegree,
  MacroOverview,
  QuoteSummary,
  Timeframe,
} from '../../shared/types.ts';
import { ASSET_META } from '../../shared/types.ts';
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

export function useMacroOverviewQuery(refetchIntervalMs = 120_000) {
  return useQuery({
    queryKey: ['macro', 'overview'],
    queryFn: () => fetchJson<MacroOverview>('/api/macro/overview'),
    refetchInterval: refetchIntervalMs,
    staleTime: 60_000,
  });
}

export function useAssetCandlesQuery(
  assetId: AssetId,
  timeframe: Timeframe,
  refetchIntervalMs = 60_000,
) {
  return useQuery({
    queryKey: ['market', 'candles', assetId, timeframe],
    queryFn: () =>
      fetchJson<AssetCandlesResponse>(
        `/api/market/candles/${assetId}?tf=${encodeURIComponent(timeframe)}`,
      ),
    refetchInterval: refetchIntervalMs,
    staleTime: 25_000,
  });
}

const CORE_ASSETS: AssetId[] = ['GOLD', 'SILVER', 'SP500', 'NASDAQ100'];

export function useDashboardIntelligence(
  activeAsset: AssetId,
  activeTimeframe: Timeframe,
  elliottDegree: ElliottDegree,
  refetchIntervalMs: number,
) {
  const quotesQuery = useQuotesQuery(refetchIntervalMs);
  const macroQuery = useMacroOverviewQuery(Math.max(refetchIntervalMs, 120_000));

  // Fetch daily candles for all 4 core assets for cross-asset Signal Matrix & Macro Prose
  const dailyQueries = useQueries({
    queries: CORE_ASSETS.map((id) => ({
      queryKey: ['market', 'candles', id, '1d'],
      queryFn: () => fetchJson<AssetCandlesResponse>(`/api/market/candles/${id}?tf=1d`),
      refetchInterval: refetchIntervalMs,
      staleTime: 45_000,
    })),
  });

  const activeCandlesQuery = useAssetCandlesQuery(
    activeAsset,
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
      map.set(q.id, q);
    }
    return map;
  }, [quotesQuery.data]);

  const dailyAnalyses = useMemo(() => {
    const map: Partial<Record<AssetId, FullAssetAnalysis>> = {};
    CORE_ASSETS.forEach((id, idx) => {
      const candles = dailyQueries[idx]?.data?.candles;
      if (candles && candles.length > 0) {
        map[id] = runFullAssetAnalysis(id, candles, macroQuery.data, '1d', elliottDegree);
      }
    });
    return map;
  }, [dailyQueries, macroQuery.data, elliottDegree]);

  const activeAnalysis: FullAssetAnalysis | null = useMemo(() => {
    const candles = activeCandlesQuery.data?.candles;
    if (!candles || candles.length === 0) return null;
    return runFullAssetAnalysis(
      activeAsset,
      candles,
      macroQuery.data,
      activeTimeframe,
      elliottDegree,
    );
  }, [activeAsset, activeCandlesQuery.data, macroQuery.data, activeTimeframe, elliottDegree]);

  const macroProseReport: ProseReport | null = useMemo(() => {
    if (!macroQuery.data || !macroRegime) return null;
    const summaries: AssetQuickSummary[] = CORE_ASSETS.map((id) => {
      const q = quoteMap.get(id) ?? dailyQueries[CORE_ASSETS.indexOf(id)]?.data?.quote;
      const an = dailyAnalyses[id];
      return {
        assetId: id,
        name: ASSET_META[id].shortName,
        price: q?.price ?? an?.latestPrice ?? 0,
        changePercent: q?.changePercent ?? 0,
        confluence: an?.scores.confluence ?? 0,
        bias: an?.scores.bias ?? 'Neutral',
      };
    });
    return generateMacroProseReport(macroQuery.data, macroRegime, summaries);
  }, [macroQuery.data, macroRegime, quoteMap, dailyQueries, dailyAnalyses]);

  const assetProseReport: ProseReport | null = useMemo(() => {
    if (!activeAnalysis) return null;
    const quote = activeCandlesQuery.data?.quote ?? quoteMap.get(activeAsset);
    return generateAssetProseReport(
      ASSET_META[activeAsset].name,
      activeTimeframe,
      quote,
      activeAnalysis,
      macroRegime,
    );
  }, [activeAnalysis, activeCandlesQuery.data?.quote, quoteMap, activeAsset, activeTimeframe, macroRegime]);

  return {
    quotesQuery,
    macroQuery,
    activeCandlesQuery,
    quoteMap,
    macroRegime,
    dailyAnalyses,
    activeAnalysis,
    macroProseReport,
    assetProseReport,
  };
}
