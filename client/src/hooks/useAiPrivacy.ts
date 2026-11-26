import { useEffect, useState } from 'react';
import { getAiPrivacy, subscribeAiPrivacy, type AiPrivacy } from '../services/aiPrivacy.js';
import { getAiConfigValue, subscribeAi } from '../services/aiAssistant.js';

/** What AI may not see (Settings → In-App AI), kept current. */
export function useAiPrivacy(): AiPrivacy {
  const [value, setValue] = useState(getAiPrivacy);
  useEffect(() => subscribeAiPrivacy(() => setValue(getAiPrivacy())), []);
  return value;
}

/** Is any AI on for this account — In-App AI or the Chronicles AI app? "Hide from AI" shows only then. */
export function useAiIsOn(): boolean {
  const privacy = useAiPrivacy();
  const [inApp, setInApp] = useState(() => getAiConfigValue()?.enabled === true);
  useEffect(() => subscribeAi(() => setInApp(getAiConfigValue()?.enabled === true)), []);
  return inApp || privacy.appEnabled;
}
