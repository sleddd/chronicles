/**
 * Seed test data for all topic types.
 * Must run in the browser with encryption unlocked.
 */
import { entries as entriesApi, topics as topicsApi, doses as dosesApi } from '../services/api.js';
import { useEntriesStore } from '../stores/entriesStore.js';

type EncryptPost = (content: string, metadata: Record<string, unknown>) => Promise<{
  id: number;
  contentEncrypted: string;
  contentIv: string;
  metadataEncrypted: string;
  metadataIv: string;
}>;

type TopicInfo = { id: number; name: string; icon: string | null; color: string | null };

interface SeedDeps {
  encryptPost: EncryptPost;
  topics: TopicInfo[];
  addDecryptedEntry: ReturnType<typeof useEntriesStore.getState>['addDecryptedEntry'];
  onProgress?: (msg: string) => void;
}

function findTopic(topics: TopicInfo[], name: string): number | null {
  const t = topics.find(tp => tp.name.toLowerCase() === name.toLowerCase());
  return t ? t.id : null;
}

/** A topic the defaults don't include (Wellness, Priorities) — created if missing */
async function ensureTopic(deps: SeedDeps, name: string, icon: string): Promise<void> {
  if (findTopic(deps.topics, name)) return;
  const topic = await topicsApi.create({ name, icon });
  deps.topics.push(topic as TopicInfo);
  const store = useEntriesStore.getState();
  store.setTopics([...store.allTopics, topic]);
}

