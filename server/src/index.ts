import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { securityHeaders, corsOriginFor, trustProxySetting } from './middleware/security.js';
import { authMiddleware, cleanupSessions } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes, { checkStoredCredentials, sealStoredTotpSecrets } from './routes/auth.js';
import rememberRoutes from './routes/remember.js';
import entriesRoutes from './routes/entries.js';
import topicsRoutes from './routes/topics.js';
import settingsRoutes from './routes/settings.js';
import sessionsRoutes from './routes/sessions.js';
import sharesRoutes from './routes/shares.js';
import dosesRoutes from './routes/doses.js';
import financeRoutes from './routes/finance.js';
import calendarRoutes from './routes/calendar.js';
import analyticsRoutes from './routes/analytics.js';
import aiChatRoutes from './routes/aiChat.js';
import consentRoutes from './routes/consent.js';
import noticeRoutes from './routes/notice.js';
import betaRoutes from './routes/beta.js';
import { initConsentTable } from './db/consentQueries.js';
import { initBetaTable } from './db/betaQueries.js';
import { initAppNoticeTable } from './db/appNoticeQueries.js';
import { initAnalyticsTable } from './db/analyticsQueries.js';
import { initAiChatTable } from './db/aiChatQueries.js';
import { initSharesTable, purgeDeadShares } from './db/shareQueries.js';
import { checkBackupLockCapacity } from './db/backupCheck.js';
import { initShards } from './db/shards.js';
import { initSharedState, sharedState } from './services/sharedState.js';
import { initRememberGrants } from './services/rememberGrants.js';
import { tokenCryptoProblem } from './services/tokenCrypto.js';

// Prisma raw queries return BigInt for integer columns — make JSON.stringify handle them
(BigInt.prototype as unknown as Record<string, unknown>).toJSON = function () {
  return Number(this);
};

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3001;
// Bind to loopback only outside production so the dev server is never reachable
// from the network. In production (Render etc.) the platform needs 0.0.0.0.
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

// CLIENT_URL is optional when serving client statically from the same server

// Validate CLIENT_URL format
if (process.env.CLIENT_URL) {
  try {
    const parsed = new URL(process.env.CLIENT_URL);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('CLIENT_URL must use HTTPS in production');
    }
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
      console.warn('WARNING: CLIENT_URL should be an origin (no path, query, or hash)');
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`CLIENT_URL is not a valid URL: ${process.env.CLIENT_URL}`);
    }
    throw err;
  }
}

// Sign-up is closed to everyone not approved on the beta list (or in
// REGISTRATION_WHITELIST) unless REGISTRATION_OPEN=true
if (process.env.NODE_ENV === 'production' && process.env.REGISTRATION_OPEN === 'true') {
  console.warn('WARNING: REGISTRATION_OPEN=true — anyone can create an account on this server');
}

// Behind a hosting proxy (Render etc.) every request arrives from the proxy's
// address; without this, per-IP rate limits would see one shared IP — one
// visitor could exhaust the login limit for everyone. TRUST_PROXY sets the
// number of proxy hops to trust (default 1 everywhere but development — the
// same test as Secure cookies — and none in dev so a spoofed X-Forwarded-For
// header is ignored locally).
const trustProxy = trustProxySetting();
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
// The default (1 hop) is only right behind exactly one proxy: with none, any
// client can set X-Forwarded-For and dodge every per-IP limit; with more, all
// clients share one bucket. Say so when it wasn't set on purpose.
if (process.env.NODE_ENV !== 'development' && process.env.TRUST_PROXY === undefined) {
  console.warn('TRUST_PROXY is not set: assuming exactly one proxy in front (Render). Set it to the real number of proxy hops (0 for none).');
}

// Security headers first, so every response — body-parser errors included —
// carries no-store and the CSP
app.use(securityHeaders);

