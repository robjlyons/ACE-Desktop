import path from 'path';
import { existsSync, readdirSync, statSync } from 'fs';
import { mkdir } from 'fs/promises';
import { spawn, spawnSync } from 'child_process';
import { resolvePythonPath } from './acestep.js';

export interface ModelPreset {
  modelId: string;
  label: string;
  targetDir: string;
  type: 'dit' | 'lm' | 'other';
}

export interface DownloadJobStatus {
  modelId: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  targetDir: string;
  progress?: number;
  stage?: string;
}

const MODEL_ID_REGEX = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const PRESETS: ModelPreset[] = [
  { modelId: 'ACE-Step/acestep-v15-turbo', label: 'ACE-Step v1.5 Turbo (DiT)', targetDir: 'acestep-v15-turbo', type: 'dit' },
  { modelId: 'ACE-Step/acestep-v15-base', label: 'ACE-Step v1.5 Base (DiT)', targetDir: 'acestep-v15-base', type: 'dit' },
  { modelId: 'ACE-Step/acestep-v15-sft', label: 'ACE-Step v1.5 SFT (DiT)', targetDir: 'acestep-v15-sft', type: 'dit' },
  { modelId: 'ACE-Step/acestep-v15-xl-turbo', label: 'ACE-Step v1.5 XL Turbo (DiT)', targetDir: 'acestep-v15-xl-turbo', type: 'dit' },
  { modelId: 'ACE-Step/acestep-v15-xl-sft', label: 'ACE-Step v1.5 XL SFT (DiT)', targetDir: 'acestep-v15-xl-sft', type: 'dit' },
  { modelId: 'ACE-Step/acestep-5Hz-lm-0.6B', label: 'ACE-Step LM 0.6B', targetDir: 'acestep-5Hz-lm-0.6B', type: 'lm' },
  { modelId: 'ACE-Step/acestep-5Hz-lm-1.7B', label: 'ACE-Step LM 1.7B', targetDir: 'acestep-5Hz-lm-1.7B', type: 'lm' },
  { modelId: 'ACE-Step/acestep-5Hz-lm-4B', label: 'ACE-Step LM 4B', targetDir: 'acestep-5Hz-lm-4B', type: 'lm' },
];

const activeJobs = new Map<string, DownloadJobStatus>();

function getAceStepDir(): string {
  const firstExistingDir = (candidates: string[]): string | null => {
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };

  const envPath = process.env.ACESTEP_PATH;
  if (envPath) {
    const resolved = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
    if (existsSync(resolved)) return resolved;
  }

  const resolved = firstExistingDir([
    path.resolve(process.cwd(), '../ACE-Step-1.5'),
    path.resolve(process.cwd(), '../../ACE-Step-1.5'),
  ]);

  return resolved || path.resolve(process.cwd(), '../ACE-Step-1.5');
}

function getCheckpointsDir(): string {
  return path.join(getAceStepDir(), 'checkpoints');
}

function sanitizeTargetDir(modelId: string): string {
  const base = modelId.split('/')[1] || modelId;
  return base.replace(/[^A-Za-z0-9._-]/g, '_');
}

function getTargetDirForModel(modelId: string): string {
  const preset = PRESETS.find((p) => p.modelId === modelId);
  return preset?.targetDir || sanitizeTargetDir(modelId);
}

function getTargetPath(modelId: string): string {
  return path.join(getCheckpointsDir(), getTargetDirForModel(modelId));
}

function isDownloaded(modelId: string): boolean {
  const targetPath = getTargetPath(modelId);
  if (!existsSync(targetPath)) return false;
  try {
    const entries = readdirSync(targetPath);
    return entries.length > 0;
  } catch {
    return false;
  }
}

function validateModelId(modelId: string): void {
  if (!MODEL_ID_REGEX.test(modelId)) {
    throw new Error('Invalid model ID format. Expected: owner/repo');
  }
}

export function listModelPresets(): ModelPreset[] {
  return PRESETS;
}

export function listDownloadStatuses(): Array<{
  modelId: string;
  targetDir: string;
  downloaded: boolean;
  activeJob?: DownloadJobStatus;
}> {
  const checkpointDir = getCheckpointsDir();
  const knownModelIds = new Set<string>(PRESETS.map((p) => p.modelId));

  if (existsSync(checkpointDir)) {
    try {
      for (const entry of readdirSync(checkpointDir)) {
        const full = path.join(checkpointDir, entry);
        if (statSync(full).isDirectory()) {
          knownModelIds.add(`local/${entry}`);
        }
      }
    } catch {
      // Non-fatal scan failure
    }
  }

  return Array.from(knownModelIds).map((modelId) => {
    const normalizedModelId = modelId.startsWith('local/') ? modelId : modelId;
    const activeJob = activeJobs.get(normalizedModelId);
    return {
      modelId: normalizedModelId,
      targetDir: getTargetDirForModel(normalizedModelId),
      downloaded: isDownloaded(normalizedModelId),
      activeJob,
    };
  });
}

