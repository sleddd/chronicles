/**
 * Custom Fields Utilities
 *
 * Centralized logic for loading (decrypting) and building (for encryption)
 * custom field data for each entry type.
 *
 * SECURITY NOTE: These functions handle sensitive decrypted data.
 * Ensure proper cleanup of returned values when no longer needed.
 */

import type { EntryState } from '@/components/journal/entryEditorReducer';

// Types for encrypted custom field data from API
export interface EncryptedCustomField {
  encryptedData: string;
  iv: string;
}

export interface ParsedCustomField {
  fieldKey: string;
  value: unknown;
}

// Type for decrypt function signature
export type DecryptFn = (ciphertext: string, iv: string) => Promise<string>;

// Type for encrypt function signature
export type EncryptFn = (plaintext: string) => Promise<{ ciphertext: string; iv: string }>;

/**
 * Helper to decrypt and parse a single custom field
 */
async function decryptField(
  cf: EncryptedCustomField,
  decryptData: DecryptFn
): Promise<ParsedCustomField | null> {
  try {
    const fieldData = await decryptData(cf.encryptedData, cf.iv);
    return JSON.parse(fieldData) as ParsedCustomField;
  } catch {
    return null;
  }
}

/**
 * Helper to encrypt a single field entry
 */
async function encryptField(
  fieldKey: string,
  value: unknown,
  encryptData: EncryptFn
): Promise<EncryptedCustomField> {
  const fieldJson = JSON.stringify({ fieldKey, value });
  const { ciphertext, iv } = await encryptData(fieldJson);
  return { encryptedData: ciphertext, iv };
}

// ============================================================================
// GOAL FIELDS
// ============================================================================

export async function loadGoalFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['goal']>> {
  const updates: Partial<EntryState['goal']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'type':
        updates.type = parsed.value as EntryState['goal']['type'];
        break;
      case 'status':
        updates.status = parsed.value as EntryState['goal']['status'];
        break;
      case 'targetDate':
        updates.targetDate = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildGoalFields(
  fields: EntryState['goal'],
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('type', fields.type, encryptData),
    encryptField('status', fields.status, encryptData),
    encryptField('targetDate', fields.targetDate || null, encryptData),
    encryptField('progressPercentage', 0, encryptData),
  ]);
}

// ============================================================================
// MILESTONE FIELDS
// ============================================================================

export async function loadMilestoneFields(
  entry: { goalIds?: string[] },
): Promise<Partial<EntryState['milestone']>> {
  const updates: Partial<EntryState['milestone']> = {};

  if (entry.goalIds) {
    updates.goalIds = entry.goalIds;
  }

  return updates;
}

export async function buildMilestoneFields(
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('orderIndex', 0, encryptData),
    encryptField('isCompleted', false, encryptData),
    encryptField('completedAt', null, encryptData),
  ]);
}

// ============================================================================
// TASK FIELDS
// ============================================================================

export async function loadTaskFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['task']>> {
  const updates: Partial<EntryState['task']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'isCompleted':
        updates.isCompleted = parsed.value === true;
        break;
      case 'isAutoMigrating':
        updates.isAutoMigrating = parsed.value !== false;
        break;
    }
  }

  return updates;
}

export async function buildTaskFields(
  fields: EntryState['task'],
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('isCompleted', fields.isCompleted, encryptData),
    encryptField('isAutoMigrating', fields.isAutoMigrating, encryptData),
  ]);
}

// ============================================================================
// MEDICATION FIELDS
// ============================================================================

export async function loadMedicationFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['medication']>> {
  const updates: Partial<EntryState['medication']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'dosage':
        updates.dosage = (parsed.value as string) || '';
        break;
      case 'frequency':
        updates.frequency = (parsed.value as EntryState['medication']['frequency']) || 'once_daily';
        break;
      case 'scheduleTimes':
        updates.scheduleTimes = (parsed.value as string[]) || ['08:00'];
        break;
      case 'isActive':
        updates.isActive = parsed.value !== false;
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildMedicationFields(
  fields: EntryState['medication'],
  today: string,
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('dosage', fields.dosage, encryptData),
    encryptField('frequency', fields.frequency, encryptData),
    encryptField('scheduleTimes', fields.scheduleTimes, encryptData),
    encryptField('isActive', fields.isActive, encryptData),
    encryptField('notes', fields.notes, encryptData),
    encryptField('startDate', today, encryptData),
  ]);
}

// ============================================================================
// FOOD FIELDS
// ============================================================================