/** Local YYYY-MM-DD, `offset` days from today */
function dayFromToday(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "10/19/2026" for a YYYY-MM-DD day */
const usDate = (day: string) => { const [y, m, d] = day.split('-'); return `${m}/${d}/${y}`; };

/** "1:35 PM" for HH:MM */
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

async function createEntry(
  deps: SeedDeps,
  content: string,
  topicName: string | null,
  customFields?: Record<string, unknown>,
  /** Backdate it (YYYY-MM-DD) and/or tag it as a widget's entry */
  opts: { day?: string; widgetType?: string; html?: string } = {},
): Promise<number> {
  const { encryptPost, topics, addDecryptedEntry, onProgress } = deps;
  const topicId = topicName ? findTopic(topics, topicName) : null;

  if (topicName && !topicId) {
    throw new Error(`Topic "${topicName}" not found. Available: ${topics.map(t => t.name).join(', ')}`);
  }

  const metadata: Record<string, unknown> = {};
  if (topicId) metadata._taxonomyId = topicId;
  if (opts.widgetType) metadata._widgetType = opts.widgetType;
  if (customFields && Object.keys(customFields).length > 0) metadata._customFields = customFields;

  const html = opts.html ?? `<p>${content}</p>`;
  const encrypted = await encryptPost(html, metadata);
  const result = await entriesApi.create({
    id: encrypted.id,
    contentEncrypted: encrypted.contentEncrypted,
    contentIv: encrypted.contentIv,
    metadataEncrypted: encrypted.metadataEncrypted,
    metadataIv: encrypted.metadataIv,
    isEncrypted: true,
    taxonomyIds: topicId ? [topicId] : [],
    ...(opts.day ? { createdAt: new Date(`${opts.day}T12:00:00`).toISOString() } : {}),
  });

  const id = result.id as number;
  addDecryptedEntry({
    id,
    content: html,
    metadata,
    isEncrypted: true,
    createdAt: new Date(result.createdAt as string),
    updatedAt: new Date((result.updatedAt || result.createdAt) as string),
  });

  onProgress?.(`Created: ${(content || html.replace(/<[^>]+>/g, " ")).trim().slice(0, 50)}...`);
  return id;
}

export async function seedTestData(deps: SeedDeps): Promise<string> {
  const { onProgress } = deps;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const fourDaysAgo = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const sixDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let count = 0;

  try {
    onProgress?.('Creating goals, milestones, tasks and todos...');
    count += await seedPlanning(deps);

    onProgress?.('Creating medications...');

    // ── Medications ──
    const lisinopril = await createEntry(deps, 'Lisinopril', 'Medication', {
      medicationName: 'Lisinopril', dosage: '10mg', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: 'Take in the morning with water. Monitor BP weekly.',
    }); count++;
    const metformin = await createEntry(deps, 'Metformin', 'Medication', {
      medicationName: 'Metformin', dosage: '500mg', frequency: 'twice_daily', scheduleTimes: ['08:00', '20:00'], isActive: true, notes: 'Take with meals to reduce GI side effects.',
    }); count++;
    const vitD = await createEntry(deps, 'Vitamin D3', 'Medication', {
      medicationName: 'Vitamin D3', dosage: '2000 IU', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true, notes: 'Take with fatty food for better absorption.',
    }); count++;
    const ibuprofen = await createEntry(deps, 'Ibuprofen', 'Medication', {
      medicationName: 'Ibuprofen', dosage: '400mg', frequency: 'as_needed', scheduleTimes: [], isActive: true, notes: 'Max 3 doses per day. Take with food.',
    }); count++;
    const amoxicillin = await createEntry(deps, 'Amoxicillin', 'Medication', {
      medicationName: 'Amoxicillin', dosage: '500mg', frequency: 'three_times_daily', scheduleTimes: ['08:00', '14:00', '20:00'], isActive: false, notes: 'Completed 10-day course on March 15.',
    }); count++;
    const melatonin = await createEntry(deps, 'Melatonin', 'Medication', {
      medicationName: 'Melatonin', dosage: '3mg', frequency: 'once_daily', scheduleTimes: ['21:30'], isActive: true, notes: 'Take 30 min before bed. Reduce to 1mg after sleep pattern stabilizes.',
    }); count++;

    onProgress?.('Logging two weeks of medication doses...');
    count += await seedDoses({ lisinopril, metformin, vitD, melatonin, ibuprofen });
    void amoxicillin;

    onProgress?.('Creating food entries...');

    // ── Food (multi-day, varied meals) ──
    // Today
    await createEntry(deps, 'Morning smoothie — banana, spinach, protein powder, almond milk', 'Meals', {
      mealType: 'breakfast', consumedDate: today, consumedTime: '07:30', ingredients: 'banana, spinach, protein powder, almond milk', calories: '350', notes: 'Added extra protein today',
    }); count++;
    await createEntry(deps, 'Grilled chicken salad with avocado and quinoa', 'Meals', {
      mealType: 'lunch', consumedDate: today, consumedTime: '12:30', ingredients: 'chicken breast, mixed greens, avocado, quinoa, cherry tomatoes, olive oil dressing', calories: '580', notes: 'Great balance of protein and healthy fats',
    }); count++;
    await createEntry(deps, 'Handful of almonds and a banana', 'Meals', {
      mealType: 'snack', consumedDate: today, consumedTime: '15:30', ingredients: 'almonds, banana', calories: '250', notes: '',
    }); count++;
    // Yesterday
    await createEntry(deps, 'Scrambled eggs on sourdough with avocado', 'Meals', {
      mealType: 'breakfast', consumedDate: yesterday, consumedTime: '08:00', ingredients: 'eggs, sourdough bread, avocado, salt, pepper, chili flakes', calories: '450', notes: 'Used farm-fresh eggs',
    }); count++;
    await createEntry(deps, 'Turkey and hummus wrap with side salad', 'Meals', {
      mealType: 'lunch', consumedDate: yesterday, consumedTime: '12:45', ingredients: 'whole wheat wrap, turkey, hummus, lettuce, tomato, cucumber, side salad', calories: '520', notes: '',
    }); count++;
    await createEntry(deps, 'Salmon with roasted vegetables and brown rice', 'Meals', {
      mealType: 'dinner', consumedDate: yesterday, consumedTime: '19:00', ingredients: 'salmon fillet, broccoli, sweet potato, brown rice, lemon, garlic', calories: '650', notes: 'Pan-seared salmon — came out perfectly',
    }); count++;
    await createEntry(deps, 'Greek yogurt with honey and walnuts', 'Meals', {
      mealType: 'snack', consumedDate: yesterday, consumedTime: '21:00', ingredients: 'greek yogurt, honey, walnuts', calories: '220', notes: '',
    }); count++;
    // 2 days ago
    await createEntry(deps, 'Oatmeal with blueberries and chia seeds', 'Meals', {
      mealType: 'breakfast', consumedDate: twoDaysAgo, consumedTime: '07:45', ingredients: 'oats, blueberries, chia seeds, almond milk, maple syrup', calories: '380', notes: '',
    }); count++;
    await createEntry(deps, 'Chicken tikka masala with naan bread', 'Meals', {
      mealType: 'dinner', consumedDate: twoDaysAgo, consumedTime: '19:30', ingredients: 'chicken, tikka sauce, basmati rice, naan, raita', calories: '780', notes: 'Homemade — turned out amazing. Save recipe.',
    }); count++;
    // 3 days ago
    await createEntry(deps, 'Veggie burger with sweet potato fries', 'Meals', {
      mealType: 'lunch', consumedDate: threeDaysAgo, consumedTime: '13:00', ingredients: 'black bean patty, brioche bun, lettuce, tomato, pickles, sweet potato fries', calories: '620', notes: 'From that new place downtown',
    }); count++;
    await createEntry(deps, 'Pasta carbonara with garlic bread', 'Meals', {
      mealType: 'dinner', consumedDate: threeDaysAgo, consumedTime: '19:15', ingredients: 'spaghetti, pancetta, eggs, parmesan, garlic bread', calories: '720', notes: 'Went a bit heavy today. Worth it.',
    }); count++;

    onProgress?.('Creating exercise entries...');

    // ── Exercise (multi-day, varied types) ──
    await createEntry(deps, '5K morning run around the park — felt great', 'Exercise', {
      exerciseType: 'running', duration: '28', intensity: 'medium', distance: '5', distanceUnit: 'km', calories: '320', performedDate: today, performedTime: '06:00', notes: 'New personal best pace',
    }); count++;
    await createEntry(deps, 'Upper body strength training — bench, rows, OHP', 'Exercise', {
      exerciseType: 'strength', duration: '55', intensity: 'high', distance: '', distanceUnit: 'km', calories: '280', performedDate: yesterday, performedTime: '07:00', notes: 'Bench PR: 185 lbs. Increased OHP to 105.',
    }); count++;
    await createEntry(deps, 'Evening yoga flow — hips and shoulders focus', 'Exercise', {
      exerciseType: 'yoga', duration: '40', intensity: 'low', distance: '', distanceUnit: 'km', calories: '120', performedDate: yesterday, performedTime: '18:30', notes: 'Follow-along from Yoga with Adriene. Really needed this.',
    }); count++;
    await createEntry(deps, '10K cycling along the river trail', 'Exercise', {
      exerciseType: 'cycling', duration: '35', intensity: 'medium', distance: '10', distanceUnit: 'km', calories: '250', performedDate: twoDaysAgo, performedTime: '06:30', notes: 'Cool morning — perfect cycling weather',
    }); count++;
    await createEntry(deps, 'Lunchtime walk around the neighborhood', 'Exercise', {
      exerciseType: 'walking', duration: '30', intensity: 'low', distance: '2.5', distanceUnit: 'km', calories: '100', performedDate: twoDaysAgo, performedTime: '12:15', notes: 'Listened to a podcast on distributed systems',
    }); count++;
    await createEntry(deps, 'HIIT cardio session — 30 sec on / 30 sec off', 'Exercise', {
      exerciseType: 'cardio', duration: '25', intensity: 'high', distance: '', distanceUnit: 'km', calories: '310', performedDate: threeDaysAgo, performedTime: '06:00', notes: 'Burpees, mountain climbers, jumping jacks, high knees',
    }); count++;
    await createEntry(deps, 'Swimming laps at the community pool', 'Exercise', {
      exerciseType: 'swimming', duration: '45', intensity: 'medium', distance: '1.5', distanceUnit: 'km', calories: '400', performedDate: fourDaysAgo, performedTime: '07:00', notes: 'Alternated freestyle and backstroke. Pool was quiet.',
    }); count++;
    await createEntry(deps, 'Leg day — squats, deadlifts, lunges', 'Exercise', {
      exerciseType: 'strength', duration: '50', intensity: 'high', distance: '', distanceUnit: 'km', calories: '300', performedDate: fiveDaysAgo, performedTime: '07:15', notes: 'Squat 225 x 5. Legs are going to be sore tomorrow.',
    }); count++;
    await createEntry(deps, 'Rest day walk with the dog', 'Exercise', {
      exerciseType: 'walking', duration: '20', intensity: 'low', distance: '1.5', distanceUnit: 'km', calories: '70', performedDate: sixDaysAgo, performedTime: '08:00', notes: 'Active recovery. Stretched after.',
    }); count++;

    onProgress?.('Creating symptom entries...');

    // ── Symptoms (varied across days) ──
    await createEntry(deps, 'Headache', 'Symptom', {
      symptomName: 'Headache', severity: 3, occurredDate: today, occurredTime: '13:30', duration: '45', notes: 'Drank more water, resolved by 2pm',
    }); count++;
    await createEntry(deps, 'Back pain', 'Symptom', {
      symptomName: 'Back pain', severity: 4, occurredDate: yesterday, occurredTime: '11:00', duration: '120', notes: 'Improved after yoga session in the evening. Need to get up more frequently.',
    }); count++;
    await createEntry(deps, 'Sore throat', 'Symptom', {
      symptomName: 'Sore throat', severity: 5, occurredDate: twoDaysAgo, occurredTime: '18:00', duration: '240', notes: 'Gargled with salt water. Drank herbal tea. Gone by morning.',
    }); count++;
    await createEntry(deps, 'Muscle soreness', 'Symptom', {
      symptomName: 'Muscle soreness', severity: 6, occurredDate: fourDaysAgo, occurredTime: '09:00', duration: '1440', notes: 'DOMS hit hard. Walking down stairs was an adventure. Foam rolled.',
    }); count++;
    await createEntry(deps, 'Eye strain', 'Symptom', {
      symptomName: 'Eye strain', severity: 3, occurredDate: threeDaysAgo, occurredTime: '16:00', duration: '90', notes: 'Used eye drops and took a 20-min break. Need to follow the 20-20-20 rule.',
    }); count++;
    await createEntry(deps, 'Nausea', 'Symptom', {
      symptomName: 'Nausea', severity: 4, occurredDate: fiveDaysAgo, occurredTime: '08:30', duration: '60', notes: 'Forgot to eat before taking it. Resolved after having toast. Must take with food.',
    }); count++;
    await createEntry(deps, 'Runny nose, Congestion', 'Symptom', {
      symptomName: 'Runny nose, Congestion', severity: 5, occurredDate: sixDaysAgo, occurredTime: '10:00', duration: '360', notes: 'Pollen count was high. Took antihistamine which helped after an hour.',
    }); count++;

    // Headaches on the days ibuprofen was taken (Reports: what comes before symptoms)
    for (const [offset, time, sev] of [[-3, '10:30', 6], [-6, '09:15', 5], [-9, '15:00', 7], [-12, '11:00', 4]] as const) {
      await createEntry(deps, 'Headache', 'Symptom', {
        symptomName: 'Headache', severity: sev, occurredDate: dayFromToday(offset), occurredTime: time, duration: '90', notes: '',
      }, { day: dayFromToday(offset) }); count++;
    }
    // Stomach ache a couple of hours after the extra ibuprofen
    for (const offset of [-3, -9]) {
      await createEntry(deps, 'Stomach ache', 'Symptom', {
        symptomName: 'Stomach ache', severity: 4, occurredDate: dayFromToday(offset), occurredTime: '16:30', duration: '60', notes: 'After the second ibuprofen',
      }, { day: dayFromToday(offset) }); count++;
    }

    onProgress?.('Creating a month of meals, symptoms, exercise and supplements for Reports...');
    count += await seedReportMonth(deps);

    onProgress?.('Creating 30 days of wellness check-ins...');
    count += await seedWellness(deps);

    onProgress?.('Creating priorities...');
    count += await seedPriorities(deps);

    onProgress?.('Creating entertainment entries...');

    // Music
    await createEntry(deps, 'Discovered Khruangbin — incredible blend of funk, soul, and psychedelic. "Time (You and I)" on repeat', 'Music', {}); count++;

    // Books
    await createEntry(deps, 'Reading "Designing Data-Intensive Applications" by Martin Kleppmann — chapter on replication is mind-blowing', 'Books', {}); count++;

    // TV/Movies
    await createEntry(deps, 'Watched Severance S2 — the worldbuilding keeps getting deeper. The corridor scene was incredible.', 'TV/Movies', {}); count++;

    onProgress?.('Creating events and meetings...');

    // Event
    await createEntry(deps, 'Team standup — daily sync on sprint progress', 'Event', {
      startDate: today, startTime: '09:00', endDate: today, endTime: '09:15', location: 'Zoom', address: '', phone: '', notes: 'Bring up the deployment blocker',
    }); count++;

    // Meeting
    await createEntry(deps, '1:1 with manager — discuss career growth and Q2 goals', 'Meeting', {
      startDate: nextWeek, startTime: '14:00', endDate: nextWeek, endTime: '14:45', meetingTopic: 'Career growth + Q2 planning', attendees: 'Sarah (manager)', location: 'Conference Room B', address: '', phone: '', notes: 'Prepare talking points about tech lead role',
    }); count++;

    onProgress?.('Creating inspiration entries...');

    // Idea
    await createEntry(deps, 'What if we added voice notes to journal entries? Could use Web Audio API for recording, encrypt the blob, and store alongside text content.', 'Idea', {}); count++;

    // Research
    await createEntry(deps, 'Investigating WebRTC for real-time collaboration — could enable shared journals or live co-editing. Found good resources on PeerJS for simplified WebRTC.', 'Research', {}); count++;

    // Quote
    await createEntry(deps, '"The best way to predict the future is to invent it." — Alan Kay', 'Quote', {}); count++;

    onProgress?.('Creating recipes...');

    // Compute this week's Monday for the menu plan
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - dow + (dow === 0 ? -6 : 1));
    monday.setHours(0, 0, 0, 0);
    const weekStart = monday.toISOString().slice(0, 10);
    const dayStr = (offset: number) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    // ── Recipes ──
    const recipe1 = await createEntry(deps, 'Chicken Stir-Fry with Vegetables', 'Recipe', {
      servings: '4',
      prepTime: '15 min',
      cookTime: '20 min',
      cuisine: 'Asian',
      ingredients: [
        { id: crypto.randomUUID(), amount: '500g', name: 'chicken breast, sliced' },
        { id: crypto.randomUUID(), amount: '2 tbsp', name: 'soy sauce' },
        { id: crypto.randomUUID(), amount: '1 tbsp', name: 'sesame oil' },
        { id: crypto.randomUUID(), amount: '2 cloves', name: 'garlic, minced' },
        { id: crypto.randomUUID(), amount: '1 tbsp', name: 'fresh ginger, grated' },
        { id: crypto.randomUUID(), amount: '1 cup', name: 'broccoli florets' },
        { id: crypto.randomUUID(), amount: '1', name: 'red bell pepper, sliced' },
        { id: crypto.randomUUID(), amount: '1 cup', name: 'snap peas' },
        { id: crypto.randomUUID(), amount: '2 tbsp', name: 'vegetable oil' },
        { id: crypto.randomUUID(), amount: '2 cups', name: 'jasmine rice, cooked' },
      ],
      instructions: 'Marinate chicken in soy sauce for 10 min. Heat oil in wok over high heat. Cook chicken 5–6 min. Remove and set aside. Stir-fry garlic and ginger 30 sec, then add vegetables and cook 4–5 min. Return chicken, add sesame oil, toss everything together. Serve over rice.',
      linkedShoppingListIds: [],
    }); count++;

    const recipe2 = await createEntry(deps, 'Classic Pasta Marinara', 'Recipe', {
      servings: '4',
      prepTime: '10 min',
      cookTime: '25 min',
      cuisine: 'Italian',
      ingredients: [
        { id: crypto.randomUUID(), amount: '400g', name: 'spaghetti' },
        { id: crypto.randomUUID(), amount: '2 cans', name: 'crushed tomatoes (400g each)' },
        { id: crypto.randomUUID(), amount: '4 cloves', name: 'garlic, minced' },
        { id: crypto.randomUUID(), amount: '1 medium', name: 'onion, diced' },
        { id: crypto.randomUUID(), amount: '3 tbsp', name: 'olive oil' },
        { id: crypto.randomUUID(), amount: '1 tsp', name: 'dried oregano' },
        { id: crypto.randomUUID(), amount: '1 tsp', name: 'dried basil' },
        { id: crypto.randomUUID(), amount: '1/2 tsp', name: 'red pepper flakes' },
        { id: crypto.randomUUID(), amount: 'to taste', name: 'salt and black pepper' },
        { id: crypto.randomUUID(), amount: '50g', name: 'parmesan, grated' },
      ],
      instructions: 'Cook pasta in salted boiling water until al dente. Meanwhile, sauté onion in olive oil 5 min, add garlic 1 min. Add tomatoes, herbs, and chili flakes. Simmer 15 min. Season well. Drain pasta and toss with sauce. Top with parmesan.',
      linkedShoppingListIds: [],
    }); count++;

    const recipe3 = await createEntry(deps, 'Avocado Toast with Poached Eggs', 'Recipe', {
      servings: '2',
      prepTime: '5 min',
      cookTime: '10 min',
      cuisine: 'Breakfast',
      ingredients: [
        { id: crypto.randomUUID(), amount: '2 slices', name: 'sourdough bread, thick-cut' },
        { id: crypto.randomUUID(), amount: '1 large', name: 'ripe avocado' },
        { id: crypto.randomUUID(), amount: '2', name: 'large eggs' },
        { id: crypto.randomUUID(), amount: '1 tbsp', name: 'white vinegar (for poaching)' },
        { id: crypto.randomUUID(), amount: '1/2', name: 'lemon, juiced' },
        { id: crypto.randomUUID(), amount: 'pinch', name: 'chili flakes' },
        { id: crypto.randomUUID(), amount: 'to taste', name: 'salt and black pepper' },
        { id: crypto.randomUUID(), amount: 'handful', name: 'microgreens or rocket, to serve' },
      ],
      instructions: 'Toast bread until golden. Mash avocado with lemon juice, salt, and pepper. Bring a pan of water to a gentle simmer, add vinegar. Create a gentle whirlpool, crack egg in, poach 3 min. Spread avocado on toast, top with poached egg, chili flakes, and greens.',
      linkedShoppingListIds: [],
    }); count++;

    const recipe4 = await createEntry(deps, 'Beef Tacos with Pico de Gallo', 'Recipe', {
      servings: '4',
      prepTime: '20 min',
      cookTime: '15 min',
      cuisine: 'Mexican',
      ingredients: [
        { id: crypto.randomUUID(), amount: '500g', name: 'ground beef' },
        { id: crypto.randomUUID(), amount: '8', name: 'small corn tortillas' },
        { id: crypto.randomUUID(), amount: '1 packet', name: 'taco seasoning' },
        { id: crypto.randomUUID(), amount: '3 medium', name: 'tomatoes, diced' },
        { id: crypto.randomUUID(), amount: '1/2', name: 'red onion, finely diced' },
        { id: crypto.randomUUID(), amount: '1', name: 'jalapeño, seeded and minced' },
        { id: crypto.randomUUID(), amount: '1/4 cup', name: 'fresh cilantro, chopped' },
        { id: crypto.randomUUID(), amount: '1', name: 'lime, juiced' },
        { id: crypto.randomUUID(), amount: '1 cup', name: 'shredded cheddar' },
        { id: crypto.randomUUID(), amount: '1', name: 'avocado, sliced' },
      ],
      instructions: 'Brown beef in a skillet over medium-high heat, drain fat, add taco seasoning with 1/4 cup water. Simmer 5 min. Combine tomatoes, onion, jalapeño, cilantro, and lime juice for pico. Warm tortillas. Assemble tacos with beef, pico, cheese, and avocado.',
      linkedShoppingListIds: [],
    }); count++;

    onProgress?.('Creating shopping lists...');

    // ── Shopping Lists ──
    // Current list — partially checked
    const sl1Items = [
      { id: crypto.randomUUID(), name: 'chicken breast (500g)', category: 'meat', checked: true },
      { id: crypto.randomUUID(), name: 'ground beef (500g)', category: 'meat', checked: false },
      { id: crypto.randomUUID(), name: 'broccoli florets', category: 'produce', checked: true },
      { id: crypto.randomUUID(), name: 'red bell pepper', category: 'produce', checked: true },
      { id: crypto.randomUUID(), name: 'snap peas', category: 'produce', checked: false },
      { id: crypto.randomUUID(), name: 'avocado (x3)', category: 'produce', checked: false },
      { id: crypto.randomUUID(), name: 'tomatoes (x4)', category: 'produce', checked: false },
      { id: crypto.randomUUID(), name: 'sourdough bread', category: 'bakery', checked: false },
      { id: crypto.randomUUID(), name: 'spaghetti (400g)', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'crushed tomatoes (2 cans)', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'soy sauce', category: 'sundries', checked: false },
      { id: crypto.randomUUID(), name: 'sesame oil', category: 'sundries', checked: false },
      { id: crypto.randomUUID(), name: 'taco seasoning', category: 'sundries', checked: false },
      { id: crypto.randomUUID(), name: 'corn tortillas (8)', category: 'sundries', checked: false },
      { id: crypto.randomUUID(), name: 'parmesan (block)', category: 'dairy', checked: false },
      { id: crypto.randomUUID(), name: 'shredded cheddar', category: 'dairy', checked: false },
      { id: crypto.randomUUID(), name: 'eggs (dozen)', category: 'dairy', checked: true },
    ];
    await createEntry(deps, 'Weekly grocery run — meal prep for the week', 'Shopping List', {
      items: sl1Items,
      notes: 'Check pantry for olive oil and garlic before buying. Get extra limes.',
      linkedRecipeIds: [recipe1, recipe2, recipe3, recipe4],
    }); count++;

    // Completed list — all checked
    const sl2Items = [
      { id: crypto.randomUUID(), name: 'greek yogurt (x2)', category: 'dairy', checked: true },
      { id: crypto.randomUUID(), name: 'almond milk (1L)', category: 'dairy', checked: true },
      { id: crypto.randomUUID(), name: 'oats (1kg)', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'blueberries', category: 'produce', checked: true },
      { id: crypto.randomUUID(), name: 'bananas (bunch)', category: 'produce', checked: true },
      { id: crypto.randomUUID(), name: 'protein powder', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'almonds (200g)', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'honey', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'walnuts (150g)', category: 'sundries', checked: true },
      { id: crypto.randomUUID(), name: 'chia seeds', category: 'sundries', checked: true },
    ];
    await createEntry(deps, 'Breakfast staples restock', 'Shopping List', {
      items: sl2Items,
      notes: 'All done! Regular weekly restock.',
      linkedRecipeIds: [],
    }); count++;

    onProgress?.('Creating menu plan...');

    // ── Menu Plan (current week) ──
    const r1Title = 'Chicken Stir-Fry with Vegetables';
    const r2Title = 'Classic Pasta Marinara';
    const r3Title = 'Avocado Toast with Poached Eggs';
    const r4Title = 'Beef Tacos with Pico de Gallo';
    await createEntry(deps, `Menu: week of ${weekStart}`, 'Menu Plan', {
      weekStart,
      days: {
        [dayStr(0)]: { // Monday
          breakfast: { mealName: r3Title, recipeId: recipe3, recipeName: r3Title },
          lunch:     { mealName: 'Leftover stir-fry', recipeId: null, recipeName: '' },
          dinner:    { mealName: r1Title, recipeId: recipe1, recipeName: r1Title },
          snack:     { mealName: 'Almonds and banana', recipeId: null, recipeName: '' },
        },
        [dayStr(1)]: { // Tuesday
          breakfast: { mealName: 'Oatmeal with blueberries', recipeId: null, recipeName: '' },
          lunch:     { mealName: r2Title, recipeId: recipe2, recipeName: r2Title },
          dinner:    { mealName: r4Title, recipeId: recipe4, recipeName: r4Title },
          snack:     { mealName: 'Greek yogurt', recipeId: null, recipeName: '' },
        },
        [dayStr(2)]: { // Wednesday
          breakfast: { mealName: r3Title, recipeId: recipe3, recipeName: r3Title },
          lunch:     { mealName: 'Taco leftovers', recipeId: null, recipeName: '' },
          dinner:    { mealName: r2Title, recipeId: recipe2, recipeName: r2Title },
          snack:     { mealName: 'Apple and peanut butter', recipeId: null, recipeName: '' },
        },
        [dayStr(3)]: { // Thursday
          breakfast: { mealName: 'Smoothie bowl', recipeId: null, recipeName: '' },
          lunch:     { mealName: r1Title, recipeId: recipe1, recipeName: r1Title },
          dinner:    { mealName: 'Grilled salmon with veg', recipeId: null, recipeName: '' },
          snack:     { mealName: '', recipeId: null, recipeName: '' },
        },
        [dayStr(4)]: { // Friday
          breakfast: { mealName: r3Title, recipeId: recipe3, recipeName: r3Title },
          lunch:     { mealName: 'Caesar salad', recipeId: null, recipeName: '' },
          dinner:    { mealName: r4Title, recipeId: recipe4, recipeName: r4Title },
          snack:     { mealName: 'Hummus and veggies', recipeId: null, recipeName: '' },
        },
        [dayStr(5)]: { // Saturday
          breakfast: { mealName: 'Pancakes with maple syrup', recipeId: null, recipeName: '' },
          lunch:     { mealName: r2Title, recipeId: recipe2, recipeName: r2Title },
          dinner:    { mealName: 'BBQ ribs and coleslaw', recipeId: null, recipeName: '' },
          snack:     { mealName: 'Fruit salad', recipeId: null, recipeName: '' },
        },
        [dayStr(6)]: { // Sunday
          breakfast: { mealName: 'Full English breakfast', recipeId: null, recipeName: '' },
          lunch:     { mealName: 'Roast chicken and potatoes', recipeId: null, recipeName: '' },
          dinner:    { mealName: r1Title, recipeId: recipe1, recipeName: r1Title },
          snack:     { mealName: 'Cheese and crackers', recipeId: null, recipeName: '' },
        },
      },
    }); count++;

    onProgress?.('Creating plain entry...');

    // Plain entry (no topic)
    await createEntry(deps, 'Just a regular journal entry — today was productive. Got a lot done on the rebuild, the weather was nice, and I cooked a great dinner. Sometimes the ordinary days are the best ones.', null); count++;

    onProgress?.('Creating journal entries...');
    count += await seedJournal(deps);

    onProgress?.('Done! All test data created.');
    return `Success — ${count} test entries created across all topic types.`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.(`Error: ${msg}`);
    return `Failed: ${msg}`;
  }
}

