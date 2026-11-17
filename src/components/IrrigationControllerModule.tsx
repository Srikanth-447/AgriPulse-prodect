import React, { useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  CloudSun,
  Droplets,
  Power,
  Timer,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  IrrigationSystemState,
  IrrigationZone,
  WeatherSnapshot,
} from '../types/agri';
import { useMapsConfig } from './MapsWrapper';

function MoistureForecastChart({ zone }: { zone: IrrigationZone }) {
  const width = 620;
  const height = 220;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 30;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const pts = zone.forecast24h;
  if (pts.length === 0) return null;

  const minY = 10;
  const maxY = 85;
  const spanY = maxY - minY;

  const xFor = (i: number) => padLeft + (i / (pts.length - 1)) * innerW;
  const yFor = (val: number) => padTop + innerH - ((val - minY) / spanY) * innerH;

  const linePoints = pts.map((p, i) => `${xFor(i)},${yFor(p.predictedMoisturePct)}`).join(' ');
  const bandPath = [
    ...pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(p.upperBoundPct)}`),
    ...pts
      .slice()
      .reverse()
      .map((p, idx) => `L${xFor(pts.length - 1 - idx)},${yFor(p.lowerBoundPct)}`),
    'Z',
  ].join(' ');

  const threshY = yFor(zone.minThresholdPct);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto select-none"
      role="img"
      aria-label={`24 hour soil moisture regression forecast for ${zone.name}`}
    >
      {[20, 40, 60, 80].map((v) => {
        const y = yFor(v);
        return (
          <g key={v}>
            <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={padLeft - 6} y={y + 4} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
              {v}%
            </text>
          </g>
        );
      })}

      {/* Min threshold line */}
      <line
        x1={padLeft}
        y1={threshY}
        x2={width - padRight}
        y2={threshY}
        stroke="#d97706"
        strokeWidth={1.5}
        strokeDasharray="4 3"
      />
      <text x={width - padRight} y={threshY - 5} textAnchor="end" className="fill-amber-700 text-[10px] font-mono">
        Trigger {zone.minThresholdPct}%
      </text>

      <path d={bandPath} fill="#0ea5e9" fillOpacity={0.14} />
      <polyline fill="none" stroke="#0284c7" strokeWidth={2.4} points={linePoints} />

      {pts
        .filter((_, idx) => idx % 2 === 0)
        .map((p) => {
          const origIdx = pts.indexOf(p);
          return (
            <text
              key={p.hourOffset}
              x={xFor(origIdx)}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] font-mono"
            >
              {p.label}
            </text>
          );
        })}
    </svg>
  );
}

export function IrrigationControllerModule() {
  const { hasKey } = useMapsConfig();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<IrrigationSystemState | null>(null);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [selectedZoneId, setSelectedZoneId] = useState<string>('zone-a');
  const [mapPopupZoneId, setMapPopupZoneId] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    let active = true;

    // Initial HTTP hydration for zero-latency layout
    fetch('/api/irrigation/state')
      .then((r) => r.json())
      .then((initial: IrrigationSystemState) => {
        if (active) setState(initial);
      })
      .catch(() => {});

    // Fetch live Google Maps Weather API for farm block center
    fetch('/api/weather?lat=20.0112&lng=73.7903')
      .then((r) => r.json())
      .then((w: WeatherSnapshot) => {
        if (active) {
          if (w.quotaExceeded) window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setWeather(w);
        }
      })
      .catch(() => {});

    const connectWs = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws/irrigation`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setWsStatus('connected');
        socket.send(JSON.stringify({ type: 'irrigation:sync' }));
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            state?: IrrigationSystemState;
          };
          if ((msg.type === 'irrigation:init' || msg.type === 'irrigation:state') && msg.state) {
            setState(msg.state);
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (!active) return;
        setWsStatus('reconnecting');
        reconnectTimerRef.current = setTimeout(connectWs, 2000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connectWs();

    return () => {
      active = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendCommand = (payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  const zones = state?.zones ?? [];
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? zones[0] ?? null;

  const zoneStatusStyle = (status: IrrigationZone['status']) => {
    if (status === 'Irrigating') return 'text-sky-700';
    if (status === 'Optimal') return 'text-emerald-700';
    if (status === 'Moisture Low') return 'text-amber-700';
    return 'text-red-700';
  };

  const zonePinColor = (status: IrrigationZone['status']) => {
    if (status === 'Irrigating') return '#0284c7';
    if (status === 'Optimal') return '#15803d';
    if (status === 'Moisture Low') return '#d97706';
    return '#dc2626';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Product 14 · Farm Operator Telemetry</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Smart Irrigation Controller
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Live WebSocket sensor stream, 24-hour soil moisture regression curves, and solenoid valve control.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
            {wsStatus === 'connected' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                <Wifi className="w-3.5 h-3.5 text-emerald-700" />
                WebSocket Live
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                {wsStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
              </>
            )}
          </span>
        </div>
      </div>

      {/* 4-Column Telemetry Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Total Manifold Flow</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {state ? `${state.totalFlowLpm} L/min` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {zones.filter((z) => z.valveOpen).length} active drip lines
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Daily Water Dispensed</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {state ? `${state.dailyWaterLitres.toLocaleString()} L` : '—'}
          </p>
          <p className="mt-1 text-xs text-emerald-700 font-medium">
            {state ? `${state.waterSavedPct}% water saved vs fixed timer` : '—'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Low-Moisture Zones</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {zones.filter((z) => z.status === 'Moisture Low' || z.status === 'Critical Stress').length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Requiring operator or ML action</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Field Weather Conditions</p>
          {weather?.available ? (
            <>
              <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
                {weather.temperatureC}°C · {weather.relativeHumidity}% RH
              </p>
              <p className="mt-1 text-xs text-slate-600 inline-flex items-center gap-1">
                <CloudSun className="w-3.5 h-3.5 text-emerald-700" />
                {weather.conditionText} · Wind {weather.windKmh ?? 0} km/h
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-base font-semibold text-slate-800">Local ET0 Model</p>
              <p className="mt-1 text-xs text-slate-500">
                {weather?.message ? 'Weather API standby' : 'Loading field weather...'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Zone Control Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {zones.map((z) => {
          const isSelected = selectedZone?.id === z.id;
          return (
            <div
              key={z.id}
              onClick={() => setSelectedZoneId(z.id)}
              className={`bg-white rounded-xl p-5 border transition-colors cursor-pointer space-y-4 ${
                isSelected ? 'border-emerald-700' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">
                    {z.crop} · {z.areaHectares} ha
                  </p>
                  <h2 className="text-base font-semibold text-slate-900 mt-0.5">{z.name}</h2>
                </div>
                <span className={`text-xs font-semibold ${zoneStatusStyle(z.status)}`}>
                  {z.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 py-2 border-y border-slate-100 text-xs">
                <div>
                  <p className="text-slate-500">Moisture</p>
                  <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                    {z.moisturePct}%
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Soil Temp</p>
                  <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                    {z.soilTempC}°C
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Flow</p>
                  <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                    {z.flowRateLpm} L/m
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Dry-Down</p>
                  <p className="font-mono tabular-nums text-sm font-semibold text-slate-900 mt-0.5">
                    {z.hoursUntilThreshold === null
                      ? '>24h'
                      : z.hoursUntilThreshold === 0
                      ? 'Now'
                      : `${z.hoursUntilThreshold}h`}
                  </p>
                </div>
              </div>

              {/* Threshold slider */}
              <div
                className="flex items-center justify-between gap-3 text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <label className="text-slate-600 whitespace-nowrap">
                  Trigger below{' '}
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {z.minThresholdPct}%
                  </span>
                </label>
                <input
                  type="range"
                  min={22}
                  max={55}
                  value={z.minThresholdPct}
                  onChange={(e) =>
                    sendCommand({
                      type: 'zone:set_threshold',
                      zoneId: z.id,
                      minThresholdPct: Number(e.target.value),
                    })
                  }
                  className="flex-1 accent-emerald-700"
                />
              </div>

              {/* Operator Controls */}
              <div
                className="flex flex-wrap items-center justify-between gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({ type: 'zone:set_mode', zoneId: z.id, mode: 'AUTO_ML' })
                    }
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      z.mode === 'AUTO_ML' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Auto ML
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({ type: 'zone:set_mode', zoneId: z.id, mode: 'MANUAL' })
                    }
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      z.mode === 'MANUAL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Manual
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sendCommand({ type: 'zone:pulse_15m', zoneId: z.id })}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Timer className="w-3.5 h-3.5" />
                    15m Pulse
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      sendCommand({
                        type: 'zone:toggle_valve',
                        zoneId: z.id,
                        valveOpen: !z.valveOpen,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      z.valveOpen
                        ? 'bg-red-700 text-white hover:bg-red-800'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {z.valveOpen ? 'Close Valve' : 'Open Valve'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Regression Forecast Chart + Google Map Zone Telemetry + Live Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          {selectedZone ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    24-Hour Soil Moisture Regression · {selectedZone.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Current: {selectedZone.moisturePct}% · Target: {selectedZone.targetMoisturePct}% · EC {selectedZone.ecDsM} dS/m
                  </p>
                </div>
                <Droplets className="w-4 h-4 text-sky-600 shrink-0" />
              </div>

              <MoistureForecastChart zone={selectedZone} />
            </>
          ) : (
            <p className="text-xs text-slate-500">Select a zone to inspect forecast curves.</p>
          )}

          {/* Live Alerts Stream */}
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <h3 className="text-xs font-semibold text-slate-900">Live Controller Event Stream</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {(state?.alerts ?? []).map((al) => (
                <div
                  key={al.id}
                  className="flex items-start justify-between gap-3 text-xs py-1.5 border-b border-slate-100 last:border-b-0"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <AlertTriangle
                      className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        al.severity === 'critical'
                          ? 'text-red-600'
                          : al.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-emerald-700'
                      }`}
                    />
                    <div className="min-w-0">
                      <span className="font-medium text-slate-900">{al.zoneName}: </span>
                      <span className="text-slate-600">{al.message}</span>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                    {new Date(al.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Field Valve Map */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Field Valve Map</h2>
            <p className="text-xs text-slate-500">
              Click any field sensor marker to inspect live moisture and toggle its valve.
            </p>
          </div>

          {hasKey ? (
            <div className="h-[360px] w-full rounded-lg overflow-hidden border border-slate-200">
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={{ lat: 20.0105, lng: 73.7908 }}
                defaultZoom={15}
                mapTypeId="hybrid"
                gestureHandling="greedy"
                disableDefaultUI={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              >
                {zones.map((z) => (
                  <AdvancedMarker
                    key={z.id}
                    position={{ lat: z.lat, lng: z.lng }}
                    onClick={() => {
                      setSelectedZoneId(z.id);
                      setMapPopupZoneId(z.id);
                    }}
                    title={`${z.name} (${z.moisturePct}%)`}
                  >
                    <Pin
                      background={zonePinColor(z.status)}
                      borderColor="#ffffff"
                      glyphColor="#ffffff"
                      scale={selectedZone?.id === z.id ? 1.2 : 1.0}
                    />
                  </AdvancedMarker>
                ))}

                {mapPopupZoneId && (() => {
                  const z = zones.find((item) => item.id === mapPopupZoneId);
                  if (!z) return null;
                  return (
                    <InfoWindow
                      position={{ lat: z.lat, lng: z.lng }}
                      onCloseClick={() => setMapPopupZoneId(null)}
                    >
                      <div className="p-1 text-xs text-slate-900 space-y-1 max-w-[200px]">
                        <p className="font-semibold">{z.name}</p>
                        <p className="text-slate-600">{z.crop}</p>
                        <p className="font-mono tabular-nums">
                          Moisture: {z.moisturePct}% · {z.status}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            sendCommand({
                              type: 'zone:toggle_valve',
                              zoneId: z.id,
                              valveOpen: !z.valveOpen,
                            })
                          }
                          className={`mt-1 px-2.5 py-1 rounded text-white text-[11px] font-medium cursor-pointer ${
                            z.valveOpen ? 'bg-red-700' : 'bg-emerald-700'
                          }`}
                        >
                          {z.valveOpen ? 'Close Valve' : 'Open Valve'}
                        </button>
                      </div>
                    </InfoWindow>
                  );
                })()}
              </GoogleMap>
            </div>
          ) : (
            <div className="h-[360px] rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-6 text-center text-xs text-slate-600">
              Google Maps API key not detected. Enable Google Maps Platform to render field zone satellite pins.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
