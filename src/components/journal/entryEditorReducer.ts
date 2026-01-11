// Entry Editor State Management with useReducer
// Replaces 50+ useState hooks with centralized, type-safe state management
//
// SECURITY NOTE: This reducer contains sensitive decrypted data
// All fields below are considered sensitive and must be cleared on:
// - Component unmount
// - User logout
// - Inactivity timeout
//
// Sensitive fields include:
// - selectedTopicName (decrypted topic name)
// - goal.linkedMilestones[].content (decrypted milestone content)
// - milestone.linkedTasks[].content (decrypted task content)
// - All custom field data (medication, food, symptom, event, meeting, exercise)
//
// Use RESET_ALL action to clear all sensitive data safely.

export type EntryState = {
  // Core fields
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  showDeleteConfirm: boolean;
  showShareModal: boolean;
  selectedTopicId: string | null;
  selectedTopicName: string | null;
  storedCustomType: string | null;
  isFavorite: boolean;
  togglingFavorite: boolean;
  expandEntry: boolean;
  charCount: number;

  // Goal fields
  goal: {
    type: 'short_term' | 'long_term';
    status: 'active' | 'completed' | 'archived';
    targetDate: string;
    linkedMilestones: Array<{ id: string; content: string }>;
  };

  // Milestone fields
  milestone: {
    goalIds: string[];
    linkedTasks: Array<{ id: string; content: string; isCompleted: boolean }>;
  };

  // Task fields
  task: {
    isCompleted: boolean;
    isInProgress: boolean;
    isAutoMigrating: boolean;
    milestoneIds: string[];
  };

  // Medication fields
  medication: {
    dosage: string;
    frequency: 'once_daily' | 'twice_daily' | 'three_times_daily' | 'as_needed' | 'custom';
    scheduleTimes: string[];
    isActive: boolean;
    notes: string;
  };

  // Food fields
  food: {
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    consumedAt: string;
    ingredients: string;
    calories: string;
    notes: string;
  };

  // Symptom fields
  symptom: {
    severity: number;
    occurredAt: string;
    duration: string;
    notes: string;
  };

  // Event fields
  event: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    location: string;
    address: string;
    phone: string;
    notes: string;
  };

  // Meeting fields (extends event)
  meeting: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    location: string;
    address: string;
    phone: string;
    notes: string;
    topic: string;
    attendees: string;
  };

  // Exercise fields
  exercise: {
    type: 'yoga' | 'cardio' | 'strength' | 'swimming' | 'running' | 'cycling' | 'walking' | 'hiking' | 'other';
    otherType: string;
    duration: string;
    intensity: 'low' | 'medium' | 'high';
    distance: string;
    distanceUnit: 'miles' | 'km';
    calories: string;
    performedAt: string;
    notes: string;
  };
};

export type EntryAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_DELETING'; payload: boolean }
  | { type: 'SET_SHOW_DELETE_CONFIRM'; payload: boolean }
  | { type: 'SET_SHOW_SHARE_MODAL'; payload: boolean }
  | { type: 'SET_TOPIC'; payload: { id: string | null; name?: string | null } }
  | { type: 'SET_TOPIC_NAME'; payload: string | null }
  | { type: 'SET_STORED_CUSTOM_TYPE'; payload: string | null }
  | { type: 'SET_FAVORITE'; payload: boolean }
  | { type: 'SET_TOGGLING_FAVORITE'; payload: boolean }
  | { type: 'SET_EXPAND_ENTRY'; payload: boolean }
  | { type: 'SET_CHAR_COUNT'; payload: number }
  | { type: 'UPDATE_GOAL'; payload: Partial<EntryState['goal']> }
  | { type: 'UPDATE_MILESTONE'; payload: Partial<EntryState['milestone']> }
  | { type: 'UPDATE_TASK'; payload: Partial<EntryState['task']> }
  | { type: 'UPDATE_MEDICATION'; payload: Partial<EntryState['medication']> }
  | { type: 'UPDATE_FOOD'; payload: Partial<EntryState['food']> }
  | { type: 'UPDATE_SYMPTOM'; payload: Partial<EntryState['symptom']> }
  | { type: 'UPDATE_EVENT'; payload: Partial<EntryState['event']> }
  | { type: 'UPDATE_MEETING'; payload: Partial<EntryState['meeting']> }
  | { type: 'UPDATE_EXERCISE'; payload: Partial<EntryState['exercise']> }
  | { type: 'RESET_ALL' }
  | { type: 'LOAD_ENTRY'; payload: Partial<EntryState> };

