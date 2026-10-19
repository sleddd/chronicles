import { prisma } from './prisma.js';
import { safeLink } from '../utils/safeLink.js';

/* One app-wide notice the server can switch on (e.g. a security incident
   notice, which must accompany emailed breach notices). Set with
   `npm run notice`. Nothing personal in it. */

export interface AppNotice { message: string; linkUrl: string | null; updatedAt: string }

export async function initAppNoticeTable(): Promise<void> {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS public.app_notice (
      id          INT PRIMARY KEY CHECK (id = 1),
      message     TEXT NOT NULL,
      link_url    TEXT,
      active      BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function getActiveNotice(): Promise<AppNotice | null> {
  const rows = await prisma.$queryRaw<{ message: string; link_url: string | null; updated_at: Date }[]>`
    SELECT message, link_url, updated_at FROM public.app_notice WHERE id = 1 AND active
  `;
  const r = rows[0];
  return r ? { message: r.message, linkUrl: safeLink(r.link_url), updatedAt: r.updated_at.toISOString() } : null;
}

export async function setNotice(message: string, linkUrl: string | null): Promise<void> {
  if (linkUrl !== null && safeLink(linkUrl) === null) throw new Error('The notice link must be an https:// URL');
  await prisma.$executeRaw`
    INSERT INTO public.app_notice (id, message, link_url, active, updated_at) VALUES (1, ${message}, ${linkUrl}, TRUE, NOW())
    ON CONFLICT (id) DO UPDATE SET message = ${message}, link_url = ${linkUrl}, active = TRUE, updated_at = NOW()
  `;
}

export async function clearNotice(): Promise<void> {
  await prisma.$executeRaw`UPDATE public.app_notice SET active = FALSE, updated_at = NOW() WHERE id = 1`;
}
