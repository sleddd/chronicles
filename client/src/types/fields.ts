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
}

export interface GoalFieldValues {
  /** Primary label — shown when the entry has no text content. */
  goalObjective?: string;
  goalType: 'short_term' | 'long_term';
  goalStatus: 'new' | 'planned' | 'in_progress' | 'completed';
  targetDate: string;
}

export interface MilestoneFieldValues {
  /** Primary label — shown when the entry has no text content. */
  milestoneObjective?: string;
  milestoneStatus: 'not_started' | 'in_progress' | 'completed';
  targetDate: string;
  isCompleted: boolean;
  parentGoalId: number | null;
}

export interface FoodFieldValues {
  /** Primary label — shown when the entry has no text content. */
  mealDescription?: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'supplement';
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
  notes: string;
}

export interface MedicationFieldValues {
  dosage: string;
  frequency: 'once_daily' | 'twice_daily' | 'three_daily' | 'as_needed' | 'custom';
  scheduleTimes: string[];
  isActive: boolean;
  notes: string;
}

export interface SymptomFieldValues {
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
  sleepQuality: number; // 1–5, 0 = unset
  periodToday?: boolean;
  flowIntensity?: string;
}
