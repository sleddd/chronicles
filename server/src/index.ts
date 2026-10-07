import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { securityHeaders } from './middleware/security.js';
import { authMiddleware, cleanupSessions } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import authRoutes from './routes/auth.js';
import rememberRoutes from './routes/remember.js';
import entriesRoutes from './routes/entries.js';
import topicsRoutes from './routes/topics.js';
import settingsRoutes from './routes/settings.js';
import sessionsRoutes from './routes/sessions.js';
import sharesRoutes from './routes/shares.js';
import dosesRoutes from './routes/doses.js';
import calendarRoutes from './routes/calendar.js';
import { initSharesTable } from './db/shareQueries.js';

// Prisma raw queries return BigInt for integer columns — make JSON.stringify handle them
(BigInt.prototype as unknown as Record<string, unknown>).toJSON = function () {
  return Number(this);
};

const app = express();
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

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(securityHeaders);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth/remember', authMiddleware, apiLimiter, rememberRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/entries', authMiddleware, apiLimiter, entriesRoutes);
app.use('/api/topics', authMiddleware, apiLimiter, topicsRoutes);
app.use('/api/settings', authMiddleware, apiLimiter, settingsRoutes);
app.use('/api/sessions', authMiddleware, apiLimiter, sessionsRoutes);
app.use('/api/doses', authMiddleware, apiLimiter, dosesRoutes);
app.use('/api/shares', sharesRoutes); // public GET by token; POST/DELETE use authMiddleware inline
app.use('/api/calendar', calendarRoutes); // public OAuth callback + ICS feed; rest use authMiddleware inline

// Global error handler — sanitize errors in production
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Unhandled error:', err.message);
  } else {
    console.error('Unhandled error:', err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Serve client static files in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA fallback — serve index.html for non-API routes
app.get('{/*path}', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Init + periodic cleanup + listen
initSharesTable().catch(err => console.error('Failed to init shares table:', err));
cleanupSessions().then(count => {
  if (count > 0) console.log(`Cleaned up ${count} expired/revoked sessions`);
}).catch(() => {});

setInterval(() => {
  cleanupSessions().catch(() => {});
}, 6 * 60 * 60 * 1000);

app.listen(typeof PORT === 'string' ? parseInt(PORT, 10) : PORT, HOST, () => {
  console.log(`Chronicles running on ${HOST}:${PORT}`);
});

export default app;
