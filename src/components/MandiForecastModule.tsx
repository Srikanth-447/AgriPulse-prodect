import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Navigation, RefreshCw, Search, Sparkles } from 'lucide-react';
import type { MandiDashboardResponse, MandiLocation, MandiPricePoint } from '../types/agri';
import { useMapsConfig } from './MapsWrapper';

interface RouteSummary {
  distanceKm: string;
  durationMins: number;
  originLabel: string;
}

function MandiRouteLayer({
  origin,
  destination,
  onRouteComputed,
  onRouteError,
}: {
  origin: google.maps.LatLngLiteral | null;
  destination: MandiLocation;
  onRouteComputed: (summary: RouteSummary | null) => void;
  onRouteError: (msg: string | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    onRouteError(null);

    if (!routesLib || !map || !origin) {
      onRouteComputed(null);
      return;
    }

    let cancelled = false;
    const request = {
      origin,
      destination: { lat: destination.lat, lng: destination.lng },
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const RouteClass = routesLib.Route as unknown as {
      computeRoutes: (req: unknown) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: google.maps.LatLngBounds;
          createPolylines: () => google.maps.Polyline[];
        }>;
      }>;
    };

    RouteClass.computeRoutes(request)
      .then((res) => {
        if (cancelled) return;
        const primaryRoute = res.routes?.[0];
        if (!primaryRoute) {
          onRouteError('No driving route returned between farm origin and mandi.');
          onRouteComputed(null);
          return;
        }

        const newPolylines = primaryRoute.createPolylines();
        newPolylines.forEach((poly) => {
          poly.setOptions({
            strokeColor: '#15803d',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          });
          poly.setMap(map);
        });
        polylinesRef.current = newPolylines;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const distKm = ((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(1);
        const durMins = Math.round((primaryRoute.durationMillis ?? 0) / 60000);
        onRouteComputed({
          distanceKm: distKm,
          durationMins: durMins,
          originLabel: `${origin.lat.toFixed(2)}, ${origin.lng.toFixed(2)}`,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT') || msg.includes('429')) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onRouteError('Unable to compute route to this mandi. Verify Routes API access or try another origin.');
        onRouteComputed(null);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin, destination, onRouteComputed, onRouteError]);

  return null;
}

function OriginAutocompleteBox({
  onSelectOrigin,
}: {
  onSelectOrigin: (coords: google.maps.LatLngLiteral, label: string) => void;
}) {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!placesLib || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res: { suggestions?: google.maps.places.AutocompleteSuggestion[] }) => {
          if (!cancelled) setSuggestions(res.suggestions ?? []);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, query]);

  const handleChoose = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
      if (place.location) {
        onSelectOrigin(
          { lat: place.location.lat(), lng: place.location.lng() },
          place.displayName || place.formattedAddress || query
        );
        setQuery(place.displayName || suggestion.placePrediction.text.text);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('OVER_QUERY_LIMIT')) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    } finally {
      sessionTokenRef.current = null;
      setSuggestions([]);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter farm town / origin for haulage route..."
          className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

      {suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleChoose(s)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-emerald-50 cursor-pointer"
              >
                {s.placePrediction?.text.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ForecastSvgChart({ series }: { series: MandiPricePoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (series.length === 0) return null;

  const width = 760;
  const height = 270;
  const padLeft = 56;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const allValues: number[] = [];
  for (const pt of series) {
    if (pt.modalPrice !== null) allValues.push(pt.modalPrice);
    if (pt.forecastPrice !== null) allValues.push(pt.forecastPrice);
    if (pt.lowerBand95 !== null) allValues.push(pt.lowerBand95);
    if (pt.upperBand95 !== null) allValues.push(pt.upperBand95);
  }
  const minVal = Math.floor((Math.min(...allValues) * 0.94) / 50) * 50;
  const maxVal = Math.ceil((Math.max(...allValues) * 1.05) / 50) * 50;
  const span = Math.max(maxVal - minVal, 100);

  const xFor = (i: number) => padLeft + (i / (series.length - 1)) * innerW;
  const yFor = (val: number) => padTop + innerH - ((val - minVal) / span) * innerH;

  const histPoints = series
    .map((pt, i) => (pt.modalPrice !== null ? `${xFor(i)},${yFor(pt.modalPrice)}` : null))
    .filter(Boolean)
    .join(' ');

  const fcPoints = series
    .map((pt, i) => (pt.forecastPrice !== null ? `${xFor(i)},${yFor(pt.forecastPrice)}` : null))
    .filter(Boolean)
    .join(' ');

  const band95Indices = series
    .map((pt, i) => (pt.upperBand95 !== null && pt.lowerBand95 !== null ? i : -1))
    .filter((i) => i >= 0);

  const band95Path =
    band95Indices.length > 1
      ? [
          ...band95Indices.map((i, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(i)},${yFor(series[i].upperBand95 as number)}`),
          ...band95Indices
            .slice()
            .reverse()
            .map((i) => `L${xFor(i)},${yFor(series[i].lowerBand95 as number)}`),
          'Z',
        ].join(' ')
      : '';

  const band80Path =
    band95Indices.length > 1
      ? [
          ...band95Indices.map((i, idx) => `${idx === 0 ? 'M' : 'L'}${xFor(i)},${yFor(series[i].upperBand80 as number)}`),
          ...band95Indices
            .slice()
            .reverse()
            .map((i) => `L${xFor(i)},${yFor(series[i].lowerBand80 as number)}`),
          'Z',
        ].join(' ')
      : '';

  const splitIdx = series.findIndex((s) => s.isForecast) - 1;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(minVal + t * span));
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="Mandi price history and 14-day forecast bands"
      >
        {ticks.map((val) => {
          const y = yFor(val);
          return (
            <g key={val}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                ₹{val}
              </text>
            </g>
          );
        })}

        {splitIdx >= 0 && (
          <line
            x1={xFor(splitIdx)}
            y1={padTop}
            x2={xFor(splitIdx)}
            y2={height - padBottom}
            stroke="#94a3b8"
            strokeDasharray="4 4"
          />
        )}

        {band95Path && <path d={band95Path} fill="#10b981" fillOpacity={0.12} />}
        {band80Path && <path d={band80Path} fill="#10b981" fillOpacity={0.22} />}

        <polyline fill="none" stroke="#0f172a" strokeWidth={2.2} points={histPoints} />
        <polyline fill="none" stroke="#15803d" strokeWidth={2.4} strokeDasharray="5 4" points={fcPoints} />

        {/* X-axis date ticks */}
        {[0, 14, splitIdx, series.length - 1]
          .filter((i, idx, arr) => i >= 0 && arr.indexOf(i) === idx)
          .map((idx) => (
            <text
              key={idx}
              x={xFor(idx)}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] font-mono"
            >
              {series[idx].date.slice(5)}
            </text>
          ))}

        {hoverIdx !== null && (
          <line
            x1={xFor(hoverIdx)}
            y1={padTop}
            x2={xFor(hoverIdx)}
            y2={height - padBottom}
            stroke="#0f172a"
            strokeOpacity={0.35}
          />
        )}

        {series.map((pt, i) => (
          <rect
            key={pt.date}
            x={xFor(i) - innerW / series.length / 2}
            y={padTop}
            width={innerW / series.length}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
          />
        ))}
      </svg>

      {hovered && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
          <span className="font-mono text-slate-700">{hovered.date}</span>
          {hovered.modalPrice !== null ? (
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              Historical Modal: ₹{hovered.modalPrice.toLocaleString('en-IN')}/qtl
            </span>
          ) : (
            <span className="font-mono tabular-nums text-emerald-800">
              Forecast: ₹{hovered.forecastPrice?.toLocaleString('en-IN')}/qtl · 80% Band: ₹
              {hovered.lowerBand80?.toLocaleString('en-IN')}–₹{hovered.upperBand80?.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function MandiForecastModule() {
  const { hasKey } = useMapsConfig();
  const [commodity, setCommodity] = useState('Tomato');
  const [mandiId, setMandiId] = useState('kolar');
  const [data, setData] = useState<MandiDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [originCoords, setOriginCoords] = useState<google.maps.LatLngLiteral | null>(null);
  const [originLabel, setOriginLabel] = useState<string>('');
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const loadMandi = useCallback(async (comm: string, mId: string, refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setAiBrief(null);
    try {
      const res = await fetch(
        `/api/mandi/prices?commodity=${encodeURIComponent(comm)}&mandiId=${encodeURIComponent(mId)}${
          refresh ? '&refresh=true' : ''
        }`
      );
      const json = (await res.json()) as MandiDashboardResponse;
      setData(json);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMandi(commodity, mandiId, false);
  }, [commodity, mandiId, loadMandi]);

  const handleGenerateBrief = async () => {
    if (!data) return;
    setBriefLoading(true);
    try {
      const topMarket = data.comparisons[0];
      const res = await fetch('/api/mandi/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commodity: data.commodity,
          mandiName: data.selectedMandi.name,
          currentModalPrice: data.currentModalPrice,
          forecast14dPrice: data.forecast14dPrice,
          forecastDeltaPct: data.forecastDeltaPct,
          sellSignal: data.sellSignal,
          bestMandiName: topMarket?.mandiName,
          bestMandiPrice: topMarket?.currentModalPrice,
        }),
      });
      const json = (await res.json()) as { brief?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to generate cooperative brief.');
      setAiBrief(json.brief ?? '');
    } catch (err) {
      setAiBrief(err instanceof Error ? err.message : 'Unable to generate market brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Product 12 · Farmers & Cooperatives</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Mandi Price Forecasting Dashboard
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Compare APMC spot modal rates, 14-day forecast confidence bands, and haulage routes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Select commodity"
            value={commodity}
            onChange={(e) => setCommodity(e.target.value)}
            className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
          >
            {(data?.commodities ?? ['Tomato', 'Onion', 'Wheat', 'Paddy (Basmati)', 'Soybean', 'Cotton', 'Mustard', 'Potato']).map(
              (c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              )
            )}
          </select>

          <select
            aria-label="Select APMC mandi"
            value={mandiId}
            onChange={(e) => setMandiId(e.target.value)}
            className="text-xs font-medium border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
          >
            {(data?.mandis ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.state})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadMandi(commodity, mandiId, true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Feed
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* 4-Column KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Current Modal Price</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
                ₹{data.currentModalPrice.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-slate-500">per quintal · {data.selectedMandi.district}</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">7-Day Spot Change</p>
              <p
                className={`mt-1 text-xl font-semibold font-mono tabular-nums ${
                  data.priceChange7dPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {data.priceChange7dPct >= 0 ? '+' : ''}
                {data.priceChange7dPct}%
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums">
                Volatility: {data.volatilityPct}%
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">14-Day Model Forecast</p>
              <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
                ₹{data.forecast14dPrice.toLocaleString('en-IN')}
              </p>
              <p
                className={`mt-1 text-xs font-medium tabular-nums ${
                  data.forecastDeltaPct >= 0 ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {data.forecastDeltaPct >= 0 ? '+' : ''}
                {data.forecastDeltaPct}% projected trajectory
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs text-slate-500">Cooperative Signal</p>
              <p className="mt-1 text-xl font-semibold text-emerald-700">{data.sellSignal}</p>
              <p className="mt-1 text-xs text-slate-600">{data.bestSellWindow}</p>
            </div>
          </div>

          {/* Chart + Regional Google Map Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    {data.commodity} Price Trend & Forecast Bands
                  </h2>
                  <p className="text-xs text-slate-500">
                    {data.selectedMandi.name} · Updated{' '}
                    {new Date(data.lastRefreshedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-slate-900 inline-block" /> Historical
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-emerald-700 inline-block border-t border-dashed" /> Forecast
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-3 h-2.5 bg-emerald-500/20 inline-block rounded-xs" /> 80%/95% Band
                  </span>
                </div>
              </div>

              <ForecastSvgChart series={data.series} />

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-600">
                  Need a concise cooperative dispatch & storage note for this lot?
                </p>
                <button
                  type="button"
                  onClick={() => void handleGenerateBrief()}
                  disabled={briefLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {briefLoading ? 'Drafting Brief...' : 'Generate Cooperative Brief'}
                </button>
              </div>

              {aiBrief && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                  {aiBrief}
                </div>
              )}
            </div>

            {/* Google Maps Regional Mandi Locator & Route Calculator */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Regional Mandis & Route Distance
                  </h2>
                  <p className="text-xs text-slate-500">
                    Click any mandi pin or search your farm town to calculate haulage time.
                  </p>
                </div>
                <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
              </div>

              {hasKey ? (
                <>
                  <OriginAutocompleteBox
                    onSelectOrigin={(coords, label) => {
                      setOriginCoords(coords);
                      setOriginLabel(label);
                    }}
                  />

                  <div className="h-[310px] w-full rounded-lg overflow-hidden border border-slate-200">
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      defaultCenter={{ lat: 21.5, lng: 77.0 }}
                      defaultZoom={5}
                      gestureHandling="greedy"
                      disableDefaultUI={false}
                      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    >
                      {data.comparisons.map((m) => {
                        const isSelected = m.mandiId === data.selectedMandi.id;
                        return (
                          <AdvancedMarker
                            key={m.mandiId}
                            position={{ lat: m.lat, lng: m.lng }}
                            onClick={() => setActiveMarkerId(m.mandiId)}
                            title={`${m.mandiName}: ₹${m.currentModalPrice}/qtl`}
                          >
                            <Pin
                              background={isSelected ? '#15803d' : '#0f172a'}
                              borderColor="#ffffff"
                              glyphColor="#ffffff"
                              scale={isSelected ? 1.2 : 0.95}
                            />
                          </AdvancedMarker>
                        );
                      })}

                      {originCoords && (
                        <AdvancedMarker position={originCoords} title={originLabel || 'Farm Origin'}>
                          <Pin background="#d97706" borderColor="#ffffff" glyphColor="#ffffff" scale={1.1} />
                        </AdvancedMarker>
                      )}

                      {activeMarkerId && (() => {
                        const m = data.comparisons.find((c) => c.mandiId === activeMarkerId);
                        if (!m) return null;
                        return (
                          <InfoWindow
                            position={{ lat: m.lat, lng: m.lng }}
                            onCloseClick={() => setActiveMarkerId(null)}
                          >
                            <div className="p-1 text-xs text-slate-900 space-y-1 max-w-[190px]">
                              <p className="font-semibold">{m.mandiName}</p>
                              <p className="text-slate-600">{m.state}</p>
                              <p className="font-mono tabular-nums font-semibold">
                                ₹{m.currentModalPrice.toLocaleString('en-IN')}/qtl
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setMandiId(m.mandiId);
                                  setActiveMarkerId(null);
                                }}
                                className="mt-1 px-2 py-1 rounded bg-emerald-700 text-white text-[11px] font-medium cursor-pointer"
                              >
                                Select Market
                              </button>
                            </div>
                          </InfoWindow>
                        );
                      })()}

                      <MandiRouteLayer
                        origin={originCoords}
                        destination={data.selectedMandi}
                        onRouteComputed={setRouteSummary}
                        onRouteError={setRouteError}
                      />
                    </GoogleMap>
                  </div>

                  {routeSummary && (
                    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950">
                      <span className="inline-flex items-center gap-1.5 font-medium truncate">
                        <Navigation className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        {originLabel || routeSummary.originLabel} → {data.selectedMandi.name}
                      </span>
                      <span className="font-mono tabular-nums font-semibold shrink-0">
                        {routeSummary.distanceKm} km · {routeSummary.durationMins} min
                      </span>
                    </div>
                  )}

                  {routeError && (
                    <p className="text-xs text-amber-700">{routeError}</p>
                  )}
                </>
              ) : (
                <div className="h-[310px] rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-600">
                  <MapPin className="w-6 h-6 text-slate-400 mb-2" />
                  Google Maps API key not detected. Enable Google Maps Platform to view interactive mandi pins and haulage routes.
                </div>
              )}
            </div>
          </div>

          {/* Regional Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Cross-Mandi Spot & 14-Day Forecast Comparison ({data.commodity})
              </h2>
              <span className="text-xs text-slate-500">All prices in ₹ / Quintal</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-4">Market Yard</th>
                    <th className="py-2.5 px-4">State</th>
                    <th className="py-2.5 px-4 text-right">Arrivals (t)</th>
                    <th className="py-2.5 px-4 text-right">Modal Price</th>
                    <th className="py-2.5 px-4 text-right">14d Forecast</th>
                    <th className="py-2.5 px-4 text-right">Projected Delta</th>
                    <th className="py-2.5 px-4">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.comparisons.map((row) => {
                    const active = row.mandiId === data.selectedMandi.id;
                    return (
                      <tr
                        key={row.mandiId}
                        onClick={() => setMandiId(row.mandiId)}
                        className={`h-10 transition-colors cursor-pointer ${
                          active ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-4 font-medium text-slate-900 whitespace-nowrap">
                          {row.mandiName}
                        </td>
                        <td className="px-4 text-slate-600 whitespace-nowrap">{row.state}</td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-700">
                          {row.arrivalsTonnes}
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          ₹{row.currentModalPrice.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 text-right font-mono tabular-nums text-slate-800">
                          ₹{row.forecast14dPrice.toLocaleString('en-IN')}
                        </td>
                        <td
                          className={`px-4 text-right font-mono tabular-nums font-medium ${
                            row.expectedDeltaPct >= 0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {row.expectedDeltaPct >= 0 ? '+' : ''}
                          {row.expectedDeltaPct}%
                        </td>
                        <td className="px-4 whitespace-nowrap font-medium text-slate-800">
                          {row.recommendation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
