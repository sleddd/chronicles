import { Router } from 'express';
import { accountConsentSchema, breachNoticeSchema, LEGAL_VERSIONS } from '@chronicles/shared';
import { getConsent, saveBreachNotice, saveConsent } from '../db/consentQueries.js';

/* Consent to the Terms and to health data collection (separate boxes on the
   card), the 18+ confirmation and the breach-notice choice. The app asks again
   whenever a version in LEGAL_VERSIONS changes. */

const router = Router();

// GET /api/consent — the record (or null) and the current versions
router.get('/', async (req, res) => {
  try {
    res.json({ consent: await getConsent(req.auth!.accountId), current: LEGAL_VERSIONS });
  } catch {
    res.status(500).json({ error: 'Failed to load consent' });
  }
});

// POST /api/consent — agree to the current versions
router.post('/', async (req, res) => {
  const parsed = accountConsentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Check each box to continue' });
    return;
  }
  const d = parsed.data;
  // Only the versions the person was actually shown can be agreed to
  if (d.termsVersion !== LEGAL_VERSIONS.terms || d.healthVersion !== LEGAL_VERSIONS.health) {
    res.status(409).json({ error: 'The terms have changed — reload to see the latest', current: LEGAL_VERSIONS });
    return;
  }
  try {
    const accountId = req.auth!.accountId;
    await saveConsent(accountId, {
      termsVersion: d.termsVersion,
      healthVersion: d.healthVersion,
      breachNotice: d.breachNotice,
      postalAddress: d.breachNotice === 'mail' ? (d.postalAddress ?? null) : null,
    });
    res.json({ consent: await getConsent(accountId), current: LEGAL_VERSIONS });
  } catch {
    res.status(500).json({ error: 'Failed to save consent' });
  }
});

// PUT /api/consent/breach-notice — change how breach notices are sent
router.put('/breach-notice', async (req, res) => {
  const parsed = breachNoticeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid choice' });
    return;
  }
  try {
    const accountId = req.auth!.accountId;
    const { breachNotice, postalAddress } = parsed.data;
    const updated = await saveBreachNotice(accountId, breachNotice, breachNotice === 'mail' ? (postalAddress ?? null) : null);
    if (!updated) {
      res.status(404).json({ error: 'Agree to the terms first' });
      return;
    }
    res.json({ consent: await getConsent(accountId), current: LEGAL_VERSIONS });
  } catch {
    res.status(500).json({ error: 'Failed to save' });
  }
});

export default router;
