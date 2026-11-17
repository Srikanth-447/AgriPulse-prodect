import fs from 'node:fs';
import path from 'node:path';
import type {
  CropRecommendation,
  CropRecommendResponse,
  FarmProfile,
  FeatureImportanceItem,
  SoilInput,
  SoilType,
} from '../src/types/agri.ts';

interface CropAgronomySpec {
  crop: string;
  scientificName: string;
  season: string;
  expectedYieldQtlPerHa: string;
  growingWindowDays: number;
  waterRequirement: 'Low' | 'Moderate' | 'High';
  notes: string;
  preferredSoils: SoilType[];
  opt: {
    nitrogen: [number, number];
    phosphorus: [number, number];
    potassium: [number, number];
    ph: [number, number];
    rainfallMm: [number, number];
    temperatureC: [number, number];
    humidityPct: [number, number];
  };
  weights: {
    nitrogen: number;
    phosphorus: number;
    potassium: number;
    ph: number;
    rainfallMm: number;
    temperatureC: number;
    humidityPct: number;
    soilType: number;
  };
}

const CROP_SPECS: CropAgronomySpec[] = [
  {
    crop: 'Rice (Paddy)',
    scientificName: 'Oryza sativa',
    season: 'Kharif (Monsoon)',
    expectedYieldQtlPerHa: '42 - 58',
    growingWindowDays: 125,
    waterRequirement: 'High',
    notes: 'Thrives in high-moisture clay/alluvial soils with standing water during tillering.',
    preferredSoils: ['Alluvial', 'Clay'],
    opt: {
      nitrogen: [75, 115],
      phosphorus: [35, 60],
      potassium: [35, 55],
      ph: [5.5, 7.0],
      rainfallMm: [160, 290],
      temperatureC: [22, 32],
      humidityPct: [72, 92],
    },
    weights: { nitrogen: 0.16, phosphorus: 0.1, potassium: 0.1, ph: 0.12, rainfallMm: 0.22, temperatureC: 0.12, humidityPct: 0.1, soilType: 0.08 },
  },
  {
    crop: 'Wheat',
    scientificName: 'Triticum aestivum',
    season: 'Rabi (Winter)',
    expectedYieldQtlPerHa: '38 - 52',
    growingWindowDays: 130,
    waterRequirement: 'Moderate',
    notes: 'Performs best in well-drained loamy/alluvial soils with cool vegetative winters.',
    preferredSoils: ['Alluvial', 'Clay', 'Sandy Loam'],
    opt: {
      nitrogen: [70, 120],
      phosphorus: [40, 65],
      potassium: [35, 60],
      ph: [6.0, 7.6],
      rainfallMm: [45, 110],
      temperatureC: [14, 24],
      humidityPct: [45, 70],
    },
    weights: { nitrogen: 0.18, phosphorus: 0.13, potassium: 0.1, ph: 0.12, rainfallMm: 0.15, temperatureC: 0.18, humidityPct: 0.06, soilType: 0.08 },
  },
  {
    crop: 'Maize',
    scientificName: 'Zea mays',
    season: 'Kharif / Spring',
    expectedYieldQtlPerHa: '45 - 65',
    growingWindowDays: 105,
    waterRequirement: 'Moderate',
    notes: 'High nitrogen responder; sensitive to waterlogging so avoid heavy undrained clay.',
    preferredSoils: ['Alluvial', 'Red Loam', 'Sandy Loam'],
    opt: {
      nitrogen: [65, 110],
      phosphorus: [35, 60],
      potassium: [25, 50],
      ph: [5.8, 7.2],
      rainfallMm: [65, 140],
      temperatureC: [20, 30],
      humidityPct: [55, 78],
    },
    weights: { nitrogen: 0.2, phosphorus: 0.12, potassium: 0.1, ph: 0.12, rainfallMm: 0.16, temperatureC: 0.14, humidityPct: 0.08, soilType: 0.08 },
  },
  {
    crop: 'Cotton',
    scientificName: 'Gossypium hirsutum',
    season: 'Kharif',
    expectedYieldQtlPerHa: '22 - 34',
    growingWindowDays: 165,
    waterRequirement: 'Moderate',
    notes: 'Deep black cotton soils retain moisture for boll development with warm sunny skies.',
    preferredSoils: ['Black Cotton', 'Alluvial'],
    opt: {
      nitrogen: [80, 130],
      phosphorus: [40, 65],
      potassium: [30, 55],
      ph: [6.5, 8.2],
      rainfallMm: [60, 120],
      temperatureC: [24, 35],
      humidityPct: [50, 72],
    },
    weights: { nitrogen: 0.16, phosphorus: 0.1, potassium: 0.12, ph: 0.14, rainfallMm: 0.14, temperatureC: 0.14, humidityPct: 0.06, soilType: 0.14 },
  },
  {
    crop: 'Soybean',
    scientificName: 'Glycine max',
    season: 'Kharif',
    expectedYieldQtlPerHa: '20 - 30',
    growingWindowDays: 100,
    waterRequirement: 'Moderate',
    notes: 'Legume crop fixing atmospheric nitrogen; thrives on moderate phosphorus and black/loam soils.',
    preferredSoils: ['Black Cotton', 'Red Loam', 'Alluvial'],
    opt: {
      nitrogen: [20, 50],
      phosphorus: [45, 75],
      potassium: [30, 55],
      ph: [6.0, 7.4],
      rainfallMm: [75, 145],
      temperatureC: [22, 31],
      humidityPct: [58, 80],
    },
    weights: { nitrogen: 0.12, phosphorus: 0.2, potassium: 0.12, ph: 0.14, rainfallMm: 0.16, temperatureC: 0.12, humidityPct: 0.06, soilType: 0.08 },
  },
  {
    crop: 'Chickpea (Gram)',
    scientificName: 'Cicer arietinum',
    season: 'Rabi (Winter)',
    expectedYieldQtlPerHa: '16 - 24',
    growingWindowDays: 110,
    waterRequirement: 'Low',
    notes: 'Drought-tolerant winter pulse ideal for residual soil moisture and lower rainfall.',
    preferredSoils: ['Sandy Loam', 'Black Cotton', 'Alluvial'],
    opt: {
      nitrogen: [20, 48],
      phosphorus: [45, 75],
      potassium: [40, 75],
      ph: [6.2, 8.0],
      rainfallMm: [35, 85],
      temperatureC: [16, 25],
      humidityPct: [30, 55],
    },
    weights: { nitrogen: 0.12, phosphorus: 0.18, potassium: 0.14, ph: 0.12, rainfallMm: 0.18, temperatureC: 0.12, humidityPct: 0.08, soilType: 0.06 },
  },
  {
    crop: 'Mustard',
    scientificName: 'Brassica juncea',
    season: 'Rabi (Winter)',
    expectedYieldQtlPerHa: '15 - 22',
    growingWindowDays: 115,
    waterRequirement: 'Low',
    notes: 'Cool-season oilseed requiring light irrigation and moderate sulfur/phosphorus.',
    preferredSoils: ['Sandy Loam', 'Alluvial'],
    opt: {
      nitrogen: [50, 85],
      phosphorus: [30, 55],
      potassium: [25, 45],
      ph: [6.0, 7.6],
      rainfallMm: [30, 75],
      temperatureC: [14, 24],
      humidityPct: [35, 62],
    },
    weights: { nitrogen: 0.15, phosphorus: 0.12, potassium: 0.1, ph: 0.12, rainfallMm: 0.18, temperatureC: 0.18, humidityPct: 0.07, soilType: 0.08 },
  },
  {
    crop: 'Groundnut',
    scientificName: 'Arachis hypogaea',
    season: 'Kharif / Summer',
    expectedYieldQtlPerHa: '22 - 32',
    growingWindowDays: 115,
    waterRequirement: 'Low',
    notes: 'Requires friable sandy or red loam soils so pegs can penetrate easily.',
    preferredSoils: ['Sandy Loam', 'Red Loam'],
    opt: {
      nitrogen: [20, 45],
      phosphorus: [40, 70],
      potassium: [35, 60],
      ph: [5.8, 7.2],
      rainfallMm: [50, 115],
      temperatureC: [24, 33],
      humidityPct: [45, 72],
    },
    weights: { nitrogen: 0.11, phosphorus: 0.16, potassium: 0.13, ph: 0.12, rainfallMm: 0.15, temperatureC: 0.13, humidityPct: 0.06, soilType: 0.14 },
  },
  {
    crop: 'Tomato',
    scientificName: 'Solanum lycopersicum',
    season: 'Year-round / Rabi-Summer',
    expectedYieldQtlPerHa: '240 - 380',
    growingWindowDays: 95,
    waterRequirement: 'Moderate',
    notes: 'Responds strongly to balanced NPK and drip fertigation on well-drained red/alluvial loam.',
    preferredSoils: ['Red Loam', 'Alluvial', 'Sandy Loam'],
    opt: {
      nitrogen: [75, 115],
      phosphorus: [50, 80],
      potassium: [55, 95],
      ph: [6.0, 7.0],
      rainfallMm: [55, 110],
      temperatureC: [19, 28],
      humidityPct: [50, 72],
    },
    weights: { nitrogen: 0.15, phosphorus: 0.15, potassium: 0.18, ph: 0.14, rainfallMm: 0.12, temperatureC: 0.14, humidityPct: 0.06, soilType: 0.06 },
  },
  {
    crop: 'Onion',
    scientificName: 'Allium cepa',
    season: 'Rabi / Late Kharif',
    expectedYieldQtlPerHa: '210 - 310',
    growingWindowDays: 120,
    waterRequirement: 'Moderate',
    notes: 'Prefers potash-rich loamy soil with moderate moisture and dry curing weather at maturity.',
    preferredSoils: ['Red Loam', 'Black Cotton', 'Alluvial'],
    opt: {
      nitrogen: [65, 100],
      phosphorus: [40, 65],
      potassium: [60, 100],
      ph: [6.0, 7.4],
      rainfallMm: [45, 95],
      temperatureC: [18, 29],
      humidityPct: [45, 68],
    },
    weights: { nitrogen: 0.14, phosphorus: 0.12, potassium: 0.22, ph: 0.12, rainfallMm: 0.14, temperatureC: 0.12, humidityPct: 0.08, soilType: 0.06 },
  },
  {
    crop: 'Potato',
    scientificName: 'Solanum tuberosum',
    season: 'Rabi (Cool Season)',
    expectedYieldQtlPerHa: '220 - 320',
    growingWindowDays: 100,
    waterRequirement: 'Moderate',
    notes: 'Tuber bulking favors slightly acidic loose loam, high potassium, and cool night temperatures.',
    preferredSoils: ['Sandy Loam', 'Alluvial', 'Red Loam'],
    opt: {
      nitrogen: [80, 125],
      phosphorus: [55, 85],
      potassium: [80, 130],
      ph: [5.2, 6.6],
      rainfallMm: [50, 100],
      temperatureC: [14, 22],
      humidityPct: [55, 78],
    },
    weights: { nitrogen: 0.15, phosphorus: 0.14, potassium: 0.22, ph: 0.14, rainfallMm: 0.11, temperatureC: 0.14, humidityPct: 0.04, soilType: 0.06 },
  },
  {
    crop: 'Pearl Millet (Bajra)',
    scientificName: 'Cenchrus americanus',
    season: 'Kharif (Arid)',
    expectedYieldQtlPerHa: '18 - 28',
    growingWindowDays: 85,
    waterRequirement: 'Low',
    notes: 'Hardy climate-resilient grain suited to low-fertility sandy soils and high heat.',
    preferredSoils: ['Sandy Loam', 'Red Loam'],
    opt: {
      nitrogen: [30, 65],
      phosphorus: [20, 40],
      potassium: [20, 45],
      ph: [6.2, 8.2],
      rainfallMm: [25, 70],
      temperatureC: [26, 36],
      humidityPct: [30, 58],
    },
    weights: { nitrogen: 0.12, phosphorus: 0.1, potassium: 0.08, ph: 0.1, rainfallMm: 0.24, temperatureC: 0.18, humidityPct: 0.1, soilType: 0.08 },
  },
];

