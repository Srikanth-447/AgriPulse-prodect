import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  BookmarkPlus,
  CloudSun,
  Loader2,
  MapPin,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  CropRecommendation,
  CropRecommendResponse,
  FarmProfile,
  SoilInput,
  SoilType,
  WeatherSnapshot,
} from '../types/agri';
import { useMapsConfig } from './MapsWrapper';

const SOIL_TYPES: SoilType[] = ['Alluvial', 'Black Cotton', 'Red Loam', 'Sandy Loam', 'Clay'];

function FarmLocationSearch({
  onSelectLocation,
}: {
  onSelectLocation: (coords: google.maps.LatLngLiteral, label: string) => void;
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
    const t = setTimeout(() => {
      placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query,
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res: { suggestions?: google.maps.places.AutocompleteSuggestion[] }) => {
          if (!cancelled) setSuggestions(res.suggestions ?? []);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [placesLib, query]);

  const handleChoose = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
      if (place.location) {
        const label = place.displayName || place.formattedAddress || query;
        onSelectLocation({ lat: place.location.lat(), lng: place.location.lng() }, label);
        setQuery(label);
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
          placeholder="Search village, taluka, or farm location..."
          className="w-full text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      {suggestions.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
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

export function CropRecommenderModule() {
  const { hasKey } = useMapsConfig();
  const [soil, setSoil] = useState<SoilInput>({
    nitrogen: 88,
    phosphorus: 56,
    potassium: 74,
    ph: 6.6,
    rainfallMm: 82,
    temperatureC: 24,
    humidityPct: 62,
    soilType: 'Red Loam',
  });

  const [plotCoords, setPlotCoords] = useState<google.maps.LatLngLiteral>({
    lat: 20.011,
    lng: 73.7903,
  });
  const [locationName, setLocationName] = useState('Nashik, Maharashtra');
  const [profileName, setProfileName] = useState('Godavari Valley Plot A');
  const [farmerOrCoop, setFarmerOrCoop] = useState('Sahyadri Growers Cooperative');
  const [areaAcres, setAreaAcres] = useState(6.5);

  const [loadingRec, setLoadingRec] = useState(false);
  const [result, setResult] = useState<CropRecommendResponse | null>(null);
  const [selectedCropIdx, setSelectedCropIdx] = useState(0);

  const [profiles, setProfiles] = useState<FarmProfile[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherNote, setWeatherNote] = useState<string | null>(null);

  const runClassifier = useCallback(async (soilInput: SoilInput) => {
    setLoadingRec(true);
    try {
      const res = await fetch('/api/crops/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(soilInput),
      });
      const json = (await res.json()) as CropRecommendResponse;
      setResult(json);
      setSelectedCropIdx(0);
    } finally {
      setLoadingRec(false);
    }
  }, []);

  const loadProfiles = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles');
      const json = (await res.json()) as { profiles: FarmProfile[] };
      setProfiles(json.profiles ?? []);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    void runClassifier(soil);
    void loadProfiles();
  }, [loadProfiles, runClassifier]);

  const handleSyncWeather = async () => {
    setWeatherLoading(true);
    setWeatherNote(null);
    try {
      const res = await fetch(`/api/weather?lat=${plotCoords.lat}&lng=${plotCoords.lng}`);
      const snap = (await res.json()) as WeatherSnapshot;
      if (snap.quotaExceeded || res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        setWeatherNote('Weather API quota reached. Using current soil inputs.');
        return;
      }
      if (!snap.available) {
        setWeatherNote(snap.message || 'Live Weather API unavailable for this location.');
        return;
      }

      setSoil((prev) => ({
        ...prev,
        temperatureC: snap.temperatureC ?? prev.temperatureC,
        humidityPct: snap.relativeHumidity ?? prev.humidityPct,
        rainfallMm: snap.precipMm && snap.precipMm > 0 ? Math.round(snap.precipMm * 10) : prev.rainfallMm,
      }));
      setWeatherNote(
        `Synced live weather (${snap.conditionText}): ${snap.temperatureC}°C · ${snap.relativeHumidity}% RH`
      );
    } catch {
      setWeatherNote('Unable to fetch weather conditions.');
    } finally {
      setWeatherLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      setProfileFeedback('Enter a plot name before saving.');
      return;
    }
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          farmerOrCoop: farmerOrCoop.trim() || 'Independent Farm',
          locationName: locationName.trim() || 'Field Plot',
          lat: plotCoords.lat,
          lng: plotCoords.lng,
          areaAcres: Number(areaAcres) || 1,
          soil,
          lastRecommendedCrop: result?.recommendations[0]?.crop,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      await loadProfiles();
      setProfileFeedback('Farm profile saved to cooperative registry.');
    } catch {
      setProfileFeedback('Could not save farm profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLoadProfile = (p: FarmProfile) => {
    setProfileName(p.name);
    setFarmerOrCoop(p.farmerOrCoop);
    setLocationName(p.locationName);
    setPlotCoords({ lat: p.lat, lng: p.lng });
    setAreaAcres(p.areaAcres);
    setSoil(p.soil);
    setProfileFeedback(`Loaded "${p.name}".`);
    void runClassifier(p.soil);
  };

  const handleDeleteProfile = async (id: string) => {
    await fetch(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadProfiles();
  };

  const selectedCrop: CropRecommendation | null =
    result?.recommendations[selectedCropIdx] ?? result?.recommendations[0] ?? null;

  const impactColor = (impact: string) => {
    if (impact === 'Optimal') return 'text-emerald-700';
    if (impact === 'Moderate Fit') return 'text-amber-700';
    return 'text-red-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Product 13 · Agronomic Suitability</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Soil-Based Crop Recommender
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Rank suitable crops from soil NPK, pH, texture, and plot microclimate with feature-importance attribution.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Soil Input Form + Google Maps Plot Picker */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Soil Chemistry & Climate</h2>
              <button
                type="button"
                onClick={() => void handleSyncWeather()}
                disabled={weatherLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {weatherLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudSun className="w-3.5 h-3.5 text-emerald-700" />
                )}
                Sync Plot Weather
              </button>
            </div>

            {weatherNote && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {weatherNote}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Nitrogen N (kg/ha)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={soil.nitrogen}
                  onChange={(e) => setSoil({ ...soil, nitrogen: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Phosphorus P (kg/ha)</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  value={soil.phosphorus}
                  onChange={(e) => setSoil({ ...soil, phosphorus: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Potassium K (kg/ha)</label>
                <input
                  type="number"
                  min={0}
                  max={220}
                  value={soil.potassium}
                  onChange={(e) => setSoil({ ...soil, potassium: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Soil pH (4.0–9.0)</label>
                <input
                  type="number"
                  step="0.1"
                  min={4}
                  max={9}
                  value={soil.ph}
                  onChange={(e) => setSoil({ ...soil, ph: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Rainfall / Moisture (mm)</label>
                <input
                  type="number"
                  min={10}
                  max={400}
                  value={soil.rainfallMm}
                  onChange={(e) => setSoil({ ...soil, rainfallMm: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Temperature (°C)</label>
                <input
                  type="number"
                  min={5}
                  max={48}
                  value={soil.temperatureC}
                  onChange={(e) => setSoil({ ...soil, temperatureC: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Humidity (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={soil.humidityPct}
                  onChange={(e) => setSoil({ ...soil, humidityPct: Number(e.target.value) })}
                  className="w-full text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Soil Type</label>
                <select
                  value={soil.soilType}
                  onChange={(e) => setSoil({ ...soil, soilType: e.target.value as SoilType })}
                  className="w-full text-xs px-2.5 py-2 rounded-lg border border-slate-300 bg-white"
                >
                  {SOIL_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void runClassifier(soil)}
              disabled={loadingRec}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {loadingRec ? 'Classifying Soil Profile...' : 'Recommend Suitable Crops'}
            </button>
          </div>

          {/* Farm Location Map & Save Profile */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Farm Plot & Profile Storage</h2>
              <span className="text-[11px] font-mono tabular-nums text-slate-500">
                {plotCoords.lat.toFixed(4)}, {plotCoords.lng.toFixed(4)}
              </span>
            </div>

            {hasKey ? (
              <>
                <FarmLocationSearch
                  onSelectLocation={(coords, label) => {
                    setPlotCoords(coords);
                    setLocationName(label);
                  }}
                />
                <div className="h-[190px] w-full rounded-lg overflow-hidden border border-slate-200">
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    center={plotCoords}
                    defaultZoom={9}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                    onClick={(ev) => {
                      if (ev.detail.latLng) {
                        setPlotCoords({
                          lat: ev.detail.latLng.lat,
                          lng: ev.detail.latLng.lng,
                        });
                      }
                    }}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  >
                    <AdvancedMarker position={plotCoords} title={profileName}>
                      <Pin background="#15803d" borderColor="#ffffff" glyphColor="#ffffff" />
                    </AdvancedMarker>
                  </GoogleMap>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                Enter plot details below to save to your farm registry.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Plot name"
                className="text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
              <input
                type="text"
                value={farmerOrCoop}
                onChange={(e) => setFarmerOrCoop(e.target.value)}
                placeholder="Farmer / cooperative"
                className="text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="District / village"
                className="text-xs px-3 py-2 rounded-lg border border-slate-300"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={areaAcres}
                  onChange={(e) => setAreaAcres(Number(e.target.value))}
                  aria-label="Area in acres"
                  className="w-24 text-xs font-mono tabular-nums px-3 py-2 rounded-lg border border-slate-300"
                />
                <span className="text-xs text-slate-500">Acres</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-emerald-700" />
              {savingProfile ? 'Saving Profile...' : 'Save Farm Profile'}
            </button>

            {profileFeedback && (
              <p className="text-xs text-emerald-800 font-medium">{profileFeedback}</p>
            )}
          </div>
        </div>

        {/* Right: Ranked Crop Recommendations + Feature Importance + Saved Profiles */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Top Ranked Crop Recommendations
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {result?.soilSummary ?? 'Run soil classifier to view ranked crops'}
                </p>
              </div>
              <span className="text-xs text-slate-500">Click any crop to inspect factor weights</span>
            </div>

            <div className="divide-y divide-slate-100">
              {(result?.recommendations ?? []).map((rec, idx) => {
                const isSelected = idx === selectedCropIdx;
                return (
                  <button
                    key={rec.crop}
                    type="button"
                    onClick={() => setSelectedCropIdx(idx)}
                    className={`w-full text-left py-3.5 px-3 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer ${
                      isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-400">0{idx + 1}</span>
                        <span className="text-sm font-semibold text-slate-900">{rec.crop}</span>
                        <span className="text-xs text-slate-500 italic">{rec.scientificName}</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        {rec.season} · {rec.growingWindowDays} days · Yield {rec.expectedYieldQtlPerHa} qtl/ha · Water: {rec.waterRequirement}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-28 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-full"
                          style={{ width: `${rec.suitabilityScore}%` }}
                        />
                      </div>
                      <span className="text-sm font-mono tabular-nums font-semibold text-slate-900 w-11 text-right">
                        {rec.suitabilityScore}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feature Importance Explanation */}
          {selectedCrop && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Feature Importance · {selectedCrop.crop}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedCrop.notes}</p>
                </div>
                <span className="text-sm font-mono tabular-nums font-semibold text-emerald-700">
                  {selectedCrop.suitabilityScore}% Match
                </span>
              </div>

              <div className="space-y-2.5">
                {selectedCrop.featureImportance.map((feat) => (
                  <div key={feat.feature} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-800">{feat.feature}</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {feat.inputValue}
                        </span>
                        <span className="text-[11px] text-slate-400 hidden sm:inline">
                          (Target {feat.idealRange})
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[11px] font-medium ${impactColor(feat.impact)}`}>
                          {feat.impact}
                        </span>
                        <span className="font-mono tabular-nums text-slate-700 w-9 text-right">
                          {feat.contributionPct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          feat.impact === 'Optimal'
                            ? 'bg-emerald-600'
                            : feat.impact === 'Moderate Fit'
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, feat.contributionPct * 3)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Saved Farm Profiles Registry */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Saved Farm Profiles</h3>
              <span className="text-xs text-slate-500 tabular-nums">{profiles.length} stored</span>
            </div>

            {profiles.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                No saved farm profiles yet. Save your current soil test to reuse it later.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {p.locationName} · {p.areaAcres} ac · {p.soil.soilType} · N-P-K{' '}
                        <span className="font-mono tabular-nums">
                          {p.soil.nitrogen}-{p.soil.phosphorus}-{p.soil.potassium}
                        </span>
                        {p.lastRecommendedCrop ? ` · Top: ${p.lastRecommendedCrop}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadProfile(p)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap cursor-pointer"
                      >
                        Load Plot
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteProfile(p.id)}
                        aria-label={`Delete ${p.name}`}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-200 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
