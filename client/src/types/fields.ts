/* ── Custom field value types for entry types ── */

export type ShoppingCategory =
  | 'produce' | 'meat' | 'dairy' | 'bakery' | 'frozen'
  | 'beverages' | 'sundries' | 'personal_care' | 'household' | 'other';

export interface ShoppingItem {
  id: string;
  name: string;
  category: ShoppingCategory;
  checked: boolean;
}

export interface ShoppingListFieldValues {
  items: ShoppingItem[];
  notes: string;
  linkedRecipeIds: number[];
}

export interface RecipeIngredient {
  id: string;
  amount: string;
  name: string;
  /** Cook-along check-off in the recipe view (persisted) */
  checked?: boolean;
}

/** One numbered method step — bold lead-in title + body text */
export interface RecipeStep {
  id: string;
  title: string;
  text: string;
}

export type RecipeCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

export interface RecipeFieldValues {
  /** Primary label — the recipe's display title. */
  recipeName?: string;
  /** Italic one-liner under the title. */
  description?: string;
  /** Uppercase label above the title (BREAKFAST, …). */
  category?: RecipeCategory | '';
  servings: string;
  prepTime: string;
  cookTime: string;
  calories?: string;
  difficulty?: RecipeDifficulty | '';
  cuisine: string;
  ingredients: RecipeIngredient[];
  /** Structured method steps; `instructions` free text is the legacy fallback. */
  steps?: RecipeStep[];
  instructions: string;
  linkedShoppingListIds: number[];
}

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface MenuMealSlot {
  mealName: string;
  recipeId: number | null;
  recipeName: string;
}

export interface MenuPlanDay {
  breakfast: MenuMealSlot;
  lunch: MenuMealSlot;
  dinner: MenuMealSlot;
  snack: MenuMealSlot;
}

export interface MenuPlanFieldValues {
  weekStart: string;
  days: Record<string, MenuPlanDay>;
}

export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low' | 'none';

export interface TaskFieldValues {
  /** Primary label — shown when the entry has no text content. */
  taskDescription?: string;
  isInProgress: boolean;
  isCompleted: boolean;
  isAutoMigrating: boolean;
  parentGoalId: number | null;
  parentMilestoneId: number | null;
  deadline: string;
  priority: TaskPriority;
  notes?: string;
}

export interface GoalFieldValues {
  /** Primary label — shown when the entry has no text content. */
  goalObjective?: string;
  goalType: 'short_term' | 'long_term';
  goalStatus: 'new' | 'planned' | 'in_progress' | 'paused' | 'completed';
  targetDate: string;
  notes?: string;
}

export interface MilestoneFieldValues {
  /** Primary label — shown when the entry has no text content. */
  milestoneObjective?: string;
  milestoneStatus: 'not_started' | 'in_progress' | 'completed';
  targetDate: string;
  isCompleted: boolean;
  parentGoalId: number | null;
  notes?: string;
}

export interface FoodFieldValues {
  /** Primary label — shown when the entry has no text content. */
  mealDescription?: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'supplement' | 'medication';
  consumedDate: string;
  consumedTime: string;
  ingredients: string;
  calories: string;
  /** 'ai' when the calories came from the AI assistant, 'manual' when typed */
  caloriesSource?: 'ai' | 'manual';
  /** Inputs the AI estimate was based on — a change triggers a re-estimate */
  calorieBasis?: string;
  /** Micronutrients (see types/nutrition.ts) — strings like every other field */
  iron?: string;
  vitaminD?: string;
  vitaminB12?: string;
  vitaminC?: string;
  /** Per-nutrient origin: 'ai' estimates may be refreshed, 'manual' values never are */
  nutrientSource?: Partial<Record<string, 'ai' | 'manual'>>;
  /** Inputs the AI nutrient estimates were based on */
  nutritionBasis?: string;
  /** How healthy it was, "1"–"5" ('' = not rated) */
  healthiness?: string;
  notes: string;
}

export interface MedicationFieldValues {
  /** The medication's name — the entry's title (its text mirrors it) */
  medicationName?: string;
  dosage: string;
  frequency: 'once_daily' | 'twice_daily' | 'three_daily' | 'three_times_daily' | 'weekly' | 'as_needed' | 'custom';
  scheduleTimes: string[];
  isActive: boolean;
  notes: string;
}

export interface SymptomFieldValues {
  /** The symptom(s), the entry's name — "Flare day, Runny nose" */
  symptomName: string;
  severity: number;
  occurredDate: string;
  occurredTime: string;
  duration: string;
  notes: string;
}

export interface ExerciseFieldValues {
  exerciseType: string;
  duration: string;
  intensity: 'low' | 'medium' | 'high';
  distance: string;
  distanceUnit: 'miles' | 'km';
  calories: string;
  /** 'ai' when the calories burned came from the AI assistant, 'manual' when typed */
  caloriesSource?: 'ai' | 'manual';
  /** Inputs the AI estimate was based on — a change triggers a re-estimate */
  calorieBasis?: string;
  performedDate: string;
  performedTime: string;
  /** Training plan category this session counts toward */
  trainingCategory?: string;
  /** Set when the session was logged by ticking a routine */
  routineId?: number;
  /** The routine's exercises done in this session (RoutineItem ids) */
  routineItemsDone?: string[];
  notes: string;
}

