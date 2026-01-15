import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';
import { migrateCalendarEventsTable } from '@/lib/db/schemaManager';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const createEventSchema = z.object({
  encryptedTitle: z.string(),
  titleIv: z.string(),
  encryptedDescription: z.string().nullable().optional(),
  descriptionIv: z.string().nullable().optional(),
  startDate: z.string(),
  startTime: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isAllDay: z.boolean().default(false),
  recurrenceRule: z.string().nullable().optional(),
  color: z.string().default('#6366f1'),
  linkedEntryId: z.string().nullable().optional(),
  encryptedLocation: z.string().nullable().optional(),
  locationIv: z.string().nullable().optional(),
  encryptedAddress: z.string().nullable().optional(),
  addressIv: z.string().nullable().optional(),
  encryptedPhone: z.string().nullable().optional(),
  phoneIv: z.string().nullable().optional(),
  encryptedNotes: z.string().nullable().optional(),
  notesIv: z.string().nullable().optional(),
});

// GET /api/calendar - List calendar events for a date range
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'startDate and endDate are required' },
      { status: 400 }
    );
  }

  // Ensure calendar_events table exists for this user
  await migrateCalendarEventsTable(session.user.schemaName);

  const client = await pool.connect();
  try {
    // Get calendar events within the date range
    // Events are included if they overlap with the range
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."calendar_events"
       WHERE "startDate" <= $2
       AND COALESCE("endDate", "startDate") >= $1
       ORDER BY "startDate" ASC, "startTime" ASC NULLS FIRST`,
      [startDate, endDate]
    );

    // Fetch entries: tasks/goals/medications by entryDate, but meetings/events without date filter
    // (meetings/events will be filtered client-side by their encrypted startDate custom field)
    const entriesResult = await client.query(
      `SELECT e.*, json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
       FROM "${session.user.schemaName}"."entries" e
       LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
       WHERE (
         (e."customType" IN ('task', 'goal', 'medication') AND e."entryDate" BETWEEN $1 AND $2)
         OR e."customType" IN ('meeting', 'event')
       )
       GROUP BY e.id
       ORDER BY e."entryDate" ASC`,
      [startDate, endDate]
    );

    // Format dates as yyyy-MM-dd strings for consistent frontend comparison
    // Use local date components to avoid timezone shift issues
    const formatDateField = (date: Date | string | null): string | null => {
      if (!date) return null;
      if (typeof date === 'string') return date.split('T')[0];
      // Use UTC methods since pg driver returns dates at UTC midnight
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const formattedEvents = result.rows.map((event) => ({
      ...event,
      startDate: formatDateField(event.startDate),
      endDate: formatDateField(event.endDate),
    }));

    const formattedEntries = entriesResult.rows.map((entry) => ({
      ...entry,
      entryDate: formatDateField(entry.entryDate),
    }));

    return NextResponse.json({
      events: formattedEvents,
      entries: formattedEntries,
    });
  } catch (error) {
    console.error('Calendar GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    client.release();
  }
}

// POST /api/calendar - Create new calendar event
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = createEventSchema.parse(body);

    // Ensure calendar_events table exists for this user
    await migrateCalendarEventsTable(session.user.schemaName);

    const client = await pool.connect();
    try {
      const eventId = `event_${Date.now()}`;

      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."calendar_events"
        (id, "encryptedTitle", "titleIv", "encryptedDescription", "descriptionIv",
         "startDate", "startTime", "endDate", "endTime", "isAllDay",
         "recurrenceRule", "color", "linkedEntryId",
         "encryptedLocation", "locationIv", "encryptedAddress", "addressIv",
         "encryptedPhone", "phoneIv", "encryptedNotes", "notesIv",
         "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
        RETURNING *`,
        [
          eventId,
          validatedData.encryptedTitle,
          validatedData.titleIv,
          validatedData.encryptedDescription || null,
          validatedData.descriptionIv || null,
          validatedData.startDate,
          validatedData.startTime || null,
          validatedData.endDate || null,
          validatedData.endTime || null,
          validatedData.isAllDay,
          validatedData.recurrenceRule || null,
          validatedData.color,
          validatedData.linkedEntryId || null,
          validatedData.encryptedLocation || null,
          validatedData.locationIv || null,
          validatedData.encryptedAddress || null,
          validatedData.addressIv || null,
          validatedData.encryptedPhone || null,
          validatedData.phoneIv || null,
          validatedData.encryptedNotes || null,
          validatedData.notesIv || null,
        ]
      );

      return NextResponse.json({ event: result.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Calendar POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
