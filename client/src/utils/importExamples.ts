/**
 * Example files for Settings → Data imports, so people can see the expected
 * shape before importing their own. Kept in step with the importers:
 * `handleImportCsv` in SettingsView (Date + Content required; Topic matches an
 * existing topic by name; Bookmarked "yes"; any other column becomes a custom
 * field) and `planDailyLogImport` in dailyLogImport.ts.
 */

/** Import Entries — CSV. Dates are ISO local times so every browser parses them. */
export const EXAMPLE_ENTRIES_CSV = [
  'Date,Topic,Content,Bookmarked',
  '2026-10-14T08:30,Journal,"Slow morning, coffee on the porch.",no',
  '2026-10-14T12:15,Meals,Lentil soup and a green salad,no',
  '2026-10-15T19:00,Journal,"Two lines here:\nthe second line stays in the same entry.",yes',
].join('\n') + '\n';

/** Import Daily Log — JSON export of the old Daily log tracker. */
export const EXAMPLE_DAILY_LOG = {
  goals: { kcal: 2000, iron: 18, vitD: 15, b12: 2.4, vitC: 75 },
  days: {
    '2026-10-14': {
      entries: {
        a1: { item: 'Oatmeal with blueberries', type: 'Food', kcal: 320, iron: 3.4, vitD: null, b12: null, vitC: 9, notes: '', created: '2026-10-14T08:10:00' },
        a2: { item: 'Vitamin D3 1,000 IU', type: 'Supplement', kcal: null, iron: null, vitD: 25, b12: null, vitC: null, notes: '', created: '2026-10-14T08:15:00' },
        a3: { item: 'Headache', type: 'Symptom', notes: 'Mild, after lunch', created: '2026-10-14T14:00:00' },
        a4: { item: 'Felt rested today', type: 'Note', notes: 'Went to bed early', created: '2026-10-14T21:30:00' },
      },
    },
  },
};

/** Save `text` as a file in the browser. */
export function downloadTextFile(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadEntriesExample(): void {
  downloadTextFile('chronicles-import-example.csv', EXAMPLE_ENTRIES_CSV, 'text/csv;charset=utf-8');
}

export function downloadDailyLogExample(): void {
  downloadTextFile('daily-log-example.json', JSON.stringify(EXAMPLE_DAILY_LOG, null, 2) + '\n', 'application/json');
}
