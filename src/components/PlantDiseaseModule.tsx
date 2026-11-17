import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  Send,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import type { AdvisorChatMessage, DiseaseAnalysisResult } from '../types/agri';

interface SampleLeaf {
  id: string;
  label: string;
  crop: string;
  url: string;
}

const SAMPLE_LEAVES: SampleLeaf[] = [
  {
    id: 'early-blight',
    label: 'Tomato Leaf · Concentric Lesions',
    crop: 'Tomato',
    url: '/src/assets/images/leaf_early_blight_1794921765927.jpg',
  },
  {
    id: 'powdery-mildew',
    label: 'Squash Leaf · White Patches',
    crop: 'Squash',
    url: '/src/assets/images/leaf_powdery_mildew_1794921766052.jpg',
  },
  {
    id: 'healthy-leaf',
    label: 'Paddy / Corn · Healthy Blade',
    crop: 'Rice / Corn',
    url: '/src/assets/images/leaf_healthy_crop_1794921765646.jpg',
  },
];

const QUICK_PROMPTS = [
  'What is the safe organic spray dosage and timing?',
  'Can this spread to neighboring plants in rain?',
  'What pre-harvest interval (PHI) should I follow?',
];

export function PlantDiseaseModule() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>(SAMPLE_LEAVES[0].url);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [cropHint, setCropHint] = useState<string>('Auto-detect');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiseaseAnalysisResult | null>(null);
  const [brokenSamples, setBrokenSamples] = useState<Record<string, boolean>>({});

  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdvisorChatMessage[]>([
    {
      id: 'welcome-advisor',
      role: 'assistant',
      text: 'Upload a crop leaf photograph or select one of the field samples, then click Analyze Leaf. You can ask follow-up questions here about treatment dosage, spray intervals, and spread prevention.',
      sources: ['PlantVillage Diagnostic Knowledge Base'],
      timestamp: new Date().toISOString(),
    },
  ]);

  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAnalysisError('Please choose a valid image file (JPEG, PNG, or WebP).');
      return;
    }
    setAnalysisError(null);
    setDiagnosis(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const parts = dataUrl.split(',');
      if (parts.length === 2) {
        setPreviewUrl(dataUrl);
        setImageBase64(parts[1]);
        setMimeType(file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSample = (sample: SampleLeaf) => {
    setPreviewUrl(sample.url);
    setImageBase64(null);
    setMimeType('image/jpeg');
    setCropHint(sample.crop);
    setAnalysisError(null);
    setDiagnosis(null);
  };

  const resolveBase64ForAnalysis = async (): Promise<{ base64: string; mime: string }> => {
    if (imageBase64) {
      return { base64: imageBase64, mime: mimeType };
    }
    const resp = await fetch(previewUrl);
    if (!resp.ok) {
      throw new Error('Unable to load selected sample image.');
    }
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read image bytes.'));
      reader.readAsDataURL(blob);
    });
    const [, rawBase64] = dataUrl.split(',');
    if (!rawBase64) {
      throw new Error('Could not encode image for analysis.');
    }
    return { base64: rawBase64, mime: blob.type || 'image/jpeg' };
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const { base64, mime } = await resolveBase64ForAnalysis();
      const res = await fetch('/api/disease/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: mime,
          cropHint: cropHint === 'Auto-detect' ? undefined : cropHint,
        }),
      });
      const data = (await res.json()) as DiseaseAnalysisResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze leaf image.');
      }
      setDiagnosis(data);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unable to analyze leaf image.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSendChat = async (overrideText?: string) => {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;

    const userMsg: AdvisorChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!overrideText) setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch('/api/disease/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
          activeDiagnosis: diagnosis,
        }),
      });
      const data = (await res.json()) as { reply?: string; sources?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Advisor chat request failed.');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: data.reply ?? '',
          sources: data.sources ?? [],
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach agronomy advisor.');
    } finally {
      setChatLoading(false);
    }
  };

  const severityTone = (sev: DiseaseAnalysisResult['severity']) => {
    if (sev === 'High') return 'text-red-700';
    if (sev === 'Moderate') return 'text-amber-700';
    if (sev === 'Low') return 'text-amber-600';
    return 'text-emerald-700';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Product 11 · Smallholder Diagnostics</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Plant Disease Detector with Advisor
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspect foliar symptoms using computer-vision leaf classification and consult the extension advisor.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Image Upload + Detection Output */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">Leaf Specimen Input</h2>
              <div className="flex items-center gap-2">
                <label htmlFor="crop-hint-select" className="text-xs text-slate-500">
                  Crop Hint
                </label>
                <select
                  id="crop-hint-select"
                  value={cropHint}
                  onChange={(e) => setCropHint(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-700"
                >
                  <option value="Auto-detect">Auto-detect</option>
                  <option value="Tomato">Tomato</option>
                  <option value="Potato">Potato</option>
                  <option value="Squash">Squash / Cucurbit</option>
                  <option value="Rice / Corn">Rice / Corn</option>
                  <option value="Wheat">Wheat</option>
                  <option value="Cotton">Cotton</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-stretch">
              <div className="sm:col-span-7 relative rounded-lg overflow-hidden border border-slate-200 bg-slate-100 min-h-[240px]">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Selected plant leaf specimen for pathology inspection"
                    referrerPolicy="no-referrer"
                    className="w-full h-60 object-cover"
                  />
                ) : (
                  <div className="w-full h-60 flex flex-col items-center justify-center text-slate-500">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <span className="text-xs">No leaf image selected</span>
                  </div>
                )}
              </div>

              <div className="sm:col-span-5 flex flex-col justify-between gap-3">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                  className="flex-1 border border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-center bg-slate-50 hover:border-emerald-600 transition-colors"
                >
                  <Upload className="w-5 h-5 text-slate-500 mb-2" />
                  <p className="text-xs font-medium text-slate-700">
                    Drop a leaf photo here
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">JPEG or PNG up to 10 MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Browse File
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing Leaf...
                    </>
                  ) : (
                    'Analyze Leaf'
                  )}
                </button>
              </div>
            </div>

            {/* Field Samples Strip */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs text-slate-500">Or load a field reference specimen</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {SAMPLE_LEAVES.map((sample) => {
                  const active = previewUrl === sample.url && !imageBase64;
                  return (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => handleSelectSample(sample)}
                      className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-emerald-700 bg-emerald-50/50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      {!brokenSamples[sample.id] ? (
                        <img
                          src={sample.url}
                          alt={sample.label}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenSamples((prev) => ({ ...prev, [sample.id]: true }))
                          }
                          className="w-10 h-10 rounded object-cover shrink-0 bg-slate-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-emerald-50 flex items-center justify-center shrink-0">
                          <ImageIcon className="w-4 h-4 text-emerald-700" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{sample.crop}</p>
                        <p className="text-[11px] text-slate-500 truncate">{sample.label.split('·')[1]?.trim()}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {analysisError && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}
          </div>

          {/* Diagnostic Result Panel */}
          {analyzing && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="h-4 w-40 bg-slate-200 rounded animate-pulse" />
              <div className="h-7 w-72 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div className="h-14 bg-slate-100 rounded animate-pulse" />
                <div className="h-14 bg-slate-100 rounded animate-pulse" />
                <div className="h-14 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>
          )}

          {!analyzing && diagnosis && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs text-slate-500">
                    {diagnosis.cropSpecies} · {diagnosis.pathogenType}
                  </p>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    {diagnosis.diseaseName}
                  </h3>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-xs text-slate-500">Confidence</p>
                    <p className="text-base font-semibold text-slate-900 font-mono tabular-nums">
                      {Math.round(diagnosis.confidencePercent)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Severity</p>
                    <p className={`text-base font-semibold inline-flex items-center gap-1 ${severityTone(diagnosis.severity)}`}>
                      {diagnosis.severity === 'None' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <ShieldAlert className="w-4 h-4" />
                      )}
                      {diagnosis.severity}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{diagnosis.summary}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2">
                    Observed Symptoms
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {diagnosis.visualSymptoms.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2">
                    Immediate Field Actions
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {diagnosis.immediateActions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2">
                    Organic & Biological Controls
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {diagnosis.organicTreatments.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 mb-2">
                    Chemical Controls & Prevention
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600 list-disc pl-4">
                    {[...diagnosis.chemicalControls, ...diagnosis.preventivePractices]
                      .slice(0, 4)
                      .map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!analyzing && !diagnosis && !analysisError && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-900">Ready for pathology inspection</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click <span className="font-medium text-slate-700">Analyze Leaf</span> above to run
                symptom classification and populate treatment guidance.
              </p>
            </div>
          )}
        </div>

        {/* Right: Retrieval-Augmented Agronomy Advisor Chat */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col h-[640px]">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">Agronomy Extension Advisor</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Grounded in PlantVillage & ICAR extension manuals
              {diagnosis ? ` · Active context: ${diagnosis.diseaseName}` : ''}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  {msg.text}
                </div>
                {msg.sources && msg.sources.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Sources: {msg.sources.join(' · ')}
                  </p>
                )}
              </div>
            ))}

            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Retrieving extension guidance...
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {chatError}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 space-y-2.5 bg-slate-50/70 rounded-b-xl">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp}
                  type="button"
                  onClick={() => handleSendChat(qp)}
                  disabled={chatLoading}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:border-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
                >
                  {qp}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendChat();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about spray dosage, rotation, or containment..."
                className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-emerald-700"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                aria-label="Send message"
                className="inline-flex items-center justify-center px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