/* ── Planning: every status on every board ── */

async function seedPlanning(deps: SeedDeps): Promise<number> {
  let n = 0;
  const d = dayFromToday;
  const goal = async (name: string, goalType: string, goalStatus: string, targetDate: string, notes = '') => {
    n++;
    return createEntry(deps, name, 'Goal', { goalObjective: name, goalType, goalStatus, targetDate, notes });
  };
  const milestone = async (name: string, parentGoalId: number, milestoneStatus: string, targetDate: string) => {
    n++;
    return createEntry(deps, name, 'Milestone', {
      milestoneObjective: name, milestoneStatus, targetDate, isCompleted: milestoneStatus === 'completed', parentGoalId,
    });
  };
  const task = async (name: string, status: 'todo' | 'in_progress' | 'done', priority: string, deadline: string,
    parentGoalId: number | null = null, parentMilestoneId: number | null = null, notes = '') => {
    n++;
    return createEntry(deps, name, 'Task', {
      taskDescription: name, isInProgress: status === 'in_progress', isCompleted: status === 'done',
      isAutoMigrating: status !== 'done', parentGoalId, parentMilestoneId, deadline, priority, notes,
    });
  };

  // Goals: New, Planned, In progress, Paused, Achieved
  const ship = await goal('Ship the Chronicles rebuild', 'long_term', 'in_progress', d(60), 'Phase 1 parity, then the beta.');
  const ts = await goal('Learn TypeScript deeply', 'short_term', 'planned', d(30), 'Generics, conditional and mapped types.');
  const run = await goal('Run a half marathon', 'long_term', 'new', d(120));
  const spanish = await goal('Conversational Spanish', 'long_term', 'paused', d(200), 'Paused while the beta ships.');
  const home = await goal('Set up the home office', 'short_term', 'completed', d(-10));

  // Milestones: Not started, Planned, In progress, Completed
  const foundation = await milestone('Phase 1 foundation: auth, entries, topics, search', ship, 'completed', d(-14));
  const beta = await milestone('Private beta with 30 testers', ship, 'in_progress', d(21));
  const ci = await milestone('CI/CD pipeline and deploys', ship, 'planned', d(35));
  const generics = await milestone('Finish the generics chapter', ts, 'in_progress', d(7));
  const tenK = await milestone('Run 10K without stopping', run, 'not_started', d(45));
  const desk = await milestone('Desk, chair and lighting', home, 'completed', d(-12));

  // Tasks (linked): To do, In progress, Done — every priority
  await task('Write encryption unit tests for shared/crypto', 'in_progress', 'high', d(2), ship, foundation);
  await task('Port the TipTap editor with its full toolbar', 'done', 'medium', d(-15), ship, foundation);
  await task('Review the auth routes PR', 'done', 'high', d(-16), ship, foundation);
  await task('Invite the first ten testers', 'in_progress', 'urgent', d(0), ship, beta, 'Send the welcome email with the sign-up link.');
  await task('Write the beta FAQ', 'todo', 'medium', d(3), ship, beta);
  await task('Set up the feedback channel', 'todo', 'low', d(5), ship, beta);
  await task('Fix the iPad keyboard overlap', 'todo', 'urgent', d(-1), ship, beta, 'Overdue: testers hit it on day one.');
  await task('Add the GitHub Actions workflow', 'todo', 'high', d(10), ship, ci);
  await task('Staging environment on Render', 'todo', 'medium', d(14), ship, ci);
  await task('Exercises 1–20 on conditional types', 'in_progress', 'medium', d(4), ts, generics);
  await task('Read the mapped types chapter', 'done', 'low', d(-3), ts, generics);
  await task('Buy proper running shoes', 'todo', 'medium', d(6), run, tenK);
  await task('Three easy 3K runs this week', 'in_progress', 'low', d(5), run, tenK);
  await task('Assemble the desk', 'done', 'none', d(-12), home, desk);
  await task('Book a Spanish tutor', 'todo', 'low', d(30), spanish, null);

  // Todos (no goal or milestone)
  await task('Renew car registration', 'todo', 'urgent', d(-2), null, null, 'Overdue.');
  await task('Call the dentist to reschedule', 'todo', 'high', d(0));
  await task('Pick up the dry cleaning', 'todo', 'low', d(1));
  await task('Pay the electricity bill', 'done', 'high', d(-4));
  await task('Order a birthday gift for Mum', 'in_progress', 'medium', d(3));
  await task('Clear out the garage', 'todo', 'none', d(14));
  await task('Back up the laptop', 'done', 'medium', d(-1));
  await task('Return the library books', 'in_progress', 'low', d(2));
  await task('Plan the weekend hike', 'todo', 'medium', '');

  return n;
}

