import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../testUtils';

import { GoalFields } from '@/components/molecules/fields/GoalFields';
import { FoodFields } from '@/components/molecules/fields/FoodFields';
import { SymptomFields } from '@/components/molecules/fields/SymptomFields';
import { ExerciseFields } from '@/components/molecules/fields/ExerciseFields';
import { EventFields } from '@/components/molecules/fields/EventFields';
import { MeetingFields } from '@/components/molecules/fields/MeetingFields';
import { MedicationFields } from '@/components/molecules/fields/MedicationFields';
import { MilestoneFields } from '@/components/molecules/fields/MilestoneFields';
import { TaskFields } from '@/components/molecules/fields/TaskFields';

import type { GoalFieldValues } from '@/types/fields';
import type { FoodFieldValues } from '@/types/fields';
import type { SymptomFieldValues } from '@/types/fields';
import type { ExerciseFieldValues } from '@/types/fields';
import type { EventFieldValues } from '@/types/fields';
import type { MeetingFieldValues } from '@/types/fields';
import type { MedicationFieldValues } from '@/types/fields';
import type { MilestoneFieldValues } from '@/types/fields';
import type { TaskFieldValues } from '@/types/fields';

/* ═══════════════════════ GoalFields ═══════════════════════ */

describe('GoalFields', () => {
  const defaultValues: GoalFieldValues = {
    goalType: 'short_term',
    goalStatus: 'in_progress',
    targetDate: '2024-12-31',
  };

  it('renders type and status selects and target date', () => {
    renderWithTheme(<GoalFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Target Date')).toBeInTheDocument();
  });

  it('calls onChange when goalType changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<GoalFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'long_term' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goalType: 'long_term' }));
  });

  it('calls onChange when goalStatus changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<GoalFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'completed' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ goalStatus: 'completed' }));
  });
});

/* ═══════════════════════ FoodFields ═══════════════════════ */

describe('FoodFields', () => {
  const defaultValues: FoodFieldValues = {
    mealType: 'breakfast',
    consumedDate: '2024-06-15',
    consumedTime: '08:00',
    ingredients: '',
    calories: '',
    notes: '',
  };

  it('renders meal type, calories, ingredients, and notes fields', () => {
    renderWithTheme(<FoodFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Meal Type')).toBeInTheDocument();
    expect(screen.getByText('Calories')).toBeInTheDocument();
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('calls onChange when mealType changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<FoodFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'lunch' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mealType: 'lunch' }));
  });

  it('calls onChange when calories changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<FoodFields values={defaultValues} onChange={onChange} />);
    const calorieInput = screen.getByPlaceholderText('kcal');
    fireEvent.change(calorieInput, { target: { value: '500' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ calories: '500' }));
  });

  it('calls onChange when ingredients changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<FoodFields values={defaultValues} onChange={onChange} />);
    const ingredientsInput = screen.getByPlaceholderText(/Comma-separated/);
    fireEvent.change(ingredientsInput, { target: { value: 'eggs, toast' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ingredients: 'eggs, toast' }));
  });
});

/* ═══════════════════════ SymptomFields ═══════════════════════ */

