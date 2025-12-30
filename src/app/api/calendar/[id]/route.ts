import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const updateEventSchema = z.object({
  encryptedTitle: z.string().optional(),
  titleIv: z.string().optional(),
  encryptedDescription: z.string().nullable().optional(),
  descriptionIv: z.string().nullable().optional(),
  startDate: z.string().optional(),
  startTime: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  isAllDay: z.boolean().optional(),
  recurrenceRule: z.string().nullable().optional(),
  color: z.string().optional(),
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

// GET /api/calendar/[id] - Get single event
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."calendar_events" WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event: result.rows[0] });
  } finally {
    client.release();
  }
}

// PUT /api/calendar/[id] - Update event
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const validatedData = updateEventSchema.parse(body);

    const client = await pool.connect();
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const values: (string | boolean | null)[] = [];
      let paramIndex = 1;

      if (validatedData.encryptedTitle !== undefined) {
        updates.push(`"encryptedTitle" = $${paramIndex++}`);
        values.push(validatedData.encryptedTitle);
      }
      if (validatedData.titleIv !== undefined) {
        updates.push(`"titleIv" = $${paramIndex++}`);
        values.push(validatedData.titleIv);
      }
      if (validatedData.encryptedDescription !== undefined) {
        updates.push(`"encryptedDescription" = $${paramIndex++}`);
        values.push(validatedData.encryptedDescription);
      }
      if (validatedData.descriptionIv !== undefined) {
        updates.push(`"descriptionIv" = $${paramIndex++}`);
        values.push(validatedData.descriptionIv);
      }
      if (validatedData.startDate !== undefined) {
        updates.push(`"startDate" = $${paramIndex++}`);
        values.push(validatedData.startDate);
      }
      if (validatedData.startTime !== undefined) {
        updates.push(`"startTime" = $${paramIndex++}`);
        values.push(validatedData.startTime);
      }
      if (validatedData.endDate !== undefined) {
        updates.push(`"endDate" = $${paramIndex++}`);
        values.push(validatedData.endDate);
      }
      if (validatedData.endTime !== undefined) {
        updates.push(`"endTime" = $${paramIndex++}`);
        values.push(validatedData.endTime);
      }
      if (validatedData.isAllDay !== undefined) {
        updates.push(`"isAllDay" = $${paramIndex++}`);
        values.push(validatedData.isAllDay);
      }
      if (validatedData.recurrenceRule !== undefined) {
        updates.push(`"recurrenceRule" = $${paramIndex++}`);
        values.push(validatedData.recurrenceRule);
      }
      if (validatedData.color !== undefined) {
        updates.push(`"color" = $${paramIndex++}`);
        values.push(validatedData.color);
      }
      if (validatedData.linkedEntryId !== undefined) {
        updates.push(`"linkedEntryId" = $${paramIndex++}`);
        values.push(validatedData.linkedEntryId);
      }
      if (validatedData.encryptedLocation !== undefined) {
        updates.push(`"encryptedLocation" = $${paramIndex++}`);
        values.push(validatedData.encryptedLocation);
      }
      if (validatedData.locationIv !== undefined) {
        updates.push(`"locationIv" = $${paramIndex++}`);
        values.push(validatedData.locationIv);
      }
      if (validatedData.encryptedAddress !== undefined) {
        updates.push(`"encryptedAddress" = $${paramIndex++}`);
        values.push(validatedData.encryptedAddress);
      }
      if (validatedData.addressIv !== undefined) {
        updates.push(`"addressIv" = $${paramIndex++}`);
        values.push(validatedData.addressIv);
      }
      if (validatedData.encryptedPhone !== undefined) {
        updates.push(`"encryptedPhone" = $${paramIndex++}`);
        values.push(validatedData.encryptedPhone);
      }
      if (validatedData.phoneIv !== undefined) {
        updates.push(`"phoneIv" = $${paramIndex++}`);
        values.push(validatedData.phoneIv);
      }
      if (validatedData.encryptedNotes !== undefined) {
        updates.push(`"encryptedNotes" = $${paramIndex++}`);
        values.push(validatedData.encryptedNotes);
      }
      if (validatedData.notesIv !== undefined) {
        updates.push(`"notesIv" = $${paramIndex++}`);
        values.push(validatedData.notesIv);
      }

      if (updates.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      updates.push(`"updatedAt" = NOW()`);
      values.push(id);

      const result = await client.query(
        `UPDATE "${session.user.schemaName}"."calendar_events"
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      return NextResponse.json({ event: result.rows[0] });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Calendar PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/calendar/[id] - Delete event
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM "${session.user.schemaName}"."calendar_events" WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Event deleted successfully' });
  } finally {
    client.release();
  }
}