/** One exercise inside a routine — "Sun salutation" · "5 min" or "3 × 10" */
export interface RoutineItem {
  id: string;
  name: string;
  /** Free text: "5 min", "3 × 10", "30 sec each side" */
  amount: string;
}

export interface RoutineFieldValues {
  /** The routine's name — the entry's title (its text mirrors it) */
  routineName?: string;
  /** Activity the logged sessions are saved as (EXERCISE_TYPES) */
  exerciseType: string;
  /** Minutes one full session takes */
  duration: string;
  items: RoutineItem[];
  /** Days it runs, 0 = Sunday … 6 = Saturday; empty = every day */
  days: number[];
  scheduleTimes: string[];
  isActive: boolean;
  /** Training plan category its sessions count toward (optional) */
  trainingCategory?: string;
  notes: string;
}

/** An activity category in a training plan — "Aerobic", "Core stability" */
export interface TrainingCategory {
  id: string;
  name: string;
  /** Exercise activities that count here when a session names no category */
  exerciseTypes: string[];
}

/** One phase of a plan: its length and the hours to put into each category
 *  across the whole phase */
export interface TrainingPhase {
  id: string;
  name: string;
  weeks: string;
  /** Hours for the whole phase, by TrainingCategory id */
  targets: Record<string, string>;
}

export interface TrainingPlanFieldValues {
  /** The plan's name — the entry's title ("Mt Hood") */
  planName?: string;
  /** The first day of phase 1 */
  startDate: string;
  /** The climb / race / trip the plan builds toward (optional) */
  eventDate: string;
  categories: TrainingCategory[];
  phases: TrainingPhase[];
  isActive: boolean;
  notes: string;
}

export interface EventFieldValues {
  /** Primary label — shown when the entry has no text content. */
  eventName?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  address: string;
  phone: string;
  notes: string;
  /** Calendar sync: opt this entry out of Google/Apple calendar sync. */
  noCalendarSync?: boolean;
  /** Calendar sync: event title shown in the external calendar (falls back to entry content). */
  calendarTitle?: string;
  /** All-day: no start/end times */
  allDay?: boolean;
  /** Repeats: '' (never) | daily | weekly | monthly | yearly (utils/recurrence) */
  repeat?: '' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Every N days / weeks / months / years, "1" when blank */
  repeatEvery?: string;
  /** Weekly: the weekdays it lands on, 0 = Sunday */
  repeatDays?: number[];
  /** Last day it repeats on, '' = no end */
  repeatUntil?: string;
}

export interface MeetingFieldValues {
  /** Primary label — shown when the entry has no text content. */
  meetingName?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  meetingTopic: string;
  attendees: string;
  location: string;
  address: string;
  phone: string;
  notes: string;
  /** Calendar sync: opt this entry out of Google/Apple calendar sync. */
  noCalendarSync?: boolean;
  /** All-day: no start/end times */
  allDay?: boolean;
  /** Repeats: '' (never) | daily | weekly | monthly | yearly (utils/recurrence) */
  repeat?: '' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Every N days / weeks / months / years, "1" when blank */
  repeatEvery?: string;
  /** Weekly: the weekdays it lands on, 0 = Sunday */
  repeatDays?: number[];
  /** Last day it repeats on, '' = no end */
  repeatUntil?: string;
}

export interface AllergyFieldValues {
  allergen: string;
  severity: number;
  reaction: string;
  occurredDate: string;
  occurredTime: string;
  notes: string;
}

export interface WellnessFieldValues {
  date: string;        // YYYY-MM-DD — one entry per day, updated in-place
  waterGlasses: number;
  waterGoal: number;   // default 8
  moodScore: number;   // 1–5, 0 = unset
  sleepHours: number;  // 0–12, 0.5 increments, 0 = unset
  sleepQuality: number; // 1–5, 0 = unset — "How rested did you feel when you woke up?"
  periodToday?: boolean;
  flowIntensity?: string;
  /* The rest of the daily inventory (utils/dailyInventory) — unset = not answered */
  /** Woke up during the night */
  wokeAtNight?: boolean | null;
  /** Remembers dreaming last night */
  dreamed?: boolean | null;
  /** Ate too much or too little overall */
  eating?: 'too_little' | 'just_right' | 'too_much' | '';
  /** Quality of the work day, 1–5, 0 = unset */
  workDay?: number;
  /** Quality of social activity / interactions, 1–5, 0 = unset */
  social?: number;
  /** How much you procrastinated, 1 (not at all) – 5 (all day), 0 = unset */
  procrastination?: number;
  /** Stress level, 1 (very low) – 5 (very high), 0 = unset */
  stress?: number;
}