export async function loadFoodFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['food']>> {
  const updates: Partial<EntryState['food']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'mealType':
        updates.mealType = (parsed.value as EntryState['food']['mealType']) || 'breakfast';
        break;
      case 'consumedAt':
        updates.consumedAt = (parsed.value as string) || '';
        break;
      case 'ingredients':
        updates.ingredients = ((parsed.value as string[]) || []).join(', ');
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildFoodFields(
  fields: EntryState['food'],
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  const ingredientsArray = fields.ingredients
    .split(',')
    .map(i => i.trim())
    .filter(i => i);

  return Promise.all([
    encryptField('mealType', fields.mealType, encryptData),
    encryptField('consumedAt', fields.consumedAt || new Date().toISOString(), encryptData),
    encryptField('ingredients', ingredientsArray, encryptData),
    encryptField('notes', fields.notes, encryptData),
  ]);
}

// ============================================================================
// SYMPTOM FIELDS
// ============================================================================

export async function loadSymptomFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['symptom']>> {
  const updates: Partial<EntryState['symptom']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'severity':
        updates.severity = (parsed.value as number) || 5;
        break;
      case 'occurredAt':
        updates.occurredAt = (parsed.value as string) || '';
        break;
      case 'duration':
        updates.duration = parsed.value?.toString() || '';
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildSymptomFields(
  fields: EntryState['symptom'],
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('severity', fields.severity, encryptData),
    encryptField('occurredAt', fields.occurredAt || new Date().toISOString(), encryptData),
    encryptField('duration', fields.duration ? parseInt(fields.duration) : null, encryptData),
    encryptField('notes', fields.notes, encryptData),
  ]);
}

// ============================================================================
// EVENT FIELDS
// ============================================================================

export async function loadEventFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['event']>> {
  const updates: Partial<EntryState['event']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'startDate':
        updates.startDate = (parsed.value as string) || '';
        break;
      case 'startTime':
        updates.startTime = (parsed.value as string) || '09:00';
        break;
      case 'endDate':
        updates.endDate = (parsed.value as string) || '';
        break;
      case 'endTime':
        updates.endTime = (parsed.value as string) || '10:00';
        break;
      case 'location':
        updates.location = (parsed.value as string) || '';
        break;
      case 'address':
        updates.address = (parsed.value as string) || '';
        break;
      case 'phone':
        updates.phone = (parsed.value as string) || '';
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildEventFields(
  fields: EntryState['event'],
  today: string,
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('startDate', fields.startDate || today, encryptData),
    encryptField('startTime', fields.startTime, encryptData),
    encryptField('endDate', fields.endDate || fields.startDate || today, encryptData),
    encryptField('endTime', fields.endTime, encryptData),
    encryptField('location', fields.location, encryptData),
    encryptField('address', fields.address, encryptData),
    encryptField('phone', fields.phone, encryptData),
    encryptField('notes', fields.notes, encryptData),
  ]);
}

// ============================================================================
// MEETING FIELDS
// ============================================================================

