import { Router } from 'express';
import { aiChatConsentSchema } from '@chronicles/shared';
import { getAiChatStatus, saveAiChatConsent, withdrawAiChatConsent } from '../db/aiChatQueries.js';

/* AI chat consent: the user confirms they are 18+ and have read the safety
   notice before the chat sends anything to their AI provider. An account can
   be blocked (npm run ai:block), which refuses consent. */

const router = Router();

// GET /api/ai-chat — consent + block status
router.get('/', async (req, res) => {
  try {
    res.json(await getAiChatStatus(req.auth!.accountId));
  } catch {
    res.status(500).json({ error: 'Failed to load AI chat status' });
  }
});

// POST /api/ai-chat/consent — { version, ageConfirmed: true }
router.post('/consent', async (req, res) => {
  const parsed = aiChatConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Confirm you are 18 or older to turn on the chat' });
    return;
  }
  try {
    const accountId = req.auth!.accountId;
    if ((await getAiChatStatus(accountId)).blocked) {
      res.status(403).json({ error: 'In-App AI chat is turned off for this account' });
      return;
    }
    await saveAiChatConsent(accountId, parsed.data.version);
    res.json(await getAiChatStatus(accountId));
  } catch {
    res.status(500).json({ error: 'Failed to save consent' });
  }
});

// DELETE /api/ai-chat/consent — withdraw consent (the chat asks again)
router.delete('/consent', async (req, res) => {
  try {
    const accountId = req.auth!.accountId;
    await withdrawAiChatConsent(accountId);
    res.json(await getAiChatStatus(accountId));
  } catch {
    res.status(500).json({ error: 'Failed to withdraw consent' });
  }
});

export default router;
