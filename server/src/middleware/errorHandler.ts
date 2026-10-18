import type { Request, Response, NextFunction } from 'express';

/**
 * Global error handler — sanitizes errors in production. Client errors raised
 * by the body parser (malformed JSON, body too large) keep their own status
 * rather than reading as a server fault.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? 'Request too large' : 'Invalid request' });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    console.error('Unhandled error:', err.message);
  } else {
    console.error('Unhandled error:', err);
  }
  res.status(500).json({ error: 'Internal server error' });
}
