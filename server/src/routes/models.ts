import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import {
  listModelPresets,
  listDownloadStatuses,
  startModelDownload,
  getActiveJobs,
  deleteModel,
} from '../services/modelDownload.js';

const router = Router();

router.get('/presets', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ presets: listModelPresets() });
});

router.get('/status', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    models: listDownloadStatuses(),
    jobs: getActiveJobs(),
  });
});

router.post('/download', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modelId = String(req.body?.modelId || '').trim();
    if (!modelId) {
      res.status(400).json({ error: 'modelId is required' });
      return;
    }

    const job = await startModelDownload(modelId);
    res.json({ job });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || 'Failed to start model download' });
  }
});

router.delete('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const modelId = String(req.body?.modelId || '').trim();
    if (!modelId) {
      res.status(400).json({ error: 'modelId is required' });
      return;
    }

    const result = await deleteModel(modelId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || 'Failed to delete model' });
  }
});

export default router;
