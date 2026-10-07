import { useCallback, useState } from 'react';
import { useAiReady } from './useAiReady.js';
import { estimateEntryCalories } from '../services/aiAssistant.js';
import { stripHtml } from '../utils/stripHtml.js';

/**
 * "Estimate" button state for food/exercise field forms. `estimate` is
 * undefined while the AI assistant is off, which hides the button.
 */
export function useCalorieEstimate(
  kind: 'food' | 'exercise' | null,
  contentHtml: string,
  customFields: Record<string, unknown>,
  onChange: (fields: Record<string, unknown>) => void,
) {
  const aiReady = useAiReady();
  const [estimating, setEstimating] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    if (!kind) return;
    setEstimating(true);
    setError('');
    try {
      onChange(await estimateEntryCalories(kind, stripHtml(contentHtml), customFields));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not estimate calories');
    } finally {
      setEstimating(false);
    }
  }, [kind, contentHtml, customFields, onChange]);

  return {
    estimate: aiReady && kind ? run : undefined,
    estimating,
    error,
  };
}
