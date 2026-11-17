export type ProductModule =
  | 'overview'
  | 'disease'
  | 'mandi'
  | 'crops'
  | 'irrigation';

export interface DiseaseAnalysisResult {
  isPlantLeaf: boolean;
  cropSpecies: string;
  diseaseName: string;
  pathogenType: 'Fungal' | 'Bacterial' | 'Viral' | 'Nutrient Deficiency' | 'Healthy' | 'Unknown';
  confidencePercent: number;
  severity: 'None' | 'Low' | 'Moderate' | 'High';
  summary: string;
  visualSymptoms: string[];
  immediateActions: string[];
  organicTreatments: string[];
  chemicalControls: string[];
  preventivePractices: string[];
}

export interface AdvisorChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
  timestamp: string;
}

export interface MandiLocation {
  id: string;
  name: string;
  state: string;
  district: string;
  lat: number;
  lng: number;
  type: 'Primary APMC' | 'Terminal Market' | 'Cooperative Yard';
}

export interface MandiPricePoint {
  date: string;
  modalPrice: number | null;
  forecastPrice: number | null;
  lowerBand80: number | null;
  upperBand80: number | null;
  lowerBand95: number | null;
  upperBand95: number | null;
  isForecast: boolean;
}

export interface MandiMarketComparison {
  mandiId: string;
  mandiName: string;
  state: string;
  lat: number;
  lng: number;
  currentModalPrice: number;
  minPrice: number;
  maxPrice: number;
  arrivalsTonnes: number;
  forecast7dPrice: number;
  forecast14dPrice: number;
  expectedDeltaPct: number;
  recommendation: 'Sell Now' | 'Hold 5-7 Days' | 'Staggered Sale';
}

export interface MandiDashboardResponse {
  commodity: string;
  unit: string;
  selectedMandi: MandiLocation;
  mandis: MandiLocation[];
  commodities: string[];
  lastRefreshedAt: string;
  currentModalPrice: number;
  priceChange7dPct: number;
  forecast14dPrice: number;
  forecastDeltaPct: number;
  volatilityPct: number;
  bestSellWindow: string;
  sellSignal: 'Sell Now' | 'Hold 5-7 Days' | 'Staggered Sale';
  series: MandiPricePoint[];
  comparisons: MandiMarketComparison[];
}

export type SoilType = 'Alluvial' | 'Black Cotton' | 'Red Loam' | 'Sandy Loam' | 'Clay';

export interface SoilInput {
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  ph: number;
  rainfallMm: number;
  temperatureC: number;
  humidityPct: number;
  soilType: SoilType;
}

export interface FeatureImportanceItem {
  feature: string;
  inputValue: string;
  idealRange: string;
  contributionPct: number;
  impact: 'Optimal' | 'Moderate Fit' | 'Limiting Factor';
}

export interface CropRecommendation {
  crop: string;
  scientificName: string;
  season: string;
  suitabilityScore: number;
  expectedYieldQtlPerHa: string;
  growingWindowDays: number;
  waterRequirement: 'Low' | 'Moderate' | 'High';
  notes: string;
  featureImportance: FeatureImportanceItem[];
}

export interface CropRecommendResponse {
  recommendedAt: string;
  soilSummary: string;
  recommendations: CropRecommendation[];
}

export interface FarmProfile {
  id: string;
  name: string;
  farmerOrCoop: string;
  locationName: string;
  lat: number;
  lng: number;
  areaAcres: number;
  soil: SoilInput;
  lastRecommendedCrop?: string;
  updatedAt: string;
}

export interface MoistureForecastPoint {
  hourOffset: number;
  label: string;
  predictedMoisturePct: number;
  lowerBoundPct: number;
  upperBoundPct: number;
}

export interface IrrigationZone {
  id: string;
  name: string;
  crop: string;
  areaHectares: number;
  lat: number;
  lng: number;
  moisturePct: number;
  soilTempC: number;
  ecDsM: number;
  flowRateLpm: number;
  minThresholdPct: number;
  targetMoisturePct: number;
  valveOpen: boolean;
  mode: 'AUTO_ML' | 'MANUAL';
  hoursUntilThreshold: number | null;
  status: 'Optimal' | 'Irrigating' | 'Moisture Low' | 'Critical Stress';
  forecast24h: MoistureForecastPoint[];
  lastUpdated: string;
}

export interface IrrigationAlert {
  id: string;
  zoneId: string;
  zoneName: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
}

export interface IrrigationSystemState {
  zones: IrrigationZone[];
  alerts: IrrigationAlert[];
  totalFlowLpm: number;
  dailyWaterLitres: number;
  waterSavedPct: number;
  connectedClients: number;
  serverTime: string;
}

export interface WeatherSnapshot {
  available: boolean;
  quotaExceeded?: boolean;
  source: string;
  temperatureC?: number;
  relativeHumidity?: number;
  precipMm?: number;
  windKmh?: number;
  conditionText?: string;
  iconUri?: string;
  observedAt?: string;
  message?: string;
}
