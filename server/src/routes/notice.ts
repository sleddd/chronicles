import { Router } from 'express';
import { getActiveNotice } from '../db/appNoticeQueries.js';

const router = Router();

// GET /api/notice — the app-wide notice, if one is switched on
router.get('/', async (_req, res) => {
  try {
    res.json({ notice: await getActiveNotice() });
  } catch {
    res.json({ notice: null });
  }
});

export default router;