export async function loadMeetingFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['meeting']>> {
  const updates: Partial<EntryState['meeting']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'startDate':
        updates.startDate = (parsed.value as string) || '';
        break;
      case 'startTime':
        updates.startTime = (parsed.value as string) || '09:00';
        break;
      case 'endDate':
        updates.endDate = (parsed.value as string) || '';
        break;
      case 'endTime':
        updates.endTime = (parsed.value as string) || '10:00';
        break;
      case 'location':
        updates.location = (parsed.value as string) || '';
        break;
      case 'address':
        updates.address = (parsed.value as string) || '';
        break;
      case 'phone':
        updates.phone = (parsed.value as string) || '';
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
      case 'topic':
        updates.topic = (parsed.value as string) || '';
        break;
      case 'attendees':
        updates.attendees = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildMeetingFields(
  fields: EntryState['meeting'],
  today: string,
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  return Promise.all([
    encryptField('startDate', fields.startDate || today, encryptData),
    encryptField('startTime', fields.startTime, encryptData),
    encryptField('endDate', fields.endDate || fields.startDate || today, encryptData),
    encryptField('endTime', fields.endTime, encryptData),
    encryptField('location', fields.location, encryptData),
    encryptField('address', fields.address, encryptData),
    encryptField('phone', fields.phone, encryptData),
    encryptField('notes', fields.notes, encryptData),
    encryptField('topic', fields.topic, encryptData),
    encryptField('attendees', fields.attendees, encryptData),
  ]);
}

// ============================================================================
// EXERCISE FIELDS
// ============================================================================

const VALID_EXERCISE_TYPES = ['yoga', 'cardio', 'strength', 'swimming', 'running', 'cycling', 'walking', 'hiking', 'other'] as const;

export async function loadExerciseFields(
  customFields: EncryptedCustomField[],
  decryptData: DecryptFn
): Promise<Partial<EntryState['exercise']>> {
  const updates: Partial<EntryState['exercise']> = {};

  for (const cf of customFields) {
    const parsed = await decryptField(cf, decryptData);
    if (!parsed) continue;

    switch (parsed.fieldKey) {
      case 'exerciseType': {
        const value = parsed.value as string;
        if (VALID_EXERCISE_TYPES.includes(value as typeof VALID_EXERCISE_TYPES[number])) {
          updates.type = value as EntryState['exercise']['type'];
        } else {
          updates.type = 'other';
          updates.otherType = value || '';
        }
        break;
      }
      case 'duration':
        updates.duration = parsed.value?.toString() || '';
        break;
      case 'intensity':
        updates.intensity = (parsed.value as EntryState['exercise']['intensity']) || 'medium';
        break;
      case 'distance':
        updates.distance = parsed.value?.toString() || '';
        break;
      case 'distanceUnit':
        updates.distanceUnit = (parsed.value as EntryState['exercise']['distanceUnit']) || 'miles';
        break;
      case 'calories':
        updates.calories = parsed.value?.toString() || '';
        break;
      case 'performedAt':
        updates.performedAt = (parsed.value as string) || '';
        break;
      case 'notes':
        updates.notes = (parsed.value as string) || '';
        break;
    }
  }

  return updates;
}

export async function buildExerciseFields(
  fields: EntryState['exercise'],
  encryptData: EncryptFn
): Promise<EncryptedCustomField[]> {
  const exerciseTypeValue = fields.type === 'other' ? fields.otherType : fields.type;

  return Promise.all([
    encryptField('exerciseType', exerciseTypeValue, encryptData),
    encryptField('duration', fields.duration ? parseInt(fields.duration) : null, encryptData),
    encryptField('intensity', fields.intensity, encryptData),
    encryptField('distance', fields.distance ? parseFloat(fields.distance) : null, encryptData),
    encryptField('distanceUnit', fields.distanceUnit, encryptData),
    encryptField('calories', fields.calories ? parseInt(fields.calories) : null, encryptData),
    encryptField('performedAt', fields.performedAt || new Date().toISOString(), encryptData),
    encryptField('notes', fields.notes, encryptData),
  ]);
}

// ============================================================================
// UNIFIED LOADERS AND BUILDERS
// ============================================================================

/**
 * Load custom fields for any entry type
 */
export async function loadCustomFields(
  entryType: string,
  customFields: EncryptedCustomField[] | undefined,
  entry: { goalIds?: string[] },
  decryptData: DecryptFn
): Promise<Partial<EntryState>> {
  if (!customFields && entryType !== 'milestone') {
    return {};
  }

  switch (entryType) {
    case 'goal':
      return { goal: await loadGoalFields(customFields || [], decryptData) as EntryState['goal'] };
    case 'milestone':
      return { milestone: await loadMilestoneFields(entry) as EntryState['milestone'] };
    case 'task':
      return { task: await loadTaskFields(customFields || [], decryptData) as EntryState['task'] };
    case 'medication':
      return { medication: await loadMedicationFields(customFields || [], decryptData) as EntryState['medication'] };
    case 'food':
      return { food: await loadFoodFields(customFields || [], decryptData) as EntryState['food'] };
    case 'symptom':
      return { symptom: await loadSymptomFields(customFields || [], decryptData) as EntryState['symptom'] };
    case 'event':
      return { event: await loadEventFields(customFields || [], decryptData) as EntryState['event'] };
    case 'meeting':
      return { meeting: await loadMeetingFields(customFields || [], decryptData) as EntryState['meeting'] };
    case 'exercise':
      return { exercise: await loadExerciseFields(customFields || [], decryptData) as EntryState['exercise'] };
    default:
      return {};
  }
}

/**
 * Build custom fields for any entry type
 */
export async function buildCustomFields(
  entryType: string,
  state: EntryState,
  today: string,
  encryptData: EncryptFn
): Promise<EncryptedCustomField[] | undefined> {
  switch (entryType) {
    case 'goal':
      return buildGoalFields(state.goal, encryptData);
    case 'milestone':
      return buildMilestoneFields(encryptData);
    case 'task':
      return buildTaskFields(state.task, encryptData);
    case 'medication':
      return buildMedicationFields(state.medication, today, encryptData);
    case 'food':
      return buildFoodFields(state.food, encryptData);
    case 'symptom':
      return buildSymptomFields(state.symptom, encryptData);
    case 'event':
      return buildEventFields(state.event, today, encryptData);
    case 'meeting':
      return buildMeetingFields(state.meeting, today, encryptData);
    case 'exercise':
      return buildExerciseFields(state.exercise, encryptData);
    default:
      return undefined;
  }
}