/* ── Medication doses: the last two weeks ── */

async function seedDoses(ids: { lisinopril: number; metformin: number; vitD: number; melatonin: number; ibuprofen: number }): Promise<number> {
  let n = 0;
  const schedule: [number, string][] = [
    [ids.lisinopril, '08:00'], [ids.metformin, '08:00'], [ids.metformin, '20:00'], [ids.vitD, '08:00'], [ids.melatonin, '21:30'],
  ];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  for (let offset = -14; offset <= 0; offset++) {
    const date = dayFromToday(offset);
    for (const [med, time] of schedule) {
      const [h, m] = time.split(':').map(Number);
      if (offset === 0 && h * 60 + m > nowMin) continue; // later today: still to take
      // Mostly taken a few minutes late; now and then skipped or forgotten
      const roll = (offset * 7 + med + h) % 13;
      if (roll === 0) continue;
      const status = roll === 5 ? 'skipped' : 'taken';
      const late = (roll * 3) % 25;
      const takenAt = time12(`${String(h + Math.floor((m + late) / 60)).padStart(2, '0')}:${String((m + late) % 60).padStart(2, '0')}`);
      await dosesApi.log({ medicationPostId: med, scheduledTime: time, date, status, takenAt: status === 'taken' ? takenAt : null });
      n++;
    }
  }
  // As-needed ibuprofen: one on headache days, two on the bad ones
  for (const [offset, times] of [[-3, ['10:45', '14:20']], [-6, ['09:30']], [-9, ['15:10', '14:15']], [-12, ['11:20']]] as const) {
    for (const time of times) {
      await dosesApi.logAsNeeded({ medicationPostId: ids.ibuprofen, date: dayFromToday(offset), time });
      n++;
    }
  }
  return n;
}

