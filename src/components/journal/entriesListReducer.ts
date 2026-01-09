// Entries List State Management with useReducer
// Replaces 60+ useState hooks with centralized, type-safe state management
//
// SECURITY NOTE: This reducer contains sensitive decrypted data
// All fields below are considered sensitive and must be cleared on:
// - Component unmount
// - User logout
// - Inactivity timeout
//
// Sensitive fields include:
// - decryptedEntries (Record<id, plaintext content>)
// - decryptedTopics (Record<id, plaintext topic name>)
// - taskFields (Map of decrypted task data)
// - quickEntry (user input)
// - All custom field quick entry data (task, goal, meeting, event, medication, etc.)
//
// Use CLEAR_DECRYPTED_DATA action to clear sensitive data safely.

import type {
  TaskFields,
  GoalFields,
  MeetingFields,
  EventFields,
  MedicationFields,
  ExerciseFields,
  FoodFields,
  SymptomFields,
} from '@/lib/hooks/useCustomFields';

interface TaskFieldsData {
  isCompleted: boolean;
  isAutoMigrating: boolean;
}

export type EntriesListState = {
  // Core data
  entries: Array<{
    id: string;
    encryptedContent: string;
    iv: string;
    topicId: string | null;
    customType: string | null;
    entryDate: string;
    custom_fields: Array<{
      id: string;
      entryId: string;
      encryptedData: string;
      iv: string;
    }> | null;
    favoriteId?: string;
    favoritedAt?: string;
  }>;
  topics: Array<{
    id: string;
    encryptedName: string;
    iv: string;
    color: string;
    icon: string | null;
  }>;
  decryptedEntries: Record<string, string>;
  decryptedTopics: Record<string, string>;
  taskFields: Map<string, TaskFieldsData>;
  favoriteIds: Set<string>;

  // View state
  filterTopicId: string | null;
  viewMode: 'date' | 'all' | 'favorites' | 'search';
  searchQuery: string;
  searchTopicId: string | null;
  isDatePickerExpanded: boolean;

  // Quick entry form
  quickEntry: string;
  quickEntryTopicId: string | null;
  showTopicDropdown: boolean;
  topicSearchQuery: string;

  // Quick entry custom fields - use types from useCustomFields
  task: TaskFields;
  goal: GoalFields;
  meeting: MeetingFields;
  event: EventFields;
  medication: MedicationFields;
  exercise: ExerciseFields;
  food: FoodFields;
  symptom: SymptomFields;
};

export type EntriesListAction =
  // Core data actions
  | { type: 'SET_ENTRIES'; payload: EntriesListState['entries'] }
  | { type: 'SET_TOPICS'; payload: EntriesListState['topics'] }
  | { type: 'SET_DECRYPTED_ENTRIES'; payload: Record<string, string> }
  | { type: 'SET_DECRYPTED_TOPICS'; payload: Record<string, string> }
  | { type: 'SET_TASK_FIELDS'; payload: Map<string, TaskFieldsData> }
  | { type: 'UPDATE_TASK_FIELD'; payload: { entryId: string; fields: TaskFieldsData } }
  | { type: 'SET_FAVORITE_IDS'; payload: Set<string> }

  // View state actions
  | { type: 'SET_FILTER_TOPIC_ID'; payload: string | null }
  | { type: 'SET_VIEW_MODE'; payload: EntriesListState['viewMode'] }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_TOPIC_ID'; payload: string | null }
  | { type: 'SET_DATE_PICKER_EXPANDED'; payload: boolean }

  // Quick entry form actions
  | { type: 'SET_QUICK_ENTRY'; payload: string }
  | { type: 'SET_QUICK_ENTRY_TOPIC_ID'; payload: string | null }
  | { type: 'SET_SHOW_TOPIC_DROPDOWN'; payload: boolean }
  | { type: 'SET_TOPIC_SEARCH_QUERY'; payload: string }

  // Quick entry custom field actions
  | { type: 'UPDATE_QF_TASK'; payload: Partial<EntriesListState['task']> }
  | { type: 'UPDATE_QF_GOAL'; payload: Partial<EntriesListState['goal']> }
  | { type: 'UPDATE_QF_MEETING'; payload: Partial<EntriesListState['meeting']> }
  | { type: 'UPDATE_QF_EVENT'; payload: Partial<EntriesListState['event']> }
  | { type: 'UPDATE_QF_MEDICATION'; payload: Partial<EntriesListState['medication']> }
  | { type: 'UPDATE_QF_EXERCISE'; payload: Partial<EntriesListState['exercise']> }
  | { type: 'UPDATE_QF_FOOD'; payload: Partial<EntriesListState['food']> }
  | { type: 'UPDATE_QF_SYMPTOM'; payload: Partial<EntriesListState['symptom']> }

  // Reset actions
  | { type: 'RESET_QUICK_ENTRY' }
  | { type: 'CLEAR_FILTER' }
  | { type: 'CLEAR_DECRYPTED_DATA' };

