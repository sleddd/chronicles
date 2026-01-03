# Refactoring Plan: Streamline Components for Maintainability & Scalability

## Problem Summary
- **EntryEditor.tsx**: 1,941 lines, 45+ useState hooks, 12 levels of div nesting
- **EntriesList.tsx**: 1,450 lines, 36 flex containers, 10 levels of nesting
- **123 repeated backdrop-blur patterns** across codebase
- **No SCSS**, no component-level CSS, no design system
- Duplicate patterns: buttons, inputs, modals, dropdowns, cards

## Goals
1. Reduce component file sizes by 60%+
2. Create reusable UI primitives with global SCSS classes
3. Eliminate inline Tailwind class bloat
4. Maintain all encryption functionality (no changes to crypto logic)

---

## Phase 1: SCSS Foundation & Design Tokens

### 1.1 Setup SCSS compilation
```bash
npm install sass
```

Create `src/styles/` directory structure:
```
src/styles/
  _variables.scss      # Design tokens
  _mixins.scss         # Reusable patterns
  components/
    _buttons.scss
    _inputs.scss
    _modals.scss
    _cards.scss
    _dropdowns.scss
  index.scss           # Main entry
```

Import in `globals.css`:
```css
@import './styles/index.scss';
```

### 1.2 Define design tokens (`src/styles/_variables.scss`)
```scss
// Glass morphism levels
$glass-light: theme('colors.white/10');
$glass-medium: theme('colors.white/30');
$glass-heavy: theme('colors.white/70');
$glass-solid: theme('colors.white/90');

// Consistent spacing
$spacing-xs: theme('spacing.1');
$spacing-sm: theme('spacing.2');
$spacing-md: theme('spacing.3');
$spacing-lg: theme('spacing.4');
```

### 1.3 Create base component classes

**`src/styles/components/_buttons.scss`**
```scss
.btn {
  @apply px-3 py-2 text-sm rounded-md transition-colors;
}
.btn-primary {
  @apply btn text-white;
  background-color: var(--accent-color, #1aaeae);
  &:hover { background-color: var(--accent-hover, #158f8f); }
  &:disabled { @apply opacity-50 cursor-not-allowed; }
}
.btn-secondary {
  @apply btn text-gray-600 hover:bg-white/40;
}
.btn-icon {
  @apply p-2 rounded-md text-gray-600 hover:bg-white/40;
}
.btn-danger {
  @apply btn bg-red-600 text-white hover:bg-red-700;
}
```

**`src/styles/components/_inputs.scss`**
```scss
.input {
  @apply w-full px-3 py-2 border border-border rounded-md text-sm text-gray-900 placeholder-gray-400;
}
.input-glass {
  @apply input backdrop-blur-sm bg-white/10;
}
.select {
  @apply input;
}
.select-glass {
  @apply input-glass;
}
```

**`src/styles/components/_modals.scss`**
```scss
.modal-overlay {
  @apply fixed inset-0 bg-black/50 flex items-center justify-center z-50;
}
.modal-content {
  @apply backdrop-blur-xl bg-white/90 rounded-lg shadow-xl w-full max-w-md mx-4;
}
.modal-header {
  @apply flex items-center justify-between p-4 border-b border-border;
}
.modal-body {
  @apply p-4;
}
.modal-footer {
  @apply flex justify-end gap-3 p-4 border-t border-border;
}
```

**`src/styles/components/_dropdowns.scss`**
```scss
.dropdown {
  @apply absolute z-50 mt-1 backdrop-blur-xl bg-white/90 border border-border rounded-md shadow-lg;
}
.dropdown-item {
  @apply w-full text-left px-3 py-2 text-sm rounded hover:bg-white/40;
}
.dropdown-item-active {
  @apply dropdown-item bg-teal-50 text-teal-700;
}
```

**`src/styles/components/_cards.scss`**
```scss
.card {
  @apply border border-border rounded-md backdrop-blur-sm bg-white/10;
}
.card-interactive {
  @apply card cursor-pointer hover:border-teal-300 hover:shadow-sm transition-all;
}
.badge {
  @apply text-xs px-2 py-0.5 rounded backdrop-blur-md bg-white/60 text-gray-700;
}
```

**`src/styles/index.scss`**
```scss
@import 'variables';
@import 'mixins';
@import 'components/buttons';
@import 'components/inputs';
@import 'components/modals';
@import 'components/dropdowns';
@import 'components/cards';
```

---

## Phase 2: Extract UI Primitives

### 2.1 Create `src/components/ui/` directory