/* ── A month for Reports (the daily inventory report) ──
   Patterned so every section has something real to show: a dairy latte
   followed by bloating and red wine by a headache the next morning (Possible
   triggers), an iron supplement on the bloating days and an antihistamine kept
   off the cold days (Medication), magnesium every day (nothing to compare),
   fatigue mostly on days without exercise (Exercise), and a cold — cough,
   trouble swallowing, runny nose, congestion — plus back pain with itching
   that land on the same days (Symptoms at a glance). Breakfast, lunch and
   dinner come and go so the meal questions have both answers. */

export interface ReportMonthPlan {
  meals: { day: string; time: string; name: string; mealType: string; ingredients: string; healthiness: string }[];
  symptoms: { day: string; time: string; name: string; severity: number }[];
  exercise: { day: string; time: string; type: string; minutes: number; intensity: string; text: string }[];
}

/** `days` oldest first. Meals stop at `mealsUntil` and exercise at `exerciseUntil` (the hand-written week takes over) */
export function reportMonthPlan(days: string[], { mealsUntil, exerciseUntil }: { mealsUntil: string; exerciseUntil: string }): ReportMonthPlan {
  const plan: ReportMonthPlan = { meals: [], symptoms: [], exercise: [] };
  const next = (i: number) => days[i + 1];
  const meal = (day: string, time: string, name: string, mealType: string, ingredients: string, healthiness: number) =>
    plan.meals.push({ day, time, name, mealType, ingredients, healthiness: String(healthiness) });
  const symptom = (day: string | undefined, time: string, name: string, severity: number) => {
    if (day) plan.symptoms.push({ day, time, name, severity });
  };
  const COLD = [8, 9, 10, 11, 12];
  const EXERCISE: [string, number, string, string][] = [
    ['walking', 30, 'low', 'Evening walk'], ['yoga', 40, 'low', 'Yoga flow'], ['strength', 45, 'high', 'Strength session'],
  ];

  days.forEach((day, i) => {
    const latte = i % 4 === 0;
    const wine = i % 6 === 2;
    const exercised = [1, 3, 5].includes(i % 7);

    if (day <= mealsUntil) {
      if (i % 5 !== 1 && i % 5 !== 3) meal(day, '07:45', ['Oatmeal with berries', 'Toast and eggs', 'Yogurt and granola'][i % 3], 'breakfast', ['oats, blueberries', 'sourdough, eggs', 'greek yogurt, granola'][i % 3], 4);
      if (latte) meal(day, '08:30', 'Dairy latte', 'snack', 'milk, espresso', 2);
      if (i % 3 === 0) meal(day, '12:30', i % 2 ? 'Chicken salad' : 'Rice bowl', 'lunch', i % 2 ? 'chicken, greens' : 'rice, tofu, vegetables', 4);
      if (i % 10 < 7) meal(day, '19:00', ['Salmon and rice', 'Pasta', 'Stir fry', 'Tacos'][i % 4], 'dinner', '', [4, 2, 4, 3][i % 4]);
      if (wine) meal(day, '19:30', 'Red wine', 'snack', '', 1);
      // Supplements logged as Meals rows (Medication: Iron supplement → more bloating; Antihistamine → less runny nose)
      if (latte || i % 7 === 3) meal(day, '08:00', 'Iron supplement', 'supplement', '', 0);
      if (!COLD.includes(i) && i % 5 !== 2) meal(day, '08:05', 'Antihistamine', 'supplement', '', 0);
      meal(day, '21:00', 'Magnesium', 'supplement', '', 0);
    }
    if (day <= exerciseUntil && exercised) {
      const [type, minutes, intensity, text] = EXERCISE[i % 3];
      plan.exercise.push({ day, time: '18:00', type, minutes, intensity, text });
    }

    if (latte) symptom(day, '11:00', 'Bloating', 4 + (i % 2));
    if (wine) symptom(next(i), '09:00', 'Headache', 6);
    if (i % 3 === 1 && !exercised) symptom(day, '15:00', 'Fatigue', 3 + (i % 4));
    if (COLD.includes(i)) {
      symptom(day, '08:30', 'Cough', 5);
      symptom(day, '08:30', 'Trouble swallowing', 4);
      symptom(day, '08:30', 'Runny nose', 3);
    }
    if (COLD.includes(i - 1)) symptom(day, '10:00', 'Congestion', 4);
    if (i % 9 === 4) { symptom(day, '14:00', 'Back pain', 5); symptom(day, '14:00', 'Itching', 3); }
    if (i % 11 === 3) symptom(day, '16:00', 'Dizziness', 7);
  });
  return plan;
}

