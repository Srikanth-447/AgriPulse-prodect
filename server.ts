import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { retrieveAgronomyContext } from './server/agronomyKb.ts';
import { getMandiDashboard } from './server/mandiEngine.ts';
import {
  deleteFarmProfile,
  listFarmProfiles,
  recommendCrops,
  saveFarmProfile,
} from './server/cropEngine.ts';
import { IrrigationControllerEngine } from './server/irrigationEngine.ts';
import type { DiseaseAnalysisResult, SoilInput } from './src/types/agri.ts';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getMapsApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Check GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit or quota exceeded. Please retry shortly.',
    };
  }
  return {
    status: 502,
    message: `Gemini service error: ${raw}`,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  const irrigationEngine = new IrrigationControllerEngine();

  // Runtime configuration endpoint (never exposes GEMINI_API_KEY)
  app.get('/api/config', (_req, res) => {
    const mapsKey = getMapsApiKey();
    res.json({
      mapsApiKey: mapsKey,
      mapsConfigured: Boolean(mapsKey),
    });
  });

  // Google Maps Platform Weather API server proxy
  app.get('/api/weather', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ available: false, source: 'Google Maps Weather API', message: 'Valid lat and lng required.' });
      return;
    }

    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(200).json({
        available: false,
        source: 'Google Maps Weather API',
        message: 'Google Maps API key not detected in server environment.',
      });
      return;
    }

    try {
      const url = new URL('https://weather.googleapis.com/v1/currentConditions:lookup');
      url.searchParams.append('key', apiKey);
      url.searchParams.append('location.latitude', String(lat));
      url.searchParams.append('location.longitude', String(lng));

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });

      const payload = (await response.json()) as Record<string, unknown>;

      if (response.status === 429 || (payload as { error?: { status?: string } })?.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          available: false,
          quotaExceeded: true,
          source: 'Google Maps Weather API',
          message: 'Google Maps Platform Weather API quota reached.',
        });
        return;
      }

      if (!response.ok) {
        const errMsg =
          ((payload as { error?: { message?: string } })?.error?.message) ||
          `Weather API returned HTTP ${response.status}`;
        res.status(200).json({
          available: false,
          source: 'Google Maps Weather API',
          message: errMsg,
        });
        return;
      }

      const tempObj = payload.temperature as { degrees?: number } | undefined;
      const precipObj = payload.precipitation as { qpf?: { quantity?: number } } | undefined;
      const windObj = payload.wind as { speed?: { value?: number } } | undefined;
      const condObj = payload.weatherCondition as { description?: { text?: string }; iconBaseUri?: string } | undefined;

      res.json({
        available: true,
        source: 'Google Maps Weather API',
        temperatureC: typeof tempObj?.degrees === 'number' ? Number(tempObj.degrees.toFixed(1)) : undefined,
        relativeHumidity: typeof payload.relativeHumidity === 'number' ? payload.relativeHumidity : undefined,
        precipMm: typeof precipObj?.qpf?.quantity === 'number' ? precipObj.qpf.quantity : 0,
        windKmh: typeof windObj?.speed?.value === 'number' ? windObj.speed.value : undefined,
        conditionText: condObj?.description?.text ?? 'Clear',
        iconUri: condObj?.iconBaseUri ? `${condObj.iconBaseUri}.png` : undefined,
        observedAt: typeof payload.currentTime === 'string' ? payload.currentTime : new Date().toISOString(),
      });
    } catch (err) {
      res.status(200).json({
        available: false,
        source: 'Google Maps Weather API',
        message: err instanceof Error ? err.message : 'Unable to reach Weather API.',
      });
    }
  });

  // Product 11: Plant Disease Detector (Gemini Vision)
  app.post('/api/disease/analyze', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    const { imageBase64, mimeType, cropHint } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      cropHint?: string;
    };

    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: 'Both imageBase64 and mimeType are required.' });
      return;
    }

    try {
      const prompt = `You are a plant pathology specialist trained on PlantVillage leaf disease diagnostics.
Examine the uploaded image carefully${cropHint ? ` (farmer crop hint: ${cropHint})` : ''}.
Identify whether it shows a plant leaf, determine the crop species, diagnose any disease or nutrient stress (or confirm it is Healthy), estimate diagnostic confidence (0-100), severity, observable leaf symptoms, immediate field actions, organic treatments, chemical fungicide/bactericide options with safe field practice, and preventive cultural guidance.`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isPlantLeaf: { type: Type.BOOLEAN },
              cropSpecies: { type: Type.STRING },
              diseaseName: { type: Type.STRING },
              pathogenType: {
                type: Type.STRING,
                description: 'One of: Fungal, Bacterial, Viral, Nutrient Deficiency, Healthy, Unknown',
              },
              confidencePercent: { type: Type.NUMBER },
              severity: {
                type: Type.STRING,
                description: 'One of: None, Low, Moderate, High',
              },
              summary: { type: Type.STRING },
              visualSymptoms: { type: Type.ARRAY, items: { type: Type.STRING } },
              immediateActions: { type: Type.ARRAY, items: { type: Type.STRING } },
              organicTreatments: { type: Type.ARRAY, items: { type: Type.STRING } },
              chemicalControls: { type: Type.ARRAY, items: { type: Type.STRING } },
              preventivePractices: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              'isPlantLeaf',
              'cropSpecies',
              'diseaseName',
              'pathogenType',
              'confidencePercent',
              'severity',
              'summary',
              'visualSymptoms',
              'immediateActions',
              'organicTreatments',
              'chemicalControls',
              'preventivePractices',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as DiseaseAnalysisResult;
      res.json(parsed);
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Product 11: Retrieval-Augmented Agronomy Advisor Chat
  app.post('/api/disease/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    const { message, history, activeDiagnosis } = req.body as {
      message?: string;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
      activeDiagnosis?: DiseaseAnalysisResult | null;
    };

    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message is required.' });
      return;
    }

    try {
      const retrieved = retrieveAgronomyContext(
        message,
        activeDiagnosis?.cropSpecies,
        activeDiagnosis?.diseaseName
      );

      const kbContext = retrieved
        .map((c) => `[${c.title}]\n${c.guidance}`)
        .join('\n\n');

      const diagContext = activeDiagnosis
        ? `Active Leaf Scan Result:\n- Crop: ${activeDiagnosis.cropSpecies}\n- Diagnosis: ${activeDiagnosis.diseaseName} (${activeDiagnosis.pathogenType}, ${activeDiagnosis.severity} severity, ${activeDiagnosis.confidencePercent}% confidence)\n- Summary: ${activeDiagnosis.summary}`
        : 'No active leaf image scan yet; provide general smallholder agronomy advice.';

      const historyText = (history ?? [])
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'Farmer' : 'Advisor'}: ${h.text}`)
        .join('\n');

      const systemInstruction = `You are a practical smallholder farm advisor. Ground your response in the retrieved PlantVillage & ICAR extension references below and the active scan diagnosis. Keep guidance clear, actionable, safety-conscious (mention PPE and pre-harvest intervals when discussing sprays), and concise (3-5 short bullet points or 2 brief paragraphs).