| File | Purpose |
|------|---------|
| `Button.tsx` | btn, btn-primary, btn-secondary, btn-icon |
| `Input.tsx` | input, input-glass + label support |
| `Select.tsx` | Styled select with glass effect |
| `Modal.tsx` | Modal wrapper with header/footer slots |
| `Dropdown.tsx` | Reusable dropdown container |
| `Card.tsx` | card, card-interactive |
| `Badge.tsx` | Status badges/tags |
| `DateTimeField.tsx` | Date + time input pair (repeated 6+ times) |
| `FieldGroup.tsx` | Label + input wrapper |
| `index.ts` | Barrel export |

### 2.2 Component implementations

**`src/components/ui/Button.tsx`**
```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon' | 'danger';
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    icon: 'btn-icon',
    danger: 'btn-danger',
  }[variant];

  return (
    <button
      className={`${baseClass} ${className || ''}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
```

**`src/components/ui/Input.tsx`**
```tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  glass?: boolean;
}

export function Input({ label, glass, className, ...props }: InputProps) {
  const inputClass = glass ? 'input-glass' : 'input';

  if (label) {
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">{label}</label>
        <input className={`${inputClass} ${className || ''}`} {...props} />
      </div>
    );
  }

  return <input className={`${inputClass} ${className || ''}`} {...props} />;
}
```

**`src/components/ui/Modal.tsx`**
```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  if (!isOpen) return null;

  const sizeClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  }[size];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content ${sizeClass}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-icon">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
```

**`src/components/ui/DateTimeField.tsx`**
```tsx
interface DateTimeFieldProps {
  label: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  glass?: boolean;
}

export function DateTimeField({ label, date, time, onDateChange, onTimeChange, glass }: DateTimeFieldProps) {
  const inputClass = glass ? 'input-glass' : 'input';

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600 w-12">{label}:</label>
      <input
        type="date"
        value={date}
        onChange={(e) => onDateChange(e.target.value)}
        className={`${inputClass} w-auto`}
      />
      <input
        type="time"
        value={time}
        onChange={(e) => onTimeChange(e.target.value)}
        className={`${inputClass} w-auto`}
      />
    </div>
  );
}
```

**`src/components/ui/index.ts`**
```tsx
export { Button } from './Button';
export { Input } from './Input';
export { Select } from './Select';
export { Modal } from './Modal';
export { Dropdown } from './Dropdown';
export { Card } from './Card';
export { Badge } from './Badge';
export { DateTimeField } from './DateTimeField';
export { FieldGroup } from './FieldGroup';
```

---

## Phase 3: Extract Custom Field Forms

### 3.1 Create `src/components/forms/` directory

| File | Fields |
|------|--------|
| `TaskFields.tsx` | isCompleted, isAutoMigrating |
| `GoalFields.tsx` | type, status, targetDate |
| `MilestoneFields.tsx` | goalIds selector |
| `MeetingFields.tsx` | start/end datetime, location, topic, attendees |
| `EventFields.tsx` | start/end datetime, location |
| `MedicationFields.tsx` | dosage, frequency, scheduleTimes, isActive |
| `ExerciseFields.tsx` | type, duration, intensity, distance, calories |
| `FoodFields.tsx` | mealType, ingredients |
| `SymptomFields.tsx` | severity, duration |
| `index.ts` | Registry export |

### 3.2 Create custom hook for field state

**`src/lib/hooks/useCustomFields.ts`**
```tsx
import { useState, useCallback } from 'react';

type FieldValues = Record<string, unknown>;