// CLIENT_URL unset outside development: no cross-origin access (same-origin
// serving needs none), never a fallback to the localhost dev origin
const corsOrigin = corsOriginFor();
if (corsOrigin === false && process.env.NODE_ENV !== 'development') {
  console.warn('CLIENT_URL is not set: cross-origin requests are refused. Fine when the client is served by this server; set CLIENT_URL if it is hosted elsewhere.');
}
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
// Entries carry two encrypted fields of up to 2M chars each (drawings make
// big ones), so they get a larger body limit — read only after the session
// (and the per-account limit) checks out, so no one signed out can make the
// server buffer 5 MB bodies. Everything else stays at 1mb.
app.use('/api/entries', authMiddleware, apiLimiter, express.json({ limit: '5mb' }), entriesRoutes);
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth/remember', authMiddleware, apiLimiter, rememberRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/topics', authMiddleware, apiLimiter, topicsRoutes);
app.use('/api/settings', authMiddleware, apiLimiter, settingsRoutes);
app.use('/api/sessions', authMiddleware, apiLimiter, sessionsRoutes);
app.use('/api/doses', authMiddleware, apiLimiter, dosesRoutes);
app.use('/api/finance', authMiddleware, apiLimiter, financeRoutes);
app.use('/api/ai-chat', authMiddleware, apiLimiter, aiChatRoutes);
app.use('/api/consent', authMiddleware, apiLimiter, consentRoutes);
app.use('/api/notice', authMiddleware, apiLimiter, noticeRoutes);
app.use('/api/analytics', authMiddleware, apiLimiter, analyticsRoutes); // never tied to the account
app.use('/api/beta', betaRoutes); // public landing page: applications, waitlist
app.use('/api/shares', sharesRoutes); // public GET by token; POST/DELETE use authMiddleware inline
app.use('/api/calendar', calendarRoutes); // public OAuth callback + ICS feed; rest use authMiddleware inline

// An unknown /api path is a 404, never the SPA's index.html
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

app.use(errorHandler);

// Serve client static files in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA fallback — serve index.html for non-API routes
app.get('{/*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Init + periodic cleanup + listen. The shard column comes first: every
// account query reads it, so nothing may run before it exists
try {
  await initShards();
  // Sign-in state and Remember me grants every instance shares
  await initSharedState();
  await initRememberGrants();
} catch (err) {
  console.error('Database setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}

initSharesTable()
  .then(() => purgeDeadShares())
  .then(count => { if (count > 0) console.log(`Deleted ${count} revoked/expired share(s)`); })
  .catch(err => console.error('Failed to init shares table:', err));
initAnalyticsTable().catch(err => console.error('Failed to init analytics table:', err));
initAiChatTable().catch(err => console.error('Failed to init AI chat table:', err));
initConsentTable().catch(err => console.error('Failed to init consent table:', err));
initAppNoticeTable().catch(err => console.error('Failed to init notice table:', err));
initBetaTable().catch(err => console.error('Failed to init beta table:', err));
checkStoredCredentials().then(({ recoverySealed, outdated, sessionsRevoked }) => {
  if (recoverySealed) console.log(`Credential check: ${recoverySealed} recovery check(s) sealed`);
  if (outdated.length) {
    console.warn(`Credential check: ${outdated.length} account(s) still on a pre-upgrade password hash (ids ${outdated.join(', ')}) can only sign in by recovery; ${sessionsRevoked} session(s) signed out`);
  }
}).catch(err => console.error('Credential check failed:', err instanceof Error ? err.message : err));
sealStoredTotpSecrets().then(({ sealed, readable }) => {
  if (sealed) console.log(`Credential check: ${sealed} authenticator secret(s) sealed`);
  if (readable) console.warn(`${tokenCryptoProblem()}: ${readable} account(s) have their authenticator secret stored readable until the key is usable`);
}).catch(err => console.error('Authenticator secret check failed:', err instanceof Error ? err.message : err));
cleanupSessions().then(count => {
  if (count > 0) console.log(`Cleaned up ${count} expired/revoked sessions`);
}).catch(() => {});

checkBackupLockCapacity().catch(err => console.error('Backup lock check failed:', err instanceof Error ? err.message : err));

setInterval(() => {
  cleanupSessions().catch(() => {});
  purgeDeadShares().catch(() => {});
  checkBackupLockCapacity().catch(() => {});
  sharedState.sweep().catch(() => {});
}, 6 * 60 * 60 * 1000);

app.listen(typeof PORT === 'string' ? parseInt(PORT, 10) : PORT, HOST, () => {
  console.log(`Chronicles running on ${HOST}:${PORT}`);
});

export default app;
