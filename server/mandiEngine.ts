import type {
  MandiDashboardResponse,
  MandiLocation,
  MandiMarketComparison,
  MandiPricePoint,
} from '../src/types/agri.ts';

export const MANDI_LOCATIONS: MandiLocation[] = [
  {
    id: 'azadpur',
    name: 'Azadpur APMC Mandi',
    state: 'Delhi',
    district: 'North Delhi',
    lat: 28.7155,
    lng: 77.1763,
    type: 'Terminal Market',
  },
  {
    id: 'lasalgaon',
    name: 'Lasalgaon APMC Yard',
    state: 'Maharashtra',
    district: 'Nashik',
    lat: 20.1419,
    lng: 74.2361,
    type: 'Primary APMC',
  },
  {
    id: 'indore',
    name: 'Indore Krishi Upaj Mandi',
    state: 'Madhya Pradesh',
    district: 'Indore',
    lat: 22.6852,
    lng: 75.8707,
    type: 'Primary APMC',
  },
  {
    id: 'karnal',
    name: 'Karnal Grain Market',
    state: 'Haryana',
    district: 'Karnal',
    lat: 29.6857,
    lng: 76.9905,
    type: 'Cooperative Yard',
  },
  {
    id: 'kolar',
    name: 'Kolar APMC Tomato Market',
    state: 'Karnataka',
    district: 'Kolar',
    lat: 13.1367,
    lng: 78.1292,
    type: 'Primary APMC',
  },
  {
    id: 'guntur',
    name: 'Guntur Agricultural Yard',
    state: 'Andhra Pradesh',
    district: 'Guntur',
    lat: 16.3067,
    lng: 80.4365,
    type: 'Terminal Market',
  },
  {
    id: 'rajkot',
    name: 'Rajkot Bedi Marketing Yard',
    state: 'Gujarat',
    district: 'Rajkot',
    lat: 22.3338,
    lng: 70.8224,
    type: 'Cooperative Yard',
  },
  {
    id: 'pune',
    name: 'Pune Gultekdi Market Yard',
    state: 'Maharashtra',
    district: 'Pune',
    lat: 18.4904,
    lng: 73.8698,
    type: 'Terminal Market',
  },
];

interface CommodityProfile {
  name: string;
  basePrice: number;
  volatility: number;
  seasonalAmp: number;
  trendBias: number;
  baseArrivals: number;
}

const COMMODITY_PROFILES: Record<string, CommodityProfile> = {
  Tomato: { name: 'Tomato', basePrice: 2450, volatility: 0.085, seasonalAmp: 240, trendBias: 14, baseArrivals: 420 },
  Onion: { name: 'Onion', basePrice: 2890, volatility: 0.07, seasonalAmp: 190, trendBias: 18, baseArrivals: 680 },
  Wheat: { name: 'Wheat', basePrice: 2425, volatility: 0.022, seasonalAmp: 55, trendBias: 4, baseArrivals: 1150 },
  'Paddy (Basmati)': { name: 'Paddy (Basmati)', basePrice: 3820, volatility: 0.032, seasonalAmp: 95, trendBias: 9, baseArrivals: 890 },
  Soybean: { name: 'Soybean', basePrice: 4680, volatility: 0.04, seasonalAmp: 110, trendBias: -6, baseArrivals: 540 },
  Cotton: { name: 'Cotton', basePrice: 7150, volatility: 0.035, seasonalAmp: 160, trendBias: 11, baseArrivals: 470 },
  Mustard: { name: 'Mustard', basePrice: 5640, volatility: 0.028, seasonalAmp: 120, trendBias: 7, baseArrivals: 390 },
  Potato: { name: 'Potato', basePrice: 1780, volatility: 0.055, seasonalAmp: 130, trendBias: -4, baseArrivals: 760 },
};

export const COMMODITIES = Object.keys(COMMODITY_PROFILES);

let refreshRevision = 0;
let lastRefreshedAt = new Date().toISOString();

function deterministicNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function hashKey(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildHistoricalAndForecast(
  commodity: string,
  mandi: MandiLocation,
  revision: number
): {
  series: MandiPricePoint[];
  currentModalPrice: number;
  priceChange7dPct: number;
  forecast7dPrice: number;
  forecast14dPrice: number;
  forecastDeltaPct: number;
  volatilityPct: number;
  arrivalsTonnes: number;
  sellSignal: 'Sell Now' | 'Hold 5-7 Days' | 'Staggered Sale';
  bestSellWindow: string;
} {
  const profile = COMMODITY_PROFILES[commodity] ?? COMMODITY_PROFILES.Tomato;
  const mandiSeed = hashKey(`${commodity}:${mandi.id}`);
  const regionalFactor = 0.92 + ((mandiSeed % 17) / 100);
  const regionalTrend = ((mandiSeed % 9) - 4) * 3.5;
  const tickJitter = deterministicNoise(mandiSeed + revision * 7) * profile.basePrice * 0.012;

  const historyDays = 30;
  const forecastDays = 14;
  const today = new Date();
  const historicalPrices: number[] = [];
  const dates: string[] = [];

  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));

    const t = historyDays - 1 - i;
    const seasonal = Math.sin((t + (mandiSeed % 7)) * (Math.PI / 7)) * profile.seasonalAmp * 0.45;
    const trend = (profile.trendBias + regionalTrend) * (t - 15) * 0.45;
    const noise = deterministicNoise(mandiSeed + t * 13 + revision) * profile.basePrice * profile.volatility * 0.42;
    const raw = profile.basePrice * regionalFactor + seasonal + trend + noise + (i === 0 ? tickJitter : 0);
    historicalPrices.push(Math.max(450, Math.round(raw)));
  }

  // Holt double-exponential smoothing + 7-day seasonal residual for forecast
  const alpha = 0.42;
  const beta = 0.22;
  let level = historicalPrices[0];
  let slope = (historicalPrices[6] - historicalPrices[0]) / 6;

  for (let i = 1; i < historicalPrices.length; i += 1) {
    const prevLevel = level;
    level = alpha * historicalPrices[i] + (1 - alpha) * (level + slope);
    slope = beta * (level - prevLevel) + (1 - beta) * slope;
  }

  // Compute historical residual std-dev for calibrated confidence bands
  const recentWindow = historicalPrices.slice(-14);
  const meanRecent = recentWindow.reduce((acc, v) => acc + v, 0) / recentWindow.length;
  const variance =
    recentWindow.reduce((acc, v) => acc + (v - meanRecent) ** 2, 0) / recentWindow.length;
  const residualStd = Math.max(Math.sqrt(variance), profile.basePrice * 0.018);

  const series: MandiPricePoint[] = historicalPrices.map((price, idx) => ({
    date: dates[idx],
    modalPrice: price,
    forecastPrice: idx === historicalPrices.length - 1 ? price : null,
    lowerBand80: idx === historicalPrices.length - 1 ? price : null,
    upperBand80: idx === historicalPrices.length - 1 ? price : null,
    lowerBand95: idx === historicalPrices.length - 1 ? price : null,
    upperBand95: idx === historicalPrices.length - 1 ? price : null,
    isForecast: false,
  }));

  let forecast7dPrice = historicalPrices[historicalPrices.length - 1];
  let forecast14dPrice = historicalPrices[historicalPrices.length - 1];

  for (let h = 1; h <= forecastDays; h += 1) {
    const fd = new Date(today);
    fd.setDate(today.getDate() + h);
    const weeklyCycle = Math.sin((historyDays + h + (mandiSeed % 7)) * (Math.PI / 7)) * profile.seasonalAmp * 0.3;
    const dampedSlope = slope * Math.pow(0.93, h);
    const point = Math.max(450, Math.round(level + dampedSlope * h + weeklyCycle));
    const horizonSpread = residualStd * Math.sqrt(h / 2.2);

    if (h === 7) forecast7dPrice = point;
    if (h === 14) forecast14dPrice = point;

    series.push({
      date: fd.toISOString().slice(0, 10),
      modalPrice: null,
      forecastPrice: point,
      lowerBand80: Math.max(300, Math.round(point - 1.28 * horizonSpread)),
      upperBand80: Math.round(point + 1.28 * horizonSpread),
      lowerBand95: Math.max(250, Math.round(point - 1.96 * horizonSpread)),
      upperBand95: Math.round(point + 1.96 * horizonSpread),
      isForecast: true,
    });
  }

  const currentModalPrice = historicalPrices[historicalPrices.length - 1];
  const price7dAgo = historicalPrices[historicalPrices.length - 8];
  const priceChange7dPct = Number((((currentModalPrice - price7dAgo) / price7dAgo) * 100).toFixed(1));
  const forecastDeltaPct = Number((((forecast14dPrice - currentModalPrice) / currentModalPrice) * 100).toFixed(1));
  const volatilityPct = Number(((residualStd / meanRecent) * 100).toFixed(1));

  let sellSignal: 'Sell Now' | 'Hold 5-7 Days' | 'Staggered Sale' = 'Staggered Sale';
  let bestSellWindow = 'Split lots across Days 4-10';
  if (forecastDeltaPct >= 3.2) {
    sellSignal = 'Hold 5-7 Days';
    bestSellWindow = 'Days 7-12 (upward trend)';
  } else if (forecastDeltaPct <= -1.5) {
    sellSignal = 'Sell Now';
    bestSellWindow = 'Immediate (next 48 hrs)';
  }

  const arrivalsTonnes = Math.round(
    profile.baseArrivals * (0.75 + ((mandiSeed % 9) * 0.08)) * (1 + deterministicNoise(revision + mandiSeed) * 0.1)
  );

  return {
    series,
    currentModalPrice,
    priceChange7dPct,
    forecast7dPrice,
    forecast14dPrice,
    forecastDeltaPct,
    volatilityPct,
    arrivalsTonnes,
    sellSignal,
    bestSellWindow,
  };
}

