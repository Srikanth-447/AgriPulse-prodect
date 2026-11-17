import React, { useEffect, useState } from 'react';
import {
  Droplets,
  LayoutGrid,
  Menu,
  Microscope,
  Sprout,
  TrendingUp,
  X,
} from 'lucide-react';
import type { ProductModule } from './types/agri';
import { MapsWrapper } from './components/MapsWrapper';
import { OverviewHub } from './components/OverviewHub';
import { PlantDiseaseModule } from './components/PlantDiseaseModule';
import { MandiForecastModule } from './components/MandiForecastModule';
import { CropRecommenderModule } from './components/CropRecommenderModule';
import { IrrigationControllerModule } from './components/IrrigationControllerModule';

const NAV_ITEMS: Array<{
  id: ProductModule;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Suite Overview', shortLabel: 'Overview', icon: LayoutGrid },
  { id: 'disease', label: '11. Disease Detector', shortLabel: 'Disease AI', icon: Microscope },
  { id: 'mandi', label: '12. Mandi Forecast', shortLabel: 'Mandi Prices', icon: TrendingUp },
  { id: 'crops', label: '13. Crop Recommender', shortLabel: 'Crop Soil', icon: Sprout },
  { id: 'irrigation', label: '14. Smart Irrigation', shortLabel: 'Irrigation', icon: Droplets },
];

export default function App() {
  const [activeModule, setActiveModule] = useState<ProductModule>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  const handleNavSelect = (mod: ProductModule) => {
    setActiveModule(mod);
    setMobileMenuOpen(false);
  };

  return (
    <MapsWrapper>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Strict 3-Zone Top Bar */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle module navigation"
                className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('overview')}
                className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                AgriPulse
              </button>
            </div>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <button
                type="button"
                onClick={() => handleNavSelect('disease')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeModule === 'disease'
                    ? 'text-emerald-700 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                Disease Detector
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('mandi')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeModule === 'mandi'
                    ? 'text-emerald-700 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                Mandi Forecast
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('crops')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeModule === 'crops'
                    ? 'text-emerald-700 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                Crop Recommender
              </button>
              <button
                type="button"
                onClick={() => handleNavSelect('irrigation')}
                className={`whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  activeModule === 'irrigation'
                    ? 'text-emerald-700 underline underline-offset-4'
                    : 'hover:text-slate-900'
                }`}
              >
                Smart Irrigation
              </button>
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={() => handleNavSelect(activeModule === 'irrigation' ? 'disease' : 'irrigation')}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {activeModule === 'irrigation' ? 'Inspect Leaf' : 'Live Valves'}
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavSelect(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                    active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Workspace Layout: Desktop Left Sidebar + Content Viewport */}
        <div className="flex-1 max-w-[1440px] w-full mx-auto flex">
          <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-6">
            <p className="px-3 mb-2 text-[11px] font-medium text-slate-400">
              Workspaces
            </p>
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavSelect(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
            {activeModule === 'overview' && <OverviewHub onSelectModule={handleNavSelect} />}
            {activeModule === 'disease' && <PlantDiseaseModule />}
            {activeModule === 'mandi' && <MandiForecastModule />}
            {activeModule === 'crops' && <CropRecommenderModule />}
            {activeModule === 'irrigation' && <IrrigationControllerModule />}
          </main>
        </div>

        <footer className="border-t border-slate-200 bg-white">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>AgriPulse Operations Suite · Agricultural Decision Support</span>
            <span>Plant Diagnostics · APMC Price Bands · Soil Suitability · Drip Telemetry</span>
          </div>
        </footer>
      </div>
    </MapsWrapper>
  );
}
