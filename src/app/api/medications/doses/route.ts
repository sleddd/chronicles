import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';
import { z } from 'zod';
import { migrateMedicationDoseLogsTable } from '@/lib/db/schemaManager';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const logDoseSchema = z.object({
  medicationId: z.string(),
  scheduledTime: z.string(),
  date: z.string(),
  status: z.enum(['taken', 'skipped', 'pending']),
  takenAt: z.string().nullable().optional(),
});

// GET /api/medications/doses - Get dose logs for a date
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  // Ensure table exists for existing users
  await migrateMedicationDoseLogsTable(session.user.schemaName);

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM "${session.user.schemaName}"."medication_dose_logs"
       WHERE "date" = $1
       ORDER BY "scheduledTime" ASC`,
      [date]
    );

    return NextResponse.json({ logs: result.rows });
  } finally {
    client.release();
  }
}

// POST /api/medications/doses - Log a dose (taken/skipped)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validatedData = logDoseSchema.parse(body);

    // Ensure table exists for existing users
    await migrateMedicationDoseLogsTable(session.user.schemaName);

    const client = await pool.connect();
    try {
      // Check if log already exists for this medication/time/date combo
      const existingLog = await client.query(
        `SELECT id FROM "${session.user.schemaName}"."medication_dose_logs"
         WHERE "medicationId" = $1 AND "scheduledTime" = $2 AND "date" = $3`,
        [validatedData.medicationId, validatedData.scheduledTime, validatedData.date]
      );

      if (existingLog.rows.length > 0) {
        // Update existing log
        // Use client-provided takenAt for accurate timezone, fallback to server time
        const takenAtValue = validatedData.status === 'taken'
          ? (validatedData.takenAt || new Date().toISOString())
          : null;
        const result = await client.query(
          `UPDATE "${session.user.schemaName}"."medication_dose_logs"
           SET "status" = $1, "takenAt" = $2
           WHERE id = $3
           RETURNING *`,
          [
            validatedData.status,
            takenAtValue,
            existingLog.rows[0].id,
          ]
        );
        return NextResponse.json({ log: result.rows[0] });
      }

      // Create new log
      // Use client-provided takenAt for accurate timezone, fallback to server time
      const takenAtValue = validatedData.status === 'taken'
        ? (validatedData.takenAt || new Date().toISOString())
        : null;
      const logId = `dose_${Date.now()}`;
      const result = await client.query(
        `INSERT INTO "${session.user.schemaName}"."medication_dose_logs"
         (id, "medicationId", "scheduledTime", "date", "status", "takenAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          logId,
          validatedData.medicationId,
          validatedData.scheduledTime,
          validatedData.date,
          validatedData.status,
          takenAtValue,
        ]
      );

      return NextResponse.json({ log: result.rows[0] }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Dose log POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