async function seedReportMonth(deps: SeedDeps): Promise<number> {
  const days: string[] = [];
  for (let offset = -29; offset <= -1; offset++) days.push(dayFromToday(offset));
  const plan = reportMonthPlan(days, { mealsUntil: dayFromToday(-4), exerciseUntil: dayFromToday(-7) });
  let n = 0;
  for (const m of plan.meals) {
    await createEntry(deps, m.name, 'Meals', {
      mealDescription: m.name, mealType: m.mealType, consumedDate: m.day, consumedTime: m.time, ingredients: m.ingredients,
      ...(m.mealType === 'supplement' ? {} : { healthiness: m.healthiness }), notes: '',
    }, { day: m.day }); n++;
  }
  for (const x of plan.exercise) {
    await createEntry(deps, x.text, 'Exercise', {
      exerciseType: x.type, duration: String(x.minutes), intensity: x.intensity, distance: '', distanceUnit: 'km', performedDate: x.day, performedTime: x.time, notes: '',
    }, { day: x.day }); n++;
  }
  // One entry per symptom per day and time ("Cough, Trouble swallowing, Runny nose" as chips)
  const byTime = new Map<string, { day: string; time: string; names: string[]; severity: number }>();
  for (const sy of plan.symptoms) {
    const k = `${sy.day} ${sy.time}`;
    const cur = byTime.get(k) ?? { day: sy.day, time: sy.time, names: [], severity: 0 };
    cur.names.push(sy.name);
    cur.severity = Math.max(cur.severity, sy.severity);
    byTime.set(k, cur);
  }
  for (const g of byTime.values()) {
    const name = g.names.join(', ');
    await createEntry(deps, name, 'Symptom', {
      symptomName: name, severity: g.severity, occurredDate: g.day, occurredTime: g.time, duration: '60', notes: '',
    }, { day: g.day }); n++;
  }
  return n;
}

