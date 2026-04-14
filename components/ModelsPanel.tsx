import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { modelsApi, ModelPreset, ModelStatusItem } from '../services/api';

export const ModelsPanel: React.FC = () => {
  const { token } = useAuth();
  const [presets, setPresets] = useState<ModelPreset[]>([]);
  const [statusItems, setStatusItems] = useState<ModelStatusItem[]>([]);
  const [customModelId, setCustomModelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittingModelId, setSubmittingModelId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isDownloading = useMemo(
    () => statusItems.some((item) => item.activeJob?.status === 'queued' || item.activeJob?.status === 'downloading'),
    [statusItems]
  );

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [presetResponse, statusResponse] = await Promise.all([
        modelsApi.getPresets(token),
        modelsApi.getStatus(token),
      ]);
      setPresets(presetResponse.presets || []);
      setStatusItems(statusResponse.models || []);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load model status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || !isDownloading) return;
    const timer = setInterval(() => {
      modelsApi.getStatus(token)
        .then((response) => setStatusItems(response.models || []))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [token, isDownloading]);

  const startDownload = async (modelId: string) => {
    if (!token) return;
    setSubmittingModelId(modelId);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await modelsApi.startDownload(modelId, token);
      setStatusMessage(`Started download: ${modelId}`);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start download');
    } finally {
      setSubmittingModelId(null);
    }
  };

  const handleCustomDownload = async () => {
    const modelId = customModelId.trim();
    if (!modelId) return;
    await startDownload(modelId);
    setCustomModelId('');
  };

  const getModelStatus = (modelId: string) => statusItems.find((item) => item.modelId === modelId);

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-suno-DEFAULT transition-colors duration-300">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-white">Models</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            Download ACE models into your local checkpoints directory without leaving the app.
          </p>
        </div>

        <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-suno-panel p-4 mb-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">Custom model download</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={customModelId}
              onChange={(e) => setCustomModelId(e.target.value)}
              placeholder="owner/repo (example: ACE-Step/acestep-v15-turbo)"
              className="flex-1 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-white/10 px-3 py-2 text-sm text-zinc-900 dark:text-white"
            />
            <button
              onClick={handleCustomDownload}
              disabled={!customModelId.trim() || !!submittingModelId}
              className="px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {submittingModelId ? 'Starting...' : 'Download'}
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMessage}
          </div>
        )}
        {statusMessage && (
          <div className="mb-4 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {statusMessage}
          </div>
        )}

        <div className="rounded-xl border border-zinc-200 dark:border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900/40">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Preset models</h2>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading model status...
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-white/10">
              {presets.map((preset) => {
                const status = getModelStatus(preset.modelId);
                const downloading = status?.activeJob?.status === 'queued' || status?.activeJob?.status === 'downloading';
                const completed = status?.downloaded;
                const failed = status?.activeJob?.status === 'failed';
                const progress = status?.activeJob?.progress ?? (completed ? 100 : 0);
                const stage = status?.activeJob?.stage;

                return (
                  <div key={preset.modelId} className="px-4 py-4 flex items-center justify-between gap-4 bg-white dark:bg-suno-DEFAULT">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-900 dark:text-white">{preset.label}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{preset.modelId}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-500 mt-1">Target: checkpoints/{preset.targetDir}</div>
                      {(downloading || failed || completed) && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
                            <span className="truncate mr-3">{stage || (downloading ? 'Downloading...' : completed ? 'Ready' : 'Failed')}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${failed ? 'bg-red-500' : completed ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {completed && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {failed && <AlertCircle className="w-4 h-4 text-red-400" />}
                      {downloading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
                      <button
                        onClick={() => startDownload(preset.modelId)}
                        disabled={downloading || !!submittingModelId}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 disabled:opacity-60"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {completed ? 'Re-download' : downloading ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
