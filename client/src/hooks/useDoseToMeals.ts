import { useCallback } from 'react';
import type { DecryptedPost } from '@shared/crypto/types';
import { useEncryption } from '../contexts/EncryptionContext.js';
import { useEntriesStore } from '../stores/entriesStore.js';
import { entries as entriesApi, topics as topicsApi } from '../services/api.js';
import { estimateFoodNutrition, isAiReady } from '../services/aiAssistant.js';
import { stripHtml } from '../utils/stripHtml.js';
import { toDateStr } from '../utils/dateUtils.js';
import { nowTime } from '../utils/foodLog.js';
import {
  DOSE_NUTRIENT_KEYS, doseLinkKey, hasAnyNutrient, parseMedNutrients, storedDoseNutrients, type DoseNutrients,
} from '../utils/medNutrients.js';

function meta(e: DecryptedPost): Record<string, unknown> {
  return (e.metadata as Record<string, unknown>) ?? {};
}
function fieldsOf(e: DecryptedPost): Record<string, unknown> {
  return (meta(e)._customFields as Record<string, unknown>) ?? {};
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Taking a dose of something with vitamins/minerals in it adds a row to that
 * day's Meals log (meal type "medication"), so the nutrient totals include
 * it; un-taking it removes the row. Per-dose nutrients come from, in order:
 * values typed on the medication, its name + dosage ("Vitamin D3 1000 IU"),
 * or — with the AI assistant on — one AI estimate, cached on the medication.
 * Medications with no nutrients (e.g. antihistamines) add nothing.
 */
export function useDoseToMeals() {
  const { encryptPost } = useEncryption();

  const saveEntry = useCallback(async (e: DecryptedPost, metadata: Record<string, unknown>) => {
    const tid = metadata._taxonomyId as number | undefined;
    const enc = await encryptPost(e.content, metadata);
    await entriesApi.update(e.id, {
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      taxonomyIds: tid ? [tid] : [],
    });
    useEntriesStore.getState().updateDecryptedEntry(e.id, { metadata });
  }, [encryptPost]);

  /** Per-dose nutrients for a medication entry (may ask the AI once and cache the answer on it). */
  const nutrientsFor = useCallback(async (med: DecryptedPost): Promise<DoseNutrients> => {
    const cf = fieldsOf(med);
    const name = stripHtml(med.content).trim();
    const dosage = String(cf.dosage ?? '');
    const basis = `${name}|${dosage}`.toLowerCase();

    const stored = storedDoseNutrients(cf);
    const aiStale = cf.doseNutrientSource === 'ai' && cf.doseNutrientBasis !== basis;
    if (Object.keys(stored).length && !aiStale) return stored;

    const parsed = parseMedNutrients(name, dosage);
    if (hasAnyNutrient(parsed)) return parsed;

    // Ask the AI once per name+dosage; remember the answer (even "none") on the medication
    if (!isAiReady() || (cf.doseNutrientBasis === basis && cf.doseNutrientSource === 'ai')) return aiStale ? {} : stored;
    try {
      const est = await estimateFoodNutrition({ description: `${name}${dosage ? `, ${dosage}` : ''} (one dose)`, mealType: 'supplement' }, DOSE_NUTRIENT_KEYS);
      const next: Record<string, unknown> = { ...cf, doseNutrientSource: 'ai', doseNutrientBasis: basis };
      for (const k of DOSE_NUTRIENT_KEYS) next[k] = typeof est[k] === 'number' ? String(est[k]) : '';
      await saveEntry(med, { ...meta(med), _customFields: next });
      return storedDoseNutrients(next);
    } catch (err) {
      console.warn('Could not estimate dose nutrients:', err);
      return {};
    }
  }, [saveEntry]);

  const mealsTopicId = useCallback(async (): Promise<number> => {
    const { allTopics, setTopics } = useEntriesStore.getState();
    let topic = allTopics.find(t => t.name.toLowerCase() === 'meals');
    if (!topic) {
      topic = await topicsApi.create({ name: 'Meals', icon: 'utensils' });
      setTopics([...allTopics, topic]);
    }
    return topic.id;
  }, []);

  const linked = (key: string) =>
    useEntriesStore.getState().decryptedEntries.filter(e => meta(e)._doseLink === key);

  /** A dose was marked taken on `date` at its scheduled `time`. */
  const onTaken = useCallback(async (medicationPostId: number, date: string, time: string) => {
    const key = doseLinkKey(medicationPostId, date, time);
    if (linked(key).length) return;
    const med = useEntriesStore.getState().decryptedEntries.find(e => e.id === medicationPostId);
    if (!med) return;
    const values = await nutrientsFor(med);
    if (!hasAnyNutrient(values) || linked(key).length) return;

    const name = stripHtml(med.content).trim() || 'Medication';
    const dosage = String(fieldsOf(med).dosage ?? '').trim();
    const today = toDateStr(new Date());
    const cf: Record<string, unknown> = {
      mealDescription: name,
      mealType: 'medication',
      consumedDate: date,
      consumedTime: date === today ? nowTime() : time.slice(0, 5),
      notes: dosage ? `${dosage} · from your medication schedule` : 'From your medication schedule',
    };
    const source: Record<string, 'manual'> = {};
    for (const k of DOSE_NUTRIENT_KEYS) {
      const v = values[k];
      cf[k] = typeof v === 'number' ? String(v) : '';
      if (typeof v === 'number') source[k] = 'manual';
    }
    cf.nutrientSource = source;

    const tid = await mealsTopicId();
    const content = `<p>${escapeHtml(name)}</p>`;
    const metadata = { _taxonomyId: tid, _doseLink: key, _customFields: cf };
    const enc = await encryptPost(content, metadata);
    const res = await entriesApi.create({
      contentEncrypted: enc.contentEncrypted, contentIv: enc.contentIv,
      metadataEncrypted: enc.metadataEncrypted, metadataIv: enc.metadataIv,
      isEncrypted: true, taxonomyIds: [tid],
      ...(date === today ? {} : { createdAt: new Date(`${date}T12:00:00`).toISOString() }),
    });
    useEntriesStore.getState().addDecryptedEntry({
      id: res.id as number, content, metadata, isEncrypted: true,
      createdAt: new Date(res.createdAt as string),
      updatedAt: new Date((res.updatedAt || res.createdAt) as string),
    });
  }, [encryptPost, mealsTopicId, nutrientsFor]);

  /** A dose was un-marked — remove the Meals row it added. */
  const onUntaken = useCallback(async (medicationPostId: number, date: string, time: string) => {
    for (const e of linked(doseLinkKey(medicationPostId, date, time))) {
      await entriesApi.delete(e.id);
      useEntriesStore.getState().removeEntry(e.id);
    }
  }, []);

  return { onTaken, onUntaken };
}
