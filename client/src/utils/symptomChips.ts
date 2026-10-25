/* Symptom chips: a short built-in list of common symptoms plus the person's
   own, saved encrypted as the `symptomChips` setting. Tapping a chip adds the
   symptom to the entry's name ("Flare day, Runny nose"); tapping it again
   takes it out. Pure helpers. */

export const DEFAULT_SYMPTOMS = [
  'Headache', 'Fatigue', 'Flare day', 'Runny nose', 'Congestion', 'Sore throat', 'Cough', 'Fever',
  'Nausea', 'Stomach ache', 'Joint pain', 'Back pain', 'Dizziness', 'Brain fog', 'Cramps', 'Trouble sleeping',
] as const;

/** What's saved: chips the person added, and built-in ones they hid */
export interface SymptomChipConfig { added: string[]; hidden: string[] }

export const EMPTY_SYMPTOM_CHIPS: SymptomChipConfig = { added: [], hidden: [] };

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The chips to show: built-in ones not hidden, then the person's own */
export function symptomChipList(config: SymptomChipConfig | null | undefined): string[] {
  const c = config ?? EMPTY_SYMPTOM_CHIPS;
  const hidden = new Set((c.hidden ?? []).map(key));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...DEFAULT_SYMPTOMS, ...(c.added ?? [])]) {
    const k = key(s);
    if (!k || hidden.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(s.trim());
  }
  return out;
}

/** The symptoms an entry name lists ("Flare day, runny nose" → two) */
export function splitSymptoms(name: string): string[] {
  return name.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

export function hasSymptom(name: string, chip: string): boolean {
  return splitSymptoms(name).some(s => key(s) === key(chip));
}

/** Add the chip's symptom to the name, or take it out if it's there */
export function toggleSymptom(name: string, chip: string): string {
  const parts = splitSymptoms(name);
  const without = parts.filter(s => key(s) !== key(chip));
  return (without.length < parts.length ? without : [...parts, chip.trim()]).join(', ');
}

/** Save a new chip of the person's own (unhiding a built-in one of that name) */
export function addSymptomChip(config: SymptomChipConfig, label: string): SymptomChipConfig {
  const name = label.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) return config;
  const hidden = config.hidden.filter(h => key(h) !== key(name));
  const isDefault = DEFAULT_SYMPTOMS.some(d => key(d) === key(name));
  const added = isDefault || config.added.some(a => key(a) === key(name)) ? config.added : [...config.added, name];
  return { added, hidden };
}

/** Remove a chip: the person's own is deleted, a built-in one is hidden */
export function removeSymptomChip(config: SymptomChipConfig, label: string): SymptomChipConfig {
  const k = key(label);
  if (DEFAULT_SYMPTOMS.some(d => key(d) === k)) {
    return config.hidden.some(h => key(h) === k) ? config : { ...config, hidden: [...config.hidden, label.trim()] };
  }
  return { ...config, added: config.added.filter(a => key(a) !== k) };
}

/** The chips logged most often (from past symptom names), most first; ties keep the list's order */
export function frequentSymptoms(chips: string[], loggedNames: string[], n = 6): string[] {
  const count = new Map<string, number>();
  for (const name of loggedNames) for (const s of splitSymptoms(name)) count.set(key(s), (count.get(key(s)) ?? 0) + 1);
  return chips
    .map((c, i) => ({ c, i, n: count.get(key(c)) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, n)
    .map(x => x.c);
}

/** Type-ahead: chips starting with the query first, then ones containing it; picked ones left out */
export function matchSymptoms(chips: string[], query: string, picked: string[] = [], limit = 8): string[] {
  const q = key(query);
  if (!q) return [];
  const taken = new Set(picked.map(key));
  const open = chips.filter(c => !taken.has(key(c)));
  const starts = open.filter(c => key(c).startsWith(q));
  const contains = open.filter(c => !key(c).startsWith(q) && key(c).includes(q));
  return [...starts, ...contains].slice(0, limit);
}