const defaultFieldsByType: Record<string, FieldValues> = {
  task: { isCompleted: false, isAutoMigrating: true },
  goal: { type: 'short_term', status: 'active', targetDate: '' },
  meeting: { startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', location: '', topic: '', attendees: '' },
  event: { startDate: '', startTime: '09:00', endDate: '', endTime: '10:00', location: '' },
  medication: { dosage: '', frequency: 'once_daily', scheduleTimes: ['08:00'], isActive: true },
  exercise: { type: 'cardio', duration: '', intensity: 'medium', distance: '', distanceUnit: 'miles', calories: '' },
  food: { mealType: 'breakfast', ingredients: '' },
  symptom: { severity: 5, duration: '' },
  milestone: { goalIds: [] },
};

export function useCustomFields(customType: string | null) {
  const [fields, setFields] = useState<FieldValues>(
    customType ? defaultFieldsByType[customType] || {} : {}
  );

  const updateField = useCallback((key: string, value: unknown) => {
    setFields(prev => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setFields(customType ? defaultFieldsByType[customType] || {} : {});
  }, [customType]);

  const loadFields = useCallback((loadedFields: FieldValues) => {
    setFields(prev => ({ ...prev, ...loadedFields }));
  }, []);

  return { fields, updateField, reset, loadFields, setFields };
}
```

### 3.3 Form component example

**`src/components/forms/MeetingFields.tsx`**
```tsx
import { DateTimeField, Input } from '@/components/ui';

interface MeetingFieldsProps {
  fields: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    location: string;
    topic: string;
    attendees: string;
  };
  onChange: (key: string, value: unknown) => void;
  glass?: boolean;
}

export function MeetingFields({ fields, onChange, glass }: MeetingFieldsProps) {
  return (
    <div className="space-y-3">
      <DateTimeField
        label="Start"
        date={fields.startDate}
        time={fields.startTime}
        onDateChange={(v) => onChange('startDate', v)}
        onTimeChange={(v) => onChange('startTime', v)}
        glass={glass}
      />
      <DateTimeField
        label="End"
        date={fields.endDate}
        time={fields.endTime}
        onDateChange={(v) => onChange('endDate', v)}
        onTimeChange={(v) => onChange('endTime', v)}
        glass={glass}
      />
      <Input
        label="Location"
        value={fields.location}
        onChange={(e) => onChange('location', e.target.value)}
        placeholder="Location"
        glass={glass}
      />
      <Input
        label="Topic"
        value={fields.topic}
        onChange={(e) => onChange('topic', e.target.value)}
        placeholder="Meeting topic"
        glass={glass}
      />
      <Input
        label="Attendees"
        value={fields.attendees}
        onChange={(e) => onChange('attendees', e.target.value)}
        placeholder="Attendees (comma separated)"
        glass={glass}
      />
    </div>
  );
}
```

**`src/components/forms/index.ts`**
```tsx
export { TaskFields } from './TaskFields';
export { GoalFields } from './GoalFields';
export { MilestoneFields } from './MilestoneFields';
export { MeetingFields } from './MeetingFields';
export { EventFields } from './EventFields';
export { MedicationFields } from './MedicationFields';
export { ExerciseFields } from './ExerciseFields';
export { FoodFields } from './FoodFields';
export { SymptomFields } from './SymptomFields';

// Registry for dynamic rendering
export const CustomFieldForms: Record<string, React.ComponentType<any>> = {
  task: TaskFields,
  goal: GoalFields,
  milestone: MilestoneFields,
  meeting: MeetingFields,
  event: EventFields,
  medication: MedicationFields,
  exercise: ExerciseFields,
  food: FoodFields,
  symptom: SymptomFields,
};
```

---

## Phase 4: Refactor Major Components

### 4.1 EntryEditor.tsx (1,941 → ~600 lines)

**Before:**
```tsx
// 45+ useState hooks
const [goalType, setGoalType] = useState('short_term');
const [goalStatus, setGoalStatus] = useState('active');
const [targetDate, setTargetDate] = useState('');
// ... 42 more useState calls
```

**After:**
```tsx
import { useCustomFields } from '@/lib/hooks/useCustomFields';
import { CustomFieldForms } from '@/components/forms';

const { fields, updateField, reset, loadFields } = useCustomFields(customType);

// In render:
{customType && CustomFieldForms[customType] && (
  <CustomFieldForms[customType] fields={fields} onChange={updateField} />
)}
```

**Key changes:**
- Replace 45+ useState with single `useCustomFields` hook
- Replace inline field sections with form components
- Replace inline buttons with `<Button variant="primary">`
- Replace modal markup with `<Modal>`

### 4.2 EntriesList.tsx (1,450 → ~500 lines)

**Extract `QuickEntryForm` component** (~400 lines → separate file)

**`src/components/journal/QuickEntryForm.tsx`**
```tsx
import { useCustomFields } from '@/lib/hooks/useCustomFields';
import { CustomFieldForms } from '@/components/forms';
import { Button, Input } from '@/components/ui';
import { TopicSelector } from '@/components/topics/TopicSelector';

interface QuickEntryFormProps {
  selectedDate: string;
  today: string;
  onEntryCreated: (entryId?: string) => void;
}

export function QuickEntryForm({ selectedDate, today, onEntryCreated }: QuickEntryFormProps) {
  const [quickEntry, setQuickEntry] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState<string | null>(null);
  const { fields, updateField, reset } = useCustomFields(topicName);

  // ... submit logic

  return (
    <form onSubmit={handleSubmit} className="quick-entry-form">
      <TopicSelector selectedTopicId={topicId} onSelectTopic={setTopicId} />
      <Input value={quickEntry} onChange={e => setQuickEntry(e.target.value)} placeholder="Quick entry..." glass />
      <Button variant="primary" type="submit">Add</Button>

      {topicName && CustomFieldForms[topicName] && (
        <CustomFieldForms[topicName] fields={fields} onChange={updateField} glass />
      )}
    </form>
  );
}
```

### 4.3 TopicSelector.tsx (consolidate 3 implementations)

Single configurable component with variants:
```tsx
interface TopicSelectorProps {
  selectedTopicId: string | null;
  onSelectTopic: (id: string | null) => void;
  variant?: 'dropdown' | 'sidebar' | 'inline';
}
```

### 4.4 Modals (ShareModal, EventModal, AddTopicModal)

**Before (each modal):**
```tsx
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
  <div className="backdrop-blur-sm bg-white/30 rounded-lg shadow-xl w-full max-w-md mx-4">
    <div className="flex items-center justify-between p-4 border-b border-border">
      <h2>Title</h2>
      <button onClick={onClose}>×</button>
    </div>
    {/* content */}
  </div>
</div>
```

**After:**
```tsx
<Modal isOpen={isOpen} onClose={onClose} title="Title" footer={<Button>Save</Button>}>
  {/* content only */}
</Modal>
```

~25-30 lines removed per modal.

---

## Phase 5: Implementation Order

### Step-by-step execution:

1. **Install sass**: `npm install sass`
2. **Create SCSS files** (Phase 1)
3. **Create UI primitives** (Phase 2)
4. **Create form components** (Phase 3)
5. **Refactor TopicSelector.tsx** - Use new classes
6. **Extract QuickEntryForm.tsx** from EntriesList
7. **Refactor EntryEditor.tsx** - Use hook + form components
8. **Refactor EntriesList.tsx** - Use extracted components
9. **Refactor ShareModal.tsx** - Use Modal component
10. **Refactor EventModal.tsx** - Use Modal component
11. **Refactor AddTopicModal.tsx** - Use Modal component
12. **Refactor GoalCard.tsx** - Use Card, Button components
13. **Test all functionality** - Verify encryption still works

---

## Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `src/styles/_variables.scss` | Design tokens | 30 |
| `src/styles/_mixins.scss` | Reusable patterns | 20 |
| `src/styles/components/_buttons.scss` | Button classes | 40 |
| `src/styles/components/_inputs.scss` | Input classes | 30 |
| `src/styles/components/_modals.scss` | Modal classes | 25 |
| `src/styles/components/_dropdowns.scss` | Dropdown classes | 25 |
| `src/styles/components/_cards.scss` | Card classes | 20 |
| `src/styles/index.scss` | Main entry | 15 |
| `src/components/ui/Button.tsx` | Button primitive | 40 |
| `src/components/ui/Input.tsx` | Input primitive | 35 |
| `src/components/ui/Select.tsx` | Select primitive | 35 |
| `src/components/ui/Modal.tsx` | Modal primitive | 50 |
| `src/components/ui/Dropdown.tsx` | Dropdown primitive | 45 |
| `src/components/ui/Card.tsx` | Card primitive | 30 |
| `src/components/ui/Badge.tsx` | Badge primitive | 25 |
| `src/components/ui/DateTimeField.tsx` | DateTime pair | 40 |
| `src/components/ui/FieldGroup.tsx` | Label+input wrapper | 25 |
| `src/components/ui/index.ts` | Barrel export | 15 |
| `src/components/forms/TaskFields.tsx` | Task form | 35 |
| `src/components/forms/GoalFields.tsx` | Goal form | 50 |
| `src/components/forms/MeetingFields.tsx` | Meeting form | 60 |
| `src/components/forms/EventFields.tsx` | Event form | 50 |
| `src/components/forms/MedicationFields.tsx` | Medication form | 70 |
| `src/components/forms/ExerciseFields.tsx` | Exercise form | 60 |
| `src/components/forms/FoodFields.tsx` | Food form | 40 |
| `src/components/forms/SymptomFields.tsx` | Symptom form | 40 |
| `src/components/forms/MilestoneFields.tsx` | Milestone form | 35 |
| `src/components/forms/index.ts` | Barrel + registry | 30 |
| `src/components/journal/QuickEntryForm.tsx` | Extracted form | 150 |
| `src/lib/hooks/useCustomFields.ts` | Field state hook | 60 |

---

## What Will NOT Change

- `src/lib/crypto/*` - All encryption logic untouched
- `src/lib/hooks/useEncryption.ts` - Encryption hook untouched
- `src/app/api/*` - All API routes untouched
- Database schema and queries - Untouched
- Authentication flow - Untouched

---

## Expected Outcomes

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| EntryEditor.tsx | 1,941 lines | ~600 lines | 69% |
| EntriesList.tsx | 1,450 lines | ~500 lines | 65% |
| Backdrop patterns | 123 occurrences | ~20 | 84% |
| Max div nesting | 12 levels | 5-6 levels | 50% |
| useState hooks (EntryEditor) | 45+ | 5-10 | 78% |
| Modal boilerplate | 25-30 lines each | 3-5 lines | 85% |

**New reusable components**: 9 UI primitives + 9 form components + 1 hook