/* ── Wellness check-ins: about a month, a few days missed ── */

export interface SeedWellness {
  waterGlasses: number; sleepHours: number; sleepQuality: number; moodScore: number;
}

/**
 * Check-ins that behave like real days, so Reports' insights read true:
 * symptom days are mostly the dehydrated ones (3–4 glasses, else 6–8), exercise days
 * sleep better, sleep hours follow sleep quality, and mood follows the night
 * before (good sleep → 4–5, poor → 2), a point lower on a day with symptoms.
 * `days` oldest first (YYYY-MM-DD); returns the values by day.
 */
export function realisticWellness(days: string[], symptomDays: Set<string>, exerciseDays: Set<string>): Map<string, SeedWellness> {
  const prevDay = (d: string) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() - 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const n = (d: string) => Number(d.replace(/-/g, '')) % 97; // a steady per-day number
  const quality = (d: string) => (exerciseDays.has(d) ? 4 + (n(d) % 2) : [2, 3, 4, 2, 3][n(d) % 5]);
  const HOURS: Record<number, number> = { 1: 4.5, 2: 5.5, 3: 6.5, 4: 7.5, 5: 8 };
  const out = new Map<string, SeedWellness>();
  for (const d of days) {
    const q = quality(d);
    const before = quality(prevDay(d));
    let mood = before >= 4 ? 4 + (n(d) % 2) : before === 3 ? 3 : 2;
    if (symptomDays.has(d)) mood = Math.max(1, mood - 1);
    out.set(d, {
      sleepQuality: q, sleepHours: HOURS[q],
      moodScore: mood,
      // Mostly dehydrated on symptom days; now and then not (real life is messy)
      waterGlasses: symptomDays.has(d) ? (n(d) % 4 === 0 ? 6 : 3 + (n(d) % 2)) : 6 + (n(d) % 3),
    });
  }
  return out;
}