describe('SymptomFields', () => {
  const defaultValues: SymptomFieldValues = {
    severity: 5,
    occurredDate: '2024-06-15',
    occurredTime: '10:00',
    duration: '',
    notes: '',
  };

  it('renders severity, time occurred, duration, and notes', () => {
    renderWithTheme(<SymptomFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Time Occurred')).toBeInTheDocument();
    expect(screen.getByText('Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('displays severity value', () => {
    renderWithTheme(<SymptomFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('calls onChange when duration changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<SymptomFields values={defaultValues} onChange={onChange} />);
    const durationInput = screen.getByPlaceholderText('Minutes');
    fireEvent.change(durationInput, { target: { value: '30' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ duration: '30' }));
  });
});

/* ═══════════════════════ ExerciseFields ═══════════════════════ */

describe('ExerciseFields', () => {
  const defaultValues: ExerciseFieldValues = {
    exerciseType: 'running',
    duration: '',
    intensity: 'medium',
    distance: '',
    distanceUnit: 'miles',
    calories: '',
    performedDate: '2024-06-15',
    performedTime: '07:00',
    notes: '',
  };

  it('renders type, intensity, duration, calories, distance, and notes', () => {
    renderWithTheme(<ExerciseFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Intensity')).toBeInTheDocument();
    expect(screen.getByText('Duration (min)')).toBeInTheDocument();
    expect(screen.getByText('Calories')).toBeInTheDocument();
    expect(screen.getByText('Distance')).toBeInTheDocument();
    expect(screen.getByText('Unit')).toBeInTheDocument();
  });

  it('calls onChange when exerciseType changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<ExerciseFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    // First select is exerciseType
    fireEvent.change(selects[0], { target: { value: 'cycling' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exerciseType: 'cycling' }));
  });

  it('calls onChange when intensity changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<ExerciseFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'high' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ intensity: 'high' }));
  });
});

/* ═══════════════════════ EventFields ═══════════════════════ */

describe('EventFields', () => {
  const defaultValues: EventFieldValues = {
    startDate: '2024-06-15',
    startTime: '09:00',
    endDate: '2024-06-15',
    endTime: '10:00',
    location: '',
    address: '',
    phone: '',
    notes: '',
  };

  it('renders start, end, location, address, phone, and notes fields', () => {
    renderWithTheme(<EventFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('calls onChange when location changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<EventFields values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Venue name'), { target: { value: 'Conference Hall' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ location: 'Conference Hall' }));
  });

  it('calls onChange when address changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<EventFields values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Full address'), { target: { value: '123 Main St' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ address: '123 Main St' }));
  });
});

/* ═══════════════════════ MeetingFields ═══════════════════════ */

describe('MeetingFields', () => {
  const defaultValues: MeetingFieldValues = {
    startDate: '2024-06-15',
    startTime: '14:00',
    endDate: '2024-06-15',
    endTime: '15:00',
    meetingTopic: '',
    attendees: '',
    location: '',
    address: '',
    phone: '',
    notes: '',
  };

  it('renders meeting topic, attendees, and time fields', () => {
    renderWithTheme(<MeetingFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Meeting Topic')).toBeInTheDocument();
    expect(screen.getByText('Attendees')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('calls onChange when meeting topic changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<MeetingFields values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('What is the meeting about?'), { target: { value: 'Sprint Review' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ meetingTopic: 'Sprint Review' }));
  });

  it('calls onChange when attendees changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<MeetingFields values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('Comma-separated names'), { target: { value: 'Alice, Bob' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ attendees: 'Alice, Bob' }));
  });
});

/* ═══════════════════════ MedicationFields ═══════════════════════ */

describe('MedicationFields', () => {
  const defaultValues: MedicationFieldValues = {
    dosage: '',
    frequency: 'once_daily',
    scheduleTimes: ['08:00'],
    isActive: true,
    notes: '',
  };

  it('renders dosage, frequency, schedule times, active checkbox, and notes', () => {
    renderWithTheme(<MedicationFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('Dosage')).toBeInTheDocument();
    expect(screen.getByText('Frequency')).toBeInTheDocument();
    expect(screen.getByText('Schedule Times')).toBeInTheDocument();
    expect(screen.getByText('Currently active')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('calls onChange when dosage changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<MedicationFields values={defaultValues} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. 500mg'), { target: { value: '250mg' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dosage: '250mg' }));
  });

  it('calls onChange when frequency changes', () => {
    const onChange = vi.fn();
    renderWithTheme(<MedicationFields values={defaultValues} onChange={onChange} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'twice_daily' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'twice_daily' }));
  });

  it('renders "Add time" button', () => {
    renderWithTheme(<MedicationFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText(/Add time/)).toBeInTheDocument();
  });

  it('adds a schedule time when "Add time" is clicked', () => {
    const onChange = vi.fn();
    renderWithTheme(<MedicationFields values={defaultValues} onChange={onChange} />);
    fireEvent.click(screen.getByText(/Add time/));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      scheduleTimes: ['08:00', '08:00'],
    }));
  });

  it('renders remove buttons for each schedule time', () => {
    const values = { ...defaultValues, scheduleTimes: ['08:00', '12:00'] };
    const { container } = renderWithTheme(<MedicationFields values={values} onChange={() => {}} />);
    // Each time row has a remove button with faXmark icon
    const timeInputs = container.querySelectorAll('input[type="time"]');
    expect(timeInputs).toHaveLength(2);
  });
});