export function getActiveJobs(): DownloadJobStatus[] {
  return Array.from(activeJobs.values());
}

function extractProgressAndStage(chunk: string): { progress?: number; stage?: string } {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return {};
  const lastLine = lines[lines.length - 1];

  const percentMatch = lastLine.match(/(\d{1,3})%/);
  if (percentMatch) {
    const progress = Math.min(100, Math.max(0, Number(percentMatch[1])));
    return { progress, stage: lastLine.slice(0, 180) };
  }

  // Fallback: "x/y" style output
  const fractionMatch = lastLine.match(/(\d+)\s*\/\s*(\d+)/);
  if (fractionMatch) {
    const done = Number(fractionMatch[1]);
    const total = Number(fractionMatch[2]);
    if (total > 0) {
      const progress = Math.min(100, Math.max(0, Math.round((done / total) * 100)));
      return { progress, stage: lastLine.slice(0, 180) };
    }
  }

  return { stage: lastLine.slice(0, 180) };
}

export async function startModelDownload(modelId: string): Promise<DownloadJobStatus> {
  validateModelId(modelId);

  if (isDownloaded(modelId)) {
    return {
      modelId,
      targetDir: getTargetDirForModel(modelId),
      status: 'completed',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  const existing = activeJobs.get(modelId);
  if (existing && (existing.status === 'queued' || existing.status === 'downloading')) {
    return existing;
  }

  const checkpointsDir = getCheckpointsDir();
  const targetDir = getTargetDirForModel(modelId);
  const targetPath = path.join(checkpointsDir, targetDir);
  await mkdir(targetPath, { recursive: true });

  const job: DownloadJobStatus = {
    modelId,
    targetDir,
    status: 'queued',
    startedAt: new Date().toISOString(),
    progress: 0,
    stage: 'Queued',
  };
  activeJobs.set(modelId, job);

  const aceStepDir = getAceStepDir();
  const pythonPath = resolvePythonPath(aceStepDir);
  const depCheck = spawnSync(pythonPath, ['-c', 'import huggingface_hub'], {
    cwd: aceStepDir,
    stdio: 'ignore',
  });
  if (depCheck.status !== 0) {
    throw new Error('Python dependency missing: install huggingface_hub in your ACE-Step environment.');
  }
  const script = [
    'from huggingface_hub import snapshot_download',
    `snapshot_download(repo_id=${JSON.stringify(modelId)}, local_dir=${JSON.stringify(targetPath)}, local_dir_use_symlinks=False, resume_download=True)`,
  ].join('; ');

  job.status = 'downloading';
  const proc = spawn(pythonPath, ['-c', script], {
    cwd: aceStepDir,
    env: { ...process.env },
  });

  let stderr = '';
  proc.stderr.on('data', (data: Buffer) => {
    const chunk = data.toString();
    stderr += chunk;
    const parsed = extractProgressAndStage(chunk);
    if (parsed.progress !== undefined) {
      job.progress = parsed.progress;
    }
    if (parsed.stage) {
      job.stage = parsed.stage;
    }
    activeJobs.set(modelId, { ...job });
  });

  proc.stdout.on('data', (data: Buffer) => {
    const parsed = extractProgressAndStage(data.toString());
    if (parsed.progress !== undefined) {
      job.progress = parsed.progress;
    }
    if (parsed.stage) {
      job.stage = parsed.stage;
    }
    activeJobs.set(modelId, { ...job });
  });

  proc.on('close', (code) => {
    if (code === 0 && isDownloaded(modelId)) {
      job.status = 'completed';
      job.progress = 100;
      job.stage = 'Download complete';
    } else {
      job.status = 'failed';
      job.error = stderr.trim() || `Download process exited with code ${code}`;
      job.stage = 'Download failed';
    }
    job.finishedAt = new Date().toISOString();
    activeJobs.set(modelId, job);
  });

  proc.on('error', (err) => {
    job.status = 'failed';
    job.error = err.message;
    job.stage = 'Download failed';
    job.finishedAt = new Date().toISOString();
    activeJobs.set(modelId, job);
  });

  return job;
}