function rangeScore(value: number, [min, max]: [number, number], scalePadding: number): number {
  if (value >= min && value <= max) {
    const mid = (min + max) / 2;
    const half = Math.max((max - min) / 2, 0.01);
    const distFromCenter = Math.abs(value - mid) / half;
    return 1 - distFromCenter * 0.08; // 0.92 - 1.00 inside optimum range
  }
  const dist = value < min ? min - value : value - max;
  const span = Math.max(max - min, scalePadding);
  return Math.exp(-Math.pow(dist / (span * 0.85), 2));
}

export function recommendCrops(soil: SoilInput): CropRecommendResponse {
  const results: CropRecommendation[] = CROP_SPECS.map((spec) => {
    const scores = {
      nitrogen: rangeScore(soil.nitrogen, spec.opt.nitrogen, 25),
      phosphorus: rangeScore(soil.phosphorus, spec.opt.phosphorus, 20),
      potassium: rangeScore(soil.potassium, spec.opt.potassium, 20),
      ph: rangeScore(soil.ph, spec.opt.ph, 0.8),
      rainfallMm: rangeScore(soil.rainfallMm, spec.opt.rainfallMm, 35),
      temperatureC: rangeScore(soil.temperatureC, spec.opt.temperatureC, 5),
      humidityPct: rangeScore(soil.humidityPct, spec.opt.humidityPct, 15),
      soilType: spec.preferredSoils.includes(soil.soilType) ? 1.0 : 0.45,
    };

    const weightedTotal =
      scores.nitrogen * spec.weights.nitrogen +
      scores.phosphorus * spec.weights.phosphorus +
      scores.potassium * spec.weights.potassium +
      scores.ph * spec.weights.ph +
      scores.rainfallMm * spec.weights.rainfallMm +
      scores.temperatureC * spec.weights.temperatureC +
      scores.humidityPct * spec.weights.humidityPct +
      scores.soilType * spec.weights.soilType;

    const rawParts: Array<{
      feature: string;
      inputValue: string;
      idealRange: string;
      weightedScore: number;
      rawScore: number;
    }> = [
      {
        feature: 'Nitrogen (N)',
        inputValue: `${soil.nitrogen} kg/ha`,
        idealRange: `${spec.opt.nitrogen[0]}-${spec.opt.nitrogen[1]} kg/ha`,
        weightedScore: scores.nitrogen * spec.weights.nitrogen,
        rawScore: scores.nitrogen,
      },
      {
        feature: 'Phosphorus (P)',
        inputValue: `${soil.phosphorus} kg/ha`,
        idealRange: `${spec.opt.phosphorus[0]}-${spec.opt.phosphorus[1]} kg/ha`,
        weightedScore: scores.phosphorus * spec.weights.phosphorus,
        rawScore: scores.phosphorus,
      },
      {
        feature: 'Potassium (K)',
        inputValue: `${soil.potassium} kg/ha`,
        idealRange: `${spec.opt.potassium[0]}-${spec.opt.potassium[1]} kg/ha`,
        weightedScore: scores.potassium * spec.weights.potassium,
        rawScore: scores.potassium,
      },
      {
        feature: 'Soil pH',
        inputValue: `${soil.ph.toFixed(1)}`,
        idealRange: `${spec.opt.ph[0].toFixed(1)}-${spec.opt.ph[1].toFixed(1)}`,
        weightedScore: scores.ph * spec.weights.ph,
        rawScore: scores.ph,
      },
      {
        feature: 'Rainfall / Moisture',
        inputValue: `${soil.rainfallMm} mm`,
        idealRange: `${spec.opt.rainfallMm[0]}-${spec.opt.rainfallMm[1]} mm`,
        weightedScore: scores.rainfallMm * spec.weights.rainfallMm,
        rawScore: scores.rainfallMm,
      },
      {
        feature: 'Temperature',
        inputValue: `${soil.temperatureC}°C`,
        idealRange: `${spec.opt.temperatureC[0]}-${spec.opt.temperatureC[1]}°C`,
        weightedScore: scores.temperatureC * spec.weights.temperatureC,
        rawScore: scores.temperatureC,
      },
      {
        feature: 'Humidity',
        inputValue: `${soil.humidityPct}%`,
        idealRange: `${spec.opt.humidityPct[0]}-${spec.opt.humidityPct[1]}%`,
        weightedScore: scores.humidityPct * spec.weights.humidityPct,
        rawScore: scores.humidityPct,
      },
      {
        feature: 'Soil Texture',
        inputValue: soil.soilType,
        idealRange: spec.preferredSoils.join(', '),
        weightedScore: scores.soilType * spec.weights.soilType,
        rawScore: scores.soilType,
      },
    ];

    const sumWeighted = rawParts.reduce((acc, p) => acc + p.weightedScore, 0) || 1;

    const featureImportance: FeatureImportanceItem[] = rawParts
      .map((p) => ({
        feature: p.feature,
        inputValue: p.inputValue,
        idealRange: p.idealRange,
        contributionPct: Math.round((p.weightedScore / sumWeighted) * 100),
        impact: (p.rawScore >= 0.85 ? 'Optimal' : p.rawScore >= 0.55 ? 'Moderate Fit' : 'Limiting Factor') as FeatureImportanceItem['impact'],
      }))
      .sort((a, b) => b.contributionPct - a.contributionPct);

    return {
      crop: spec.crop,
      scientificName: spec.scientificName,
      season: spec.season,
      suitabilityScore: Math.min(99, Math.max(12, Math.round(weightedTotal * 100))),
      expectedYieldQtlPerHa: spec.expectedYieldQtlPerHa,
      growingWindowDays: spec.growingWindowDays,
      waterRequirement: spec.waterRequirement,
      notes: spec.notes,
      featureImportance,
    };
  });

  results.sort((a, b) => b.suitabilityScore - a.suitabilityScore);

  const phDesc = soil.ph < 6.0 ? 'slightly acidic' : soil.ph > 7.5 ? 'alkaline' : 'neutral';
  const soilSummary = `${soil.soilType} profile (${phDesc}, pH ${soil.ph.toFixed(1)}) with N-P-K ${soil.nitrogen}-${soil.phosphorus}-${soil.potassium} kg/ha at ${soil.temperatureC}°C.`;

  return {
    recommendedAt: new Date().toISOString(),
    soilSummary,
    recommendations: results.slice(0, 5),
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const PROFILES_PATH = path.join(DATA_DIR, 'farm-profiles.json');

const DEFAULT_PROFILES: FarmProfile[] = [
  {
    id: 'nashik-plot-01',
    name: 'Godavari Valley Plot A',
    farmerOrCoop: 'Sahyadri Growers Cooperative',
    locationName: 'Nashik, Maharashtra',
    lat: 20.011,
    lng: 73.7903,
    areaAcres: 6.5,
    soil: {
      nitrogen: 88,
      phosphorus: 56,
      potassium: 74,
      ph: 6.6,
      rainfallMm: 82,
      temperatureC: 24,
      humidityPct: 62,
      soilType: 'Red Loam',
    },
    lastRecommendedCrop: 'Tomato',
    updatedAt: '2026-11-12T08:30:00.000Z',
  },
  {
    id: 'karnal-plot-02',
    name: 'Yamuna Alluvial Block 4',
    farmerOrCoop: 'Karnal Grain Producers',
    locationName: 'Karnal, Haryana',
    lat: 29.6857,
    lng: 76.9905,
    areaAcres: 12.0,
    soil: {
      nitrogen: 94,
      phosphorus: 52,
      potassium: 46,
      ph: 7.1,
      rainfallMm: 68,
      temperatureC: 19,
      humidityPct: 58,
      soilType: 'Alluvial',
    },
    lastRecommendedCrop: 'Wheat',
    updatedAt: '2026-11-14T10:15:00.000Z',
  },
  {
    id: 'indore-plot-03',
    name: 'Malwa Black Cotton Sector',
    farmerOrCoop: 'Malwa Krishi Samiti',
    locationName: 'Indore, Madhya Pradesh',
    lat: 22.7196,
    lng: 75.8577,
    areaAcres: 9.2,
    soil: {
      nitrogen: 42,
      phosphorus: 62,
      potassium: 48,
      ph: 7.2,
      rainfallMm: 95,
      temperatureC: 26,
      humidityPct: 64,
      soilType: 'Black Cotton',
    },
    lastRecommendedCrop: 'Soybean',
    updatedAt: '2026-11-15T14:20:00.000Z',
  },
];

function ensureStore(): FarmProfile[] {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROFILES_PATH)) {
      fs.writeFileSync(PROFILES_PATH, JSON.stringify(DEFAULT_PROFILES, null, 2), 'utf-8');
      return DEFAULT_PROFILES;
    }
    const raw = fs.readFileSync(PROFILES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as FarmProfile[];
    return Array.isArray(parsed) ? parsed : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function listFarmProfiles(): FarmProfile[] {
  return ensureStore();
}

export function saveFarmProfile(input: Omit<FarmProfile, 'id' | 'updatedAt'> & { id?: string }): FarmProfile {
  const profiles = ensureStore();
  const id = input.id && input.id.trim() ? input.id.trim() : `farm-${Date.now()}`;
  const profile: FarmProfile = {
    ...input,
    id,
    updatedAt: new Date().toISOString(),
  };

  const idx = profiles.findIndex((p) => p.id === id);
  if (idx >= 0) {
    profiles[idx] = profile;
  } else {
    profiles.unshift(profile);
  }

  try {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(profiles, null, 2), 'utf-8');
  } catch {
    // non-fatal on read-only fs fallback
  }
  return profile;
}

export function deleteFarmProfile(id: string): boolean {
  const profiles = ensureStore();
  const next = profiles.filter((p) => p.id !== id);
  if (next.length === profiles.length) return false;
  try {
    fs.writeFileSync(PROFILES_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch {
    // ignore
  }
  return true;
}