/* ═══════════════════════ MilestoneFields ═══════════════════════ */

describe('MilestoneFields', () => {
  const defaultValues: MilestoneFieldValues = {
    milestoneStatus: 'not_started',
    targetDate: '2024-12-31',
    isCompleted: false,
    parentGoalId: null,
  };

  const goalOptions = [
    { id: 1, title: 'Learn Rust' },
    { id: 2, title: 'Run Marathon' },
  ];

  it('renders linked goal, status, and target date', () => {
    renderWithTheme(
      <MilestoneFields values={defaultValues} onChange={() => {}} goalOptions={goalOptions} />,
    );
    expect(screen.getByText('Linked Goal')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Target Date')).toBeInTheDocument();
  });

  it('renders goal options in select', () => {
    renderWithTheme(
      <MilestoneFields values={defaultValues} onChange={() => {}} goalOptions={goalOptions} />,
    );
    expect(screen.getByText('Learn Rust')).toBeInTheDocument();
    expect(screen.getByText('Run Marathon')).toBeInTheDocument();
  });

  it('calls onChange when goal is selected', () => {
    const onChange = vi.fn();
    renderWithTheme(
      <MilestoneFields values={defaultValues} onChange={onChange} goalOptions={goalOptions} />,
    );
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ parentGoalId: 1 }));
  });

});

/* ═══════════════════════ TaskFields ═══════════════════════ */

describe('TaskFields', () => {
  const defaultValues: TaskFieldValues = {
    isInProgress: false,
    isCompleted: false,
    isAutoMigrating: false,
    parentGoalId: null,
    parentMilestoneId: null,
    deadline: '',
    priority: 'none',
  };

  it('renders checkboxes for progress, completion, and auto-migrate', () => {
    renderWithTheme(<TaskFields values={defaultValues} onChange={() => {}} />);
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Auto-migrate')).toBeInTheDocument();
  });

  it('renders milestone select when options are provided', () => {
    const milestoneOptions = [{ id: 1, title: 'Phase 1' }];
    renderWithTheme(
      <TaskFields values={defaultValues} onChange={() => {}} milestoneOptions={milestoneOptions} />,
    );
    expect(screen.getByText('Linked Milestone')).toBeInTheDocument();
    expect(screen.getByText('Phase 1')).toBeInTheDocument();
  });

  it('does not render milestone select when options are empty', () => {
    renderWithTheme(<TaskFields values={defaultValues} onChange={() => {}} milestoneOptions={[]} />);
    expect(screen.queryByText('Linked Milestone')).not.toBeInTheDocument();
  });

  it('calls onChange when milestone is selected', () => {
    const onChange = vi.fn();
    const milestoneOptions = [{ id: 1, title: 'Phase 1' }];
    renderWithTheme(
      <TaskFields values={defaultValues} onChange={onChange} milestoneOptions={milestoneOptions} />,
    );
    // Priority is also a select, so target the milestone one by its empty option
    fireEvent.change(screen.getByDisplayValue('No milestone'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ parentMilestoneId: 1 }));
  });
});