export const initialState: EntryState = {
  loading: false,
  saving: false,
  deleting: false,
  showDeleteConfirm: false,
  showShareModal: false,
  selectedTopicId: null,
  selectedTopicName: null,
  storedCustomType: null,
  isFavorite: false,
  togglingFavorite: false,
  expandEntry: false,
  charCount: 0,
  goal: {
    type: 'short_term',
    status: 'active',
    targetDate: '',
    linkedMilestones: [],
  },
  milestone: {
    goalIds: [],
    linkedTasks: [],
  },
  task: {
    isCompleted: false,
    isInProgress: false,
    isAutoMigrating: false,
    milestoneIds: [],
  },
  medication: {
    dosage: '',
    frequency: 'once_daily',
    scheduleTimes: ['08:00'],
    isActive: true,
    notes: '',
  },
  food: {
    mealType: 'breakfast',
    consumedAt: '',
    ingredients: '',
    calories: '',
    notes: '',
  },
  symptom: {
    severity: 5,
    occurredAt: '',
    duration: '',
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
  meeting: {
    startDate: '',
    startTime: '09:00',
    endDate: '',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    notes: '',
    topic: '',
    attendees: '',
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
};

export function entryReducer(state: EntryState, action: EntryAction): EntryState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_SAVING':
      return { ...state, saving: action.payload };

    case 'SET_DELETING':
      return { ...state, deleting: action.payload };

    case 'SET_SHOW_DELETE_CONFIRM':
      return { ...state, showDeleteConfirm: action.payload };

    case 'SET_SHOW_SHARE_MODAL':
      return { ...state, showShareModal: action.payload };

    case 'SET_TOPIC':
      return {
        ...state,
        selectedTopicId: action.payload.id,
        ...(action.payload.name !== undefined && { selectedTopicName: action.payload.name }),
      };

    case 'SET_TOPIC_NAME':
      return { ...state, selectedTopicName: action.payload };

    case 'SET_STORED_CUSTOM_TYPE':
      return { ...state, storedCustomType: action.payload };

    case 'SET_FAVORITE':
      return { ...state, isFavorite: action.payload };

    case 'SET_TOGGLING_FAVORITE':
      return { ...state, togglingFavorite: action.payload };

    case 'SET_EXPAND_ENTRY':
      return { ...state, expandEntry: action.payload };

    case 'SET_CHAR_COUNT':
      return { ...state, charCount: action.payload };

    case 'UPDATE_GOAL':
      return { ...state, goal: { ...state.goal, ...action.payload } };

    case 'UPDATE_MILESTONE':
      return { ...state, milestone: { ...state.milestone, ...action.payload } };

    case 'UPDATE_TASK': {
      const taskUpdates = { ...action.payload };
      // When marking as completed, also disable auto-migration
      if (taskUpdates.isCompleted === true) {
        taskUpdates.isAutoMigrating = false;
      }
      return { ...state, task: { ...state.task, ...taskUpdates } };
    }

    case 'UPDATE_MEDICATION':
      return { ...state, medication: { ...state.medication, ...action.payload } };

    case 'UPDATE_FOOD':
      return { ...state, food: { ...state.food, ...action.payload } };

    case 'UPDATE_SYMPTOM':
      return { ...state, symptom: { ...state.symptom, ...action.payload } };

    case 'UPDATE_EVENT':
      return { ...state, event: { ...state.event, ...action.payload } };

    case 'UPDATE_MEETING':
      return { ...state, meeting: { ...state.meeting, ...action.payload } };

    case 'UPDATE_EXERCISE':
      return { ...state, exercise: { ...state.exercise, ...action.payload } };

    case 'RESET_ALL':
      return initialState;

    case 'LOAD_ENTRY':
      return { ...state, ...action.payload };

    default:
      return state;
  }
}