export const initialEntriesListState: EntriesListState = {
  // Core data
  entries: [],
  topics: [],
  decryptedEntries: {},
  decryptedTopics: {},
  taskFields: new Map(),
  favoriteIds: new Set(),

  // View state
  filterTopicId: null,
  viewMode: 'date',
  searchQuery: '',
  searchTopicId: null,
  isDatePickerExpanded: false,

  // Quick entry form
  quickEntry: '',
  quickEntryTopicId: null,
  showTopicDropdown: false,
  topicSearchQuery: '',

  // Quick entry custom fields - use defaults from useCustomFields
  task: {
    isCompleted: false,
    isAutoMigrating: true,
  },

  goal: {
    type: 'short_term',
    status: 'active',
    targetDate: '',
  },

  meeting: {
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    topic: '',
    attendees: '',
    notes: '',
  },

  event: {
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    notes: '',
  },

  medication: {
    dosage: '',
    frequency: 'once_daily',
    scheduleTimes: ['08:00'],
    isActive: true,
    notes: '',
  },

  exercise: {
    type: 'cardio',
    otherType: '',
    duration: '',
    intensity: 'medium',
    distance: '',
    distanceUnit: 'miles',
    calories: '',
    performedAt: '',
    notes: '',
  },

  food: {
    mealType: 'breakfast',
    consumedAt: '',
    ingredients: '',
    notes: '',
  },

  symptom: {
    severity: 5,
    occurredAt: '',
    duration: '',
    notes: '',
  },
};

export function entriesListReducer(
  state: EntriesListState,
  action: EntriesListAction
): EntriesListState {
  switch (action.type) {
    // Core data
    case 'SET_ENTRIES':
      return { ...state, entries: action.payload };

    case 'SET_TOPICS':
      return { ...state, topics: action.payload };

    case 'SET_DECRYPTED_ENTRIES':
      return { ...state, decryptedEntries: action.payload };

    case 'SET_DECRYPTED_TOPICS':
      return { ...state, decryptedTopics: action.payload };

    case 'SET_TASK_FIELDS':
      return { ...state, taskFields: action.payload };

    case 'UPDATE_TASK_FIELD': {
      const newTaskFields = new Map(state.taskFields);
      newTaskFields.set(action.payload.entryId, action.payload.fields);
      return { ...state, taskFields: newTaskFields };
    }

    case 'SET_FAVORITE_IDS':
      return { ...state, favoriteIds: action.payload };

    // View state
    case 'SET_FILTER_TOPIC_ID':
      return { ...state, filterTopicId: action.payload };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };

    case 'SET_SEARCH_TOPIC_ID':
      return { ...state, searchTopicId: action.payload };

    case 'SET_DATE_PICKER_EXPANDED':
      return { ...state, isDatePickerExpanded: action.payload };

    // Quick entry form
    case 'SET_QUICK_ENTRY':
      return { ...state, quickEntry: action.payload };

    case 'SET_QUICK_ENTRY_TOPIC_ID':
      return { ...state, quickEntryTopicId: action.payload };

    case 'SET_SHOW_TOPIC_DROPDOWN':
      return { ...state, showTopicDropdown: action.payload };

    case 'SET_TOPIC_SEARCH_QUERY':
      return { ...state, topicSearchQuery: action.payload };

    // Quick entry custom fields
    case 'UPDATE_QF_TASK':
      return { ...state, task: { ...state.task, ...action.payload } };

    case 'UPDATE_QF_GOAL':
      return { ...state, goal: { ...state.goal, ...action.payload } };

    case 'UPDATE_QF_MEETING':
      return { ...state, meeting: { ...state.meeting, ...action.payload } };

    case 'UPDATE_QF_EVENT':
      return { ...state, event: { ...state.event, ...action.payload } };

    case 'UPDATE_QF_MEDICATION':
      return { ...state, medication: { ...state.medication, ...action.payload } };

    case 'UPDATE_QF_EXERCISE':
      return { ...state, exercise: { ...state.exercise, ...action.payload } };

    case 'UPDATE_QF_FOOD':
      return { ...state, food: { ...state.food, ...action.payload } };

    case 'UPDATE_QF_SYMPTOM':
      return { ...state, symptom: { ...state.symptom, ...action.payload } };

    // Reset actions
    case 'RESET_QUICK_ENTRY':
      return {
        ...state,
        quickEntry: '',
        quickEntryTopicId: null,
        task: initialEntriesListState.task,
        goal: initialEntriesListState.goal,
        meeting: initialEntriesListState.meeting,
        event: initialEntriesListState.event,
        medication: initialEntriesListState.medication,
        exercise: initialEntriesListState.exercise,
        food: initialEntriesListState.food,
        symptom: initialEntriesListState.symptom,
      };

    case 'CLEAR_FILTER':
      return { ...state, filterTopicId: null };

    // Security: Clear all decrypted/sensitive data
    case 'CLEAR_DECRYPTED_DATA':
      return {
        ...state,
        decryptedEntries: {},
        decryptedTopics: {},
        taskFields: new Map(),
        // Also clear quick entry fields which may contain sensitive data
        quickEntry: '',
        task: initialEntriesListState.task,
        goal: initialEntriesListState.goal,
        meeting: initialEntriesListState.meeting,
        event: initialEntriesListState.event,
        medication: initialEntriesListState.medication,
        exercise: initialEntriesListState.exercise,
        food: initialEntriesListState.food,
        symptom: initialEntriesListState.symptom,
      };

    default:
      return state;
  }
}
