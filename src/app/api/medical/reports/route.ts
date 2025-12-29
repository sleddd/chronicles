import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// GET /api/medical/reports - Get aggregated data for reports
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // food, symptom, medication, correlation, all
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const client = await pool.connect();
  try {
    const report: {
      food?: unknown[];
      symptoms?: unknown[];
      medications?: unknown[];
      medicationLogs?: unknown[];
      correlations?: unknown[];
    } = {};

    // Build date filter
    const dateParams: string[] = [];
    let dateFilter = '';
    let paramIndex = 1;

    if (startDate) {
      dateFilter += ` AND e."entryDate" >= $${paramIndex++}`;
      dateParams.push(startDate);
    }
    if (endDate) {
      dateFilter += ` AND e."entryDate" <= $${paramIndex++}`;
      dateParams.push(endDate);
    }

    // Fetch food entries
    if (!type || type === 'food' || type === 'correlation' || type === 'all') {
      const foodResult = await client.query(`
        SELECT e.*,
          json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
        FROM "${session.user.schemaName}"."entries" e
        LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
        WHERE e."customType" = 'food' ${dateFilter}
        GROUP BY e.id
        ORDER BY e."entryDate" DESC, e."createdAt" DESC
      `, dateParams);
      report.food = foodResult.rows;
    }

    // Fetch symptom entries
    if (!type || type === 'symptom' || type === 'correlation' || type === 'all') {
      const symptomResult = await client.query(`
        SELECT e.*,
          json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
        FROM "${session.user.schemaName}"."entries" e
        LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
        WHERE e."customType" = 'symptom' ${dateFilter}
        GROUP BY e.id
        ORDER BY e."entryDate" DESC, e."createdAt" DESC
      `, dateParams);

      // Fetch triggers for symptoms
      const symptomIds = symptomResult.rows.map(row => row.id);
      if (symptomIds.length > 0) {
        const relResult = await client.query(
          `SELECT "entryId" as "symptomId", "relatedToId" as "triggerId", "relationshipType"
           FROM "${session.user.schemaName}"."entry_relationships"
           WHERE "entryId" = ANY($1) AND "relationshipType" IN ('food_symptom', 'medication_symptom')`,
          [symptomIds]
        );

        const symptomTriggers: Record<string, { triggerId: string; relationshipType: string }[]> = {};
        for (const rel of relResult.rows) {
          if (!symptomTriggers[rel.symptomId]) {
            symptomTriggers[rel.symptomId] = [];
          }
          symptomTriggers[rel.symptomId].push({
            triggerId: rel.triggerId,
            relationshipType: rel.relationshipType,
          });
        }

        for (const symptom of symptomResult.rows) {
          symptom.triggers = symptomTriggers[symptom.id] || [];
        }
      }

      report.symptoms = symptomResult.rows;
    }

    // Fetch medication entries
    if (!type || type === 'medication' || type === 'correlation' || type === 'all') {
      const medicationResult = await client.query(`
        SELECT e.*,
          json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields
        FROM "${session.user.schemaName}"."entries" e
        LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
        WHERE e."customType" = 'medication'
        GROUP BY e.id
        ORDER BY e."createdAt" DESC
      `);
      report.medications = medicationResult.rows;

      // Also fetch medication logs
      const logResult = await client.query(`
        SELECT e.*,
          json_agg(DISTINCT cf.*) FILTER (WHERE cf.id IS NOT NULL) as custom_fields,
          rel."relatedToId" as "medicationId"
        FROM "${session.user.schemaName}"."entries" e
        LEFT JOIN "${session.user.schemaName}"."custom_fields" cf ON cf."entryId" = e.id
        LEFT JOIN "${session.user.schemaName}"."entry_relationships" rel
          ON rel."entryId" = e.id AND rel."relationshipType" = 'medication_log'
        WHERE e."customType" = 'medication_log' ${dateFilter}
        GROUP BY e.id, rel."relatedToId"
        ORDER BY e."entryDate" DESC, e."createdAt" DESC
      `, dateParams);
      report.medicationLogs = logResult.rows;
    }

    // Fetch all correlations (relationships between entries)
    if (!type || type === 'correlation' || type === 'all') {
      const correlationResult = await client.query(`
        SELECT r.*,
          e1."customType" as "sourceType",
          e2."customType" as "targetType"
        FROM "${session.user.schemaName}"."entry_relationships" r
        JOIN "${session.user.schemaName}"."entries" e1 ON e1.id = r."entryId"
        JOIN "${session.user.schemaName}"."entries" e2 ON e2.id = r."relatedToId"
        WHERE r."relationshipType" IN ('food_symptom', 'medication_symptom')
        ORDER BY r."createdAt" DESC
      `);
      report.correlations = correlationResult.rows;
    }

    return NextResponse.json({ report });
  } finally {
    client.release();
  }
}
