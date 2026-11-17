export interface AgronomyKbChunk {
  id: string;
  title: string;
  crops: string[];
  keywords: string[];
  guidance: string;
}

export const AGRONOMY_KB: AgronomyKbChunk[] = [
  {
    id: 'pv-early-blight',
    title: 'PlantVillage Reference: Early Blight (Alternaria solani)',
    crops: ['tomato', 'potato', 'eggplant'],
    keywords: ['early blight', 'alternaria', 'concentric', 'target', 'ring', 'brown spot', 'yellow halo', 'tomato', 'potato'],
    guidance:
      'Early blight (Alternaria solani) forms dark brown concentric rings ("target spots") surrounded by chlorotic yellow tissue on older lower leaves first. Cultural control: prune lower infected leaves cleanly, mulch base to block soil splash, switch from overhead watering to drip irrigation, and avoid nitrogen excess. Organic spray: copper oxychloride or Bacillus subtilis bio-fungicide every 7-10 days. Chemical rotation: Mancozeb (75% WP @ 2g/L) or Azoxystrobin following local pre-harvest interval (PHI 3-7 days).'
  },
  {
    id: 'pv-late-blight',
    title: 'PlantVillage Reference: Late Blight (Phytophthora infestans)',
    crops: ['tomato', 'potato'],
    keywords: ['late blight', 'phytophthora', 'water-soaked', 'white mold', 'humid', 'cool', 'blight'],
    guidance:
      'Late blight (Phytophthora infestans) spreads rapidly in cool, humid weather (>85% RH, 15-22C), producing water-soaked dark lesions with pale white sporulation on the leaf underside. Immediate isolation: remove and bag heavily infected plants (do not compost). Apply protectant/systemic fungicide (Metalaxyl-M + Mancozeb or Cymoxanil) at first detection before canopy collapse. Ensure wide plant spacing and morning-only irrigation.'
  },
  {
    id: 'pv-powdery-mildew',
    title: 'PlantVillage Reference: Powdery Mildew (Erysiphales)',
    crops: ['squash', 'cucumber', 'wheat', 'grape', 'pea', 'cucurbit'],
    keywords: ['powdery mildew', 'white powder', 'flour', 'fungal', 'mildew', 'squash', 'cucurbit', 'wheat'],
    guidance:
      'Powdery mildew presents as talcum-like white fungal colonies on upper leaf surfaces, thriving in warm days and high canopy humidity without requiring free water on leaves. Organic interventions: wettable sulfur (2-3g/L, avoid applying above 32C to prevent leaf scorch), potassium bicarbonate (5g/L), or neem oil (3mL/L) sprayed at dusk. Prune dense interior foliage to increase airflow and sunlight penetration.'
  },
  {
    id: 'pv-bacterial-spot',
    title: 'PlantVillage Reference: Bacterial Spot & Blight (Xanthomonas / Pseudomonas)',
    crops: ['pepper', 'tomato', 'rice', 'cotton'],
    keywords: ['bacterial', 'xanthomonas', 'greasy', 'halo', 'leaf spot', 'blight', 'rice', 'pepper'],
    guidance:
      'Bacterial leaf spots create small, dark, water-soaked lesions that turn necrotic and may drop out ("shot-hole" appearance). Antibiotics alone lose efficacy; combine fixed copper bactericides with Mancozeb tank-mixes, sanitize pruning shears with 10% bleach or 70% alcohol between rows, avoid working in wet fields, and plant certified pathogen-free seed.'
  },
  {
    id: 'pv-rice-blast',
    title: 'ICAR Extension: Rice Blast & Brown Spot Management',
    crops: ['rice', 'paddy', 'corn', 'maize'],
    keywords: ['rice', 'paddy', 'blast', 'diamond', 'spindle', 'brown spot', 'maize', 'rust'],
    guidance:
      'Rice blast (Magnaporthe oryzae) produces diamond/spindle-shaped lesions with gray centers and brown margins. Avoid excessive split doses of urea nitrogen, maintain 2-5 cm standing water during vegetative phase rather than deep drought stress, and apply Tricyclazole 75% WP (0.6g/L) or Isoprothiolane at booting if lesions exceed 5% leaf area.'
  },
  {
    id: 'pv-nutrient-chlorosis',
    title: 'Agronomy Guide: Nutrient Deficiency vs Infectious Disease',
    crops: ['all'],
    keywords: ['yellow', 'chlorosis', 'nitrogen', 'potassium', 'magnesium', 'iron', 'nutrient', 'deficiency', 'healthy'],
    guidance:
      'Symmetric yellowing across entire lower leaves usually points to mobile nutrient deficiency (Nitrogen), interveinal yellowing on older leaves suggests Magnesium, and burnt leaf margins suggest Potassium deficiency — unlike infectious lesions which appear asymmetrically with distinct margins. Confirm with soil testing before applying foliar NPK or micronutrient chelates.'
  },
  {
    id: 'pv-ipm-safety',
    title: 'Extension Safety Protocol: Spray Timing, PPE & Pollinator Protection',
    crops: ['all'],
    keywords: ['spray', 'dosage', 'safe', 'organic', 'neem', 'copper', 'harvest', 'phi', 'time', 'prevent'],
    guidance:
      'Spray fungicides or bio-controls early morning (6-9 AM) or late afternoon when wind speed is under 10 km/h and bees are inactive. Always observe the Pre-Harvest Interval (PHI): 1-3 days for neem/Bacillus bio-controls, 3-7 days for copper/mancozeb, and 7-14 days for systemic triazoles. Wear gloves, eye protection, and wash spray equipment away from water channels.'
  }
];

export function retrieveAgronomyContext(query: string, cropHint?: string, diseaseHint?: string): AgronomyKbChunk[] {
  const haystack = `${query} ${cropHint ?? ''} ${diseaseHint ?? ''}`.toLowerCase();
  const scored = AGRONOMY_KB.map((chunk) => {
    let score = 0;
    for (const kw of chunk.keywords) {
      if (haystack.includes(kw)) score += 3;
    }
    for (const crop of chunk.crops) {
      if (crop === 'all') {
        score += 0.5;
      } else if (haystack.includes(crop)) {
        score += 2;
      }
    }
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((item) => item.chunk);
}