${diagContext}

Retrieved Extension Knowledge Base:
${kbContext}`;

      const contents = historyText
        ? `${historyText}\nFarmer: ${message}`
        : message;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
        },
      });

      res.json({
        reply: response.text ?? 'Unable to generate guidance at this time.',
        sources: retrieved.map((r) => r.title),
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Product 12: Mandi Price Forecasting
  app.get('/api/mandi/prices', (req, res) => {
    const commodity = typeof req.query.commodity === 'string' ? req.query.commodity : undefined;
    const mandiId = typeof req.query.mandiId === 'string' ? req.query.mandiId : undefined;
    const refresh = req.query.refresh === 'true';
    const data = getMandiDashboard(commodity, mandiId, refresh);
    res.json(data);
  });

  app.post('/api/mandi/insight', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.',
      });
      return;
    }

    const { commodity, mandiName, currentModalPrice, forecast14dPrice, forecastDeltaPct, sellSignal, bestMandiName, bestMandiPrice } =
      req.body as Record<string, unknown>;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Provide a 3-sentence cooperative selling & transport brief for ${String(commodity)} at ${String(mandiName)}.
Current modal price: ₹${String(currentModalPrice)}/quintal.
14-day model forecast: ₹${String(forecast14dPrice)}/quintal (${String(forecastDeltaPct)}% change).
Signal: ${String(sellSignal)}.
Highest regional market right now: ${String(bestMandiName)} at ₹${String(bestMandiPrice)}/quintal.
Focus on holding risk (perishability/storage), staggered lot sales, and transport arbitrage.`,
      });
      res.json({ brief: response.text ?? '' });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Product 13: Soil-Based Crop Recommender & Saved Farm Profiles
  app.post('/api/crops/recommend', (req, res) => {
    const body = req.body as Partial<SoilInput>;
    const soil: SoilInput = {
      nitrogen: Number(body.nitrogen ?? 80),
      phosphorus: Number(body.phosphorus ?? 45),
      potassium: Number(body.potassium ?? 50),
      ph: Number(body.ph ?? 6.5),
      rainfallMm: Number(body.rainfallMm ?? 90),
      temperatureC: Number(body.temperatureC ?? 24),
      humidityPct: Number(body.humidityPct ?? 65),
      soilType: body.soilType ?? 'Alluvial',
    };
    res.json(recommendCrops(soil));
  });

  app.get('/api/profiles', (_req, res) => {
    res.json({ profiles: listFarmProfiles() });
  });

  app.post('/api/profiles', (req, res) => {
    const payload = req.body;
    if (!payload?.name || !payload?.soil) {
      res.status(400).json({ error: 'Profile name and soil data are required.' });
      return;
    }
    const saved = saveFarmProfile(payload);
    res.status(201).json({ profile: saved });
  });

  app.delete('/api/profiles/:id', (req, res) => {
    const removed = deleteFarmProfile(req.params.id);
    if (!removed) {
      res.status(404).json({ error: 'Farm profile not found.' });
      return;
    }
    res.json({ ok: true });
  });

  // Product 14: HTTP fallback state endpoint alongside WebSocket channel
  app.get('/api/irrigation/state', (_req, res) => {
    res.json(irrigationEngine.getState());
  });

  // Attach Vite or static production build
  const server = http.createServer(app);

  // WebSocket Server for Smart Irrigation Controller (/ws/irrigation)
  const wss = new WebSocketServer({ server, path: '/ws/irrigation' });

  const broadcast = (payload: unknown): void => {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  };

  wss.on('connection', (ws) => {
    irrigationEngine.setClientCount(wss.clients.size);
    ws.send(
      JSON.stringify({
        type: 'irrigation:init',
        state: irrigationEngine.getState(),
      })
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          zoneId?: string;
          valveOpen?: boolean;
          mode?: 'AUTO_ML' | 'MANUAL';
          minThresholdPct?: number;
        };

        if (msg.type === 'irrigation:sync') {
          ws.send(JSON.stringify({ type: 'irrigation:init', state: irrigationEngine.getState() }));
          return;
        }

        const result = irrigationEngine.applyCommand(msg);
        if (!result.ok) {
          ws.send(JSON.stringify({ type: 'irrigation:error', error: result.error }));
          return;
        }

        broadcast({
          type: 'irrigation:state',
          state: irrigationEngine.getState(),
        });
      } catch {
        ws.send(JSON.stringify({ type: 'irrigation:error', error: 'Invalid WebSocket message payload.' }));
      }
    });

    ws.on('close', () => {
      irrigationEngine.setClientCount(wss.clients.size);
    });
  });

  // Authoritative telemetry loop on the server
  setInterval(() => {
    if (wss.clients.size === 0) return;
    irrigationEngine.setClientCount(wss.clients.size);
    const { state } = irrigationEngine.tick();
    broadcast({
      type: 'irrigation:state',
      state,
    });
  }, 2500);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AgriPulse Operations Suite running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