export function getMandiDashboard(
  commodityParam?: string,
  mandiIdParam?: string,
  forceRefresh?: boolean
): MandiDashboardResponse {
  if (forceRefresh) {
    refreshRevision += 1;
    lastRefreshedAt = new Date().toISOString();
  }

  const commodity = COMMODITY_PROFILES[commodityParam ?? ''] ? (commodityParam as string) : 'Tomato';
  const selectedMandi = MANDI_LOCATIONS.find((m) => m.id === mandiIdParam) ?? MANDI_LOCATIONS[0];

  const primary = buildHistoricalAndForecast(commodity, selectedMandi, refreshRevision);

  const comparisons: MandiMarketComparison[] = MANDI_LOCATIONS.map((mandi) => {
    const stats = buildHistoricalAndForecast(commodity, mandi, refreshRevision);
    return {
      mandiId: mandi.id,
      mandiName: mandi.name,
      state: mandi.state,
      lat: mandi.lat,
      lng: mandi.lng,
      currentModalPrice: stats.currentModalPrice,
      minPrice: Math.round(stats.currentModalPrice * 0.89),
      maxPrice: Math.round(stats.currentModalPrice * 1.09),
      arrivalsTonnes: stats.arrivalsTonnes,
      forecast7dPrice: stats.forecast7dPrice,
      forecast14dPrice: stats.forecast14dPrice,
      expectedDeltaPct: stats.forecastDeltaPct,
      recommendation: stats.sellSignal,
    };
  }).sort((a, b) => b.currentModalPrice - a.currentModalPrice);

  return {
    commodity,
    unit: '₹ / Quintal (100 kg)',
    selectedMandi,
    mandis: MANDI_LOCATIONS,
    commodities: COMMODITIES,
    lastRefreshedAt,
    currentModalPrice: primary.currentModalPrice,
    priceChange7dPct: primary.priceChange7dPct,
    forecast14dPrice: primary.forecast14dPrice,
    forecastDeltaPct: primary.forecastDeltaPct,
    volatilityPct: primary.volatilityPct,
    bestSellWindow: primary.bestSellWindow,
    sellSignal: primary.sellSignal,
    series: primary.series,
    comparisons,
  };
}