/** "Your day" answers that follow the check-in: social time and the work day track mood, waking in the night follows a poor night */
export function yourDay(date: string, v: SeedWellness) {
  const n = Number(date.replace(/-/g, '')) % 7;
  return {
    social: Math.max(1, Math.min(5, v.moodScore + (n % 3) - 1)),
    workDay: Math.max(1, Math.min(5, v.moodScore + (n === 0 ? -1 : 0))),
    procrastination: Math.max(1, Math.min(5, 6 - v.moodScore - (n % 2))),
    // Stress runs opposite to mood, a notch higher on short nights
    stress: Math.max(1, Math.min(5, 6 - v.moodScore + (v.sleepHours < 6 ? 1 : 0) - (n % 3 === 0 ? 1 : 0))),
    wokeAtNight: v.sleepQuality <= 2,
    // Dreams remembered more after a good night's sleep
    dreamed: v.sleepQuality >= 4 ? n !== 3 : n % 3 === 0,
    eating: n === 4 ? 'too_much' : n === 6 ? 'too_little' : 'just_right',
  };
}

/** The days with symptoms and with exercise, from what's in the store */
function activityDays(topics: TopicInfo[]): { symptomDays: Set<string>; exerciseDays: Set<string> } {
  const entries = useEntriesStore.getState().decryptedEntries;
  const idOf = (name: string) => findTopic(topics, name);
  const daysFor = (topicId: number | null, field: string) => new Set(entries
    .filter(e => topicId != null && (e.metadata as Record<string, unknown>)?._taxonomyId === topicId)
    .map(e => String(((e.metadata as Record<string, unknown>)._customFields as Record<string, unknown> | undefined)?.[field] ?? ''))
    .filter(Boolean));
  return { symptomDays: daysFor(idOf('Symptom'), 'occurredDate'), exerciseDays: daysFor(idOf('Exercise'), 'performedDate') };
}

async function seedWellness(deps: SeedDeps): Promise<number> {
  await ensureTopic(deps, 'Wellness', 'heart');
  const { symptomDays, exerciseDays } = activityDays(deps.topics);
  const days: string[] = [];
  for (let offset = -30; offset <= 0; offset++) if (![-27, -19, -8].includes(offset)) days.push(dayFromToday(offset)); // a few days forgotten
  const values = realisticWellness(days, symptomDays, exerciseDays);
  let n = 0;
  for (const date of days) {
    const offset = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${dayFromToday(0)}T12:00:00`).getTime()) / 86400000);
    const v = values.get(date)!;
    const periodDay = offset >= -24 && offset <= -20;
    const flowIntensity = periodDay ? (['spotting', 'medium', 'heavy', 'medium', 'light'] as const)[offset + 24] : '';
    const text = [`${v.waterGlasses}/8 glasses`, `Mood ${v.moodScore}/5`, `${v.sleepHours}h sleep`].join(' · ');
    await createEntry(deps, text, 'Wellness', {
      date, ...v, ...yourDay(date, v), waterGoal: 8, periodToday: periodDay, flowIntensity,
    }, { day: date, widgetType: 'wellness-checkin' });
    n++;
  }
  return n;
}

/* ── Priorities: today's list plus a few past ones ── */

async function seedPriorities(deps: SeedDeps): Promise<number> {
  await ensureTopic(deps, 'Priorities', 'flag');
  const lists: [number, [string, boolean][]][] = [
    [-9, [['Finish the onboarding emails', true], ['Grocery run', true], ['Call Grandma', true]]],
    [-6, [['Draft the beta FAQ', true], ['30-minute run', false], ['Tidy the inbox', true], ['Book the vet', true]]],
    [-3, [['Fix the iPad keyboard bug', false], ['Meal prep for the week', true], ['Stretch before bed', true]]],
    [-1, [['Invite the first testers', true], ['Pay the electricity bill', true], ['Laundry', false]]],
    [0, [['Invite the next ten testers', false], ['Call the dentist', false], ['Walk at lunch', true], ['Read one chapter', false]]],
  ];
  let n = 0;
  for (const [offset, items] of lists) {
    const day = dayFromToday(offset);
    await createEntry(deps, `Priorities: ${usDate(day)}`, 'Priorities', {
      priorities: items.map(([text, done]) => ({ id: crypto.randomUUID(), text, done })),
    }, { day });
    n++;
  }
  return n;
}

/* ── Journal: everyday writing beyond health and finance ── */

/** Entries for the journal itself (topic, rich text); the newest last so it tops the list */
export const SEED_JOURNAL: { topic: string; html: string }[] = [
  { topic: 'Research', html: '<p>Reading about sleep and screens. The blue-light story is weaker than I thought, and the bigger effect seems to be staying up later because the phone is interesting.</p><p>Trying a hard stop at 10pm for two weeks and writing down how mornings feel.</p>' },
  { topic: 'Music', html: '<p>Nils Frahm’s <em>Says</em> has been on repeat all week. Eight minutes that build so slowly you barely notice, then it’s everywhere. Perfect for focused mornings.</p>' },
  { topic: 'TV/Movies', html: '<p>Watched <em>Past Lives</em> with Ari. Quiet, patient and sad in the best way. We sat in the car outside for ten minutes afterwards without saying anything.</p>' },
  { topic: 'Quote', html: '<p>“You do not rise to the level of your goals. You fall to the level of your systems.” — James Clear</p>' },
  { topic: 'Journal', html: '<p>Gratitude, quickly. The bus driver who waited when he saw me running. Fresh sourdough from the market. A clear night and enough stars to count.</p>' },
  { topic: 'Books', html: '<p>Finished <em>Tomorrow, and Tomorrow, and Tomorrow</em> by Gabrielle Zevin. The middle section in the hospital wrecked me. It’s really a book about friendship that happens to be about games.</p><p>Four stars, and I already want to reread the ending.</p>' },
  { topic: 'Idea', html: '<p>A tiny <strong>done list</strong> at the end of each day. Three things I actually finished, instead of everything I didn’t. It could sit on the dashboard next to priorities.</p>' },
  { topic: 'Journal', html: '<p>Rough afternoon. The demo crashed twice in front of the whole team and I could feel my face going red. Afterwards Sam said nobody noticed the second time. They definitely noticed.</p><p>A walk around the block helped, and so did a big glass of water and writing this down. Tomorrow I’ll add a smoke test before every demo.</p>' },
  { topic: 'Journal', html: '<p>Slow Sunday. Coffee on the porch before anyone else was up, then a long walk along the river with Juno. The maples are finally turning.</p><p>Things I want to remember from this week.</p><ul><li><p>Maya’s laugh when the pancake flipped onto the floor</p></li><li><p>Finishing the beta FAQ a day early</p></li><li><p>Calling Grandma just to talk</p></li></ul><p>Next week, fewer late nights. The phone stays in the kitchen after ten.</p>' },
];

async function seedJournal(deps: SeedDeps): Promise<number> {
  await ensureTopic(deps, 'Journal', 'book');
  for (const { topic, html } of SEED_JOURNAL) await createEntry(deps, '', topic, {}, { html });
  return SEED_JOURNAL.length;
}
