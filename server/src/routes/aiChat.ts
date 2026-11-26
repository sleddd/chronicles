import { Router } from 'express';
import { aiChatConsentSchema, aiRefusalSchema } from '@chronicles/shared';
import { getAiChatStatus, recordAiRefusal, saveAiChatConsent, withdrawAiChatConsent } from '../db/aiChatQueries.js';
import { aiRefusalLimiter } from '../middleware/rateLimiter.js';

/* AI chat consent: the user confirms they are 18+ and have read the safety
   notice before the chat sends anything to their AI provider. An account can
   be blocked (npm run ai:block, or 20 declined requests in 30 days), which
   refuses consent. Declined requests are reported here by both apps (the
   Chronicles AI app over its assistant session) and counted per account.

   Every answer is the full status, with the account's anonymous `aiUserId`
   (sent to Anthropic as metadata.user_id) and its `enforcement` level. While
   paused, consent can still be given; the apps hold off until pausedUntil. */

const router = Router();

// GET /api/ai-chat — consent, block, pause and the anonymous AI user id
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

// POST /api/ai-chat/refusal — { app } : one request the AI declined (no content)
// (capped per account; one within 15 seconds of the last, or while blocked, isn't counted)
router.post('/refusal', aiRefusalLimiter, async (req, res) => {
  const parsed = aiRefusalSchema.safeParse(req.body);
  // Each app reports only its own: the AI app's session says 'smith', a browser 'chronicles'
  const expected = req.auth!.assistant ? 'smith' : 'chronicles';
  if (!parsed.success || parsed.data.app !== expected) {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  try {
    res.json(await recordAiRefusal(req.auth!.accountId, parsed.data.app));
  } catch {
    res.status(500).json({ error: 'Failed to record the declined request' });
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
