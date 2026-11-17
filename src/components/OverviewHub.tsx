import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Droplets,
  Leaf,
  Microscope,
  Sprout,
  TrendingUp,
} from 'lucide-react';
import type {
  FarmProfile,
  IrrigationSystemState,
  MandiDashboardResponse,
  ProductModule,
} from '../types/agri';

interface OverviewHubProps {
  onSelectModule: (mod: ProductModule) => void;
}

export function OverviewHub({ onSelectModule }: OverviewHubProps) {
  const [mandiSnap, setMandiSnap] = useState<MandiDashboardResponse | null>(null);
  const [irrigationSnap, setIrrigationSnap] = useState<IrrigationSystemState | null>(null);
  const [profilesCount, setProfilesCount] = useState<number | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/mandi/prices?commodity=Tomato&mandiId=kolar').then((r) => r.json()),
      fetch('/api/irrigation/state').then((r) => r.json()),
      fetch('/api/profiles').then((r) => r.json()),
    ])
      .then(([mandi, irr, prof]: [MandiDashboardResponse, IrrigationSystemState, { profiles: FarmProfile[] }]) => {
        if (!active) return;
        setMandiSnap(mandi);
        setIrrigationSnap(irr);
        setProfilesCount(prof.profiles?.length ?? 0);
      })
      .catch(() => {
        // non-blocking overview stats
      });
    return () => {
      active = false;
    };
  }, []);

  const products: Array<{
    id: ProductModule;
    index: string;
    audience: string;
    title: string;
    problem: string;
    aiCore: string;
    metricLabel: string;
    metricValue: string;
    cta: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'disease',
      index: '01',
      audience: 'Smallholder Farmers',
      title: 'Plant Disease Detector with Advisor',
      problem: 'Leaf pathology assessment when local extension specialists are unavailable.',
      aiCore: 'Vision leaf classification paired with a retrieval-augmented agronomy chat.',
      metricLabel: 'Diagnostic Scope',
      metricValue: 'PlantVillage + Extension KB',
      cta: 'Inspect Leaf Health',
      icon: Microscope,
    },
    {
      id: 'mandi',
      index: '02',
      audience: 'Farmers & Cooperatives',
      title: 'Mandi Price Forecasting Dashboard',
      problem: 'Price uncertainty across regional APMC yards makes harvest timing difficult.',
      aiCore: 'Time-series smoothing with 14-day confidence bands and route planning.',
      metricLabel: 'Kolar Tomato Modal',
      metricValue: mandiSnap ? `₹${mandiSnap.currentModalPrice.toLocaleString('en-IN')}/qtl` : 'Loading...',
      cta: 'Open Market Forecasts',
      icon: TrendingUp,
    },
    {
      id: 'crops',
      index: '03',
      audience: 'Farmers',
      title: 'Soil-Based Crop Recommender',
      problem: 'Crop choices often overlook NPK balance, soil pH, and local rainfall.',
      aiCore: 'Multiclass suitability scoring with per-feature importance attribution.',
      metricLabel: 'Saved Farm Plots',
      metricValue: profilesCount !== null ? `${profilesCount} Profiles` : 'Loading...',
      cta: 'Score Soil Profile',
      icon: Sprout,
    },
    {
      id: 'irrigation',
      index: '04',
      audience: 'Farm Operators',
      title: 'Smart Irrigation Controller',
      problem: 'Fixed watering schedules waste groundwater and induce root stress.',
      aiCore: 'Regression moisture forecasting with live WebSocket valve telemetry.',
      metricLabel: 'Active Manifold Flow',
      metricValue: irrigationSnap ? `${irrigationSnap.totalFlowLpm} L/min` : 'Loading...',
      cta: 'Open Valve Console',
      icon: Droplets,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Hero Split Banner */}
      <section className="grid grid-cols-1 lg:grid-cols-12 items-stretch bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-500">
              Operations Platform · Farmers, Cooperatives & Field Advisors
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance]">
              Timely agronomic intelligence from leaf diagnostics to field irrigation
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              Four integrated decision modules built to reduce post-harvest and crop-health losses:
              diagnose foliar disease, forecast APMC mandi pricing, match crops to soil chemistry,
              and control drip irrigation valves over live telemetry.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onSelectModule('disease')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Leaf Diagnosis
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectModule('irrigation')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Monitor Live Irrigation
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 relative min-h-[240px] bg-slate-100">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/agronomy_field_overview_1794921767134.jpg"
              alt="Terraced agricultural crop rows equipped with precision drip irrigation lines"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-slate-100 text-slate-600">
              <Leaf className="w-10 h-10 text-emerald-700 mb-2" />
              <span className="text-sm font-medium">Precision Agronomy Field Operations</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-5">
            <div className="text-white">
              <p className="text-xs text-slate-200">Active Telemetry & Geospatial Suite</p>
              <p className="text-sm font-semibold mt-0.5">
                4 Field Zones · 8 Regional Mandis · Google Maps Weather & Routing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Four-Column Operational Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Live Irrigation Flow</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {irrigationSnap ? `${irrigationSnap.totalFlowLpm} L/min` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {irrigationSnap
              ? `${irrigationSnap.zones.filter((z) => z.valveOpen).length} of ${irrigationSnap.zones.length} valves open`
              : 'Connecting to controller'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Water Efficiency Gain</p>
          <p className="mt-1 text-xl font-semibold text-emerald-700 font-mono tabular-nums">
            {irrigationSnap ? `-${irrigationSnap.waterSavedPct}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-600">vs. fixed timer irrigation</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Kolar Tomato 14d Forecast</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {mandiSnap ? `₹${mandiSnap.forecast14dPrice.toLocaleString('en-IN')}` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-600 tabular-nums">
            {mandiSnap
              ? `${mandiSnap.forecastDeltaPct >= 0 ? '+' : ''}${mandiSnap.forecastDeltaPct}% · ${mandiSnap.sellSignal}`
              : 'Fetching market bands'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Stored Farm Profiles</p>
          <p className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {profilesCount !== null ? `${profilesCount}` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-600">NPK & climate soil records</p>
        </div>
      </section>

      {/* Four Product Modules */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Agricultural Software Modules</h2>
            <p className="text-sm text-slate-600">
              Select a workspace below to run diagnostics, inspect market forecasts, or operate field valves.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {products.map((prod) => {
            const Icon = prod.icon;
            return (
              <div
                key={prod.id}
                className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5 hover:border-slate-300 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-slate-500">
                      {prod.index} · {prod.audience}
                    </span>
                    <Icon className="w-4 h-4 text-emerald-700 shrink-0" />
                  </div>

                  <h3 className="text-lg font-semibold text-slate-900">{prod.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{prod.problem}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    <span className="font-medium text-slate-700">Model & Stack:</span> {prod.aiCore}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{prod.metricLabel}</p>
                    <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                      {prod.metricValue}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onSelectModule(prod.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {prod.cta}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
