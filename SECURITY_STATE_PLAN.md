# Security Plan: State Management Hardening

## Status: IMPLEMENTED (January 2026)

All phases have been implemented:
- Phase 8: DevToolsBlocker component created and integrated
- Phase 1: Inactivity timeout system with warning toast (5 min default)
- Phase 4: Centralized useSecurityClear registry for cleanup functions
- Phase 2: Component cleanup standardization (EntryEditor, EntriesList, MedicationsTab)
- Phase 3: Authentication form hardening (login, register pages)
- Phase 5: TipTap editor content clearing on unmount
- Phase 6: SessionStorage cleanup on beforeunload
- Phase 7: Reducer audit with security documentation

---

## Overview

This plan addresses security concerns around sensitive data in React state (`useState` and `useReducer`). While both have identical vulnerability to external attacks (DevTools, XSS, memory dumps), proper state management practices minimize exposure time and ensure complete cleanup.

**Key Insight:** The goal isn't to make state "more secure" from attackers—it's to:
1. Minimize decrypted data lifetime in memory
2. Ensure complete cleanup on unmount/logout/inactivity
3. Make security practices easier to audit and maintain

---

## Current State Analysis

### Sensitive Data Locations

| Component | Sensitive Data | Current Cleanup |
|-----------|----------------|-----------------|
| `useEncryption.ts` | Encryption key (CryptoKey) | ✅ `clearKey()` on logout |
| `EntryEditor.tsx` | Decrypted entry content, custom fields | ⚠️ `RESET_ALL` dispatch (partial) |
| `EntriesList.tsx` | Decrypted previews, topics, task fields | ❌ None (persists until refetch) |
| `login/page.tsx` | Password, email | ⚠️ React cleanup only |
| `register/page.tsx` | Password, recovery key | ⚠️ React cleanup only |
| `LegacyKeyMigration.tsx` | Recovery key, plaintext during migration | ⚠️ Page reload |
| `MedicationsTab.tsx` | Decrypted medication data | ❌ None |

### Critical Gaps

1. **No inactivity timeout** - Keys and decrypted data persist indefinitely during active session
2. **Missing unmount cleanup** - Components don't clear sensitive state when unmounting
3. **Persistent preview cache** - `EntriesList` keeps decrypted content across view changes
4. **TipTap editor retention** - Editor content not explicitly cleared
5. **No centralized security clearing** - Scattered cleanup logic, easy to miss fields

---

## Implementation Plan

### Phase 1: Inactivity Timeout System

**Goal:** Auto-clear all sensitive data and logout after period of inactivity.

#### 1.1 Create Inactivity Hook

**File:** `src/lib/hooks/useInactivityTimeout.ts` (new)

```typescript
// Hook that monitors user activity and triggers callback after timeout
// Activity events: mouse, keyboard, touch, scroll
// Configurable timeout (default: 5 minutes for sensitive app)
// Returns: reset function to manually restart timer
```

**Responsibilities:**
- Track last activity timestamp
- Reset timer on user interaction
- Call logout/clear callback when timeout reached
- Cleanup event listeners on unmount

#### 1.2 Integrate with EncryptionProvider

**File:** `src/components/providers/EncryptionProvider.tsx`

**Changes:**
- Add inactivity timeout (5 minutes default)
- On timeout: call `clearKey()`, sign out user
- Show warning toast at 4 minutes
- Allow configuration via environment variable

---

### Phase 2: Component Cleanup Standardization

**Goal:** Ensure all components with sensitive data clean up on unmount.

#### 2.1 EntryEditor Cleanup

**File:** `src/components/journal/EntryEditor.tsx`

**Changes:**
- Add `useEffect` cleanup that dispatches `RESET_ALL` on unmount
- Clear TipTap editor content explicitly: `editor?.commands.clearContent()`
- Ensure cleanup runs before component removal

```typescript
useEffect(() => {
  return () => {
    dispatch({ type: 'RESET_ALL' });
    editor?.commands.clearContent();
  };
}, [editor]);
```

#### 2.2 EntriesList Cleanup

**File:** `src/components/journal/EntriesList.tsx`

**Changes:**
- Add `CLEAR_DECRYPTED_DATA` action to reducer
- Clear `decryptedEntries`, `decryptedTopics`, `taskFields` on unmount
- Clear maps when switching away from journal view

```typescript
case 'CLEAR_DECRYPTED_DATA':
  return {
    ...state,
    decryptedEntries: {},
    decryptedTopics: {},
    taskFields: new Map(),
  };
```

#### 2.3 Health Components Cleanup

**Files:**
- `src/components/health/MedicationsTab.tsx`
- Other health tab components with decrypted state

**Changes:**
- Add unmount cleanup for decrypted Maps/state
- Clear on tab switch (not just refetch)

---

### Phase 3: Authentication Form Hardening

**Goal:** Minimize password exposure time in form state.

#### 3.1 Login Form

**File:** `src/app/(auth)/login/page.tsx`

**Changes:**
- Clear password state immediately after successful authentication
- Clear on unmount (even if login incomplete)
- Clear on failed attempts after error is shown

```typescript
// After successful login
setPassword('');

// Cleanup on unmount
useEffect(() => {
  return () => {
    setPassword('');
    setEmail('');
  };
}, []);
```

#### 3.2 Registration Form

**File:** `src/app/(auth)/register/page.tsx`

**Changes:**
- Same password clearing pattern as login
- Clear recovery key from state after user confirms receipt
- Explicit cleanup on unmount

---

### Phase 4: Centralized Security Clear Function

**Goal:** Single function to clear ALL sensitive data app-wide.

#### 4.1 Create Security Context

**File:** `src/lib/hooks/useSecurityClear.ts` (new)

```typescript
// Central registry of cleanup functions
// Components register their cleanup callbacks
// Single clearAllSensitiveData() clears everything

interface SecurityClearContext {
  registerCleanup: (id: string, cleanup: () => void) => void;
  unregisterCleanup: (id: string) => void;
  clearAllSensitiveData: () => void;
}
```

**Benefits:**
- Components register their cleanup functions
- Logout calls single `clearAllSensitiveData()`
- Inactivity timeout uses same function
- Easy to audit: one place lists all sensitive data sources

#### 4.2 Integrate with Existing Cleanup

**Files to update:**
- `EncryptionProvider.tsx` - Use centralized clear
- `EntryEditor.tsx` - Register cleanup
- `EntriesList.tsx` - Register cleanup
- Health components - Register cleanup

---

### Phase 5: TipTap Editor Security

**Goal:** Ensure rich text editor doesn't retain decrypted content.

#### 5.1 Editor Content Clearing

**File:** `src/components/journal/EntryEditor.tsx`

**Changes:**
- Clear editor on entry deselection
- Clear editor on component unmount
- Clear editor before loading new entry (already done, verify)

```typescript
// When entry is deselected
if (!entryId && editor) {
  editor.commands.clearContent();
}
```

#### 5.2 Editor Destroy on Unmount

Verify TipTap's `useEditor` properly destroys editor instance and clears DOM content.

---

### Phase 6: SessionStorage Security Review

**Goal:** Ensure sessionStorage usage is appropriate for security model.

#### 6.1 Current Behavior (Acceptable)

- Key stored as JWK in sessionStorage
- Survives page refresh (UX benefit)
- Cleared on logout, tab close
- **Keep this behavior** - tradeoff is acceptable for usability

#### 6.2 Enhancement: Verify Tab Close Behavior

**File:** `src/components/providers/EncryptionProvider.tsx`

**Add:**
- `beforeunload` event listener as backup cleanup
- Verify sessionStorage is cleared on browser/tab close

```typescript
useEffect(() => {
  const handleUnload = () => {
    clearKey();
  };
  window.addEventListener('beforeunload', handleUnload);
  return () => window.removeEventListener('beforeunload', handleUnload);
}, [clearKey]);
```

---

### Phase 7: Reducer Audit & Enhancement

**Goal:** Ensure all reducers have proper RESET actions.

#### 7.1 Audit Existing Reducers

**Files:**
- `src/components/journal/entryEditorReducer.ts`
- `src/components/journal/entriesListReducer.ts`

**Verify:**
- `RESET_ALL` action exists and clears ALL sensitive fields
- No fields accidentally preserved during reset
- Reset returns to safe initial state (not just empty)

#### 7.2 Add Missing Reset Actions

For any reducer without complete reset:
- Add `RESET_ALL` or `CLEAR_SENSITIVE` action
- Ensure it clears every field containing decrypted data
- Document which fields are sensitive in comments

---

### Phase 8: Disable React DevTools in Production

**Goal:** Prevent React DevTools from inspecting component state in production builds.

#### 8.1 Why This Matters

React DevTools allows anyone to:
- Inspect all component state (useState, useReducer)
- View Zustand store contents
- See props passed between components
- Access decrypted content, encryption keys, passwords in memory

While a determined attacker can bypass this (it's client-side), it:
- Raises the bar for casual inspection
- Prevents accidental exposure on shared computers
- Signals security-conscious design
- Removes the easiest attack vector

#### 8.2 Implementation Options

**Option A: Disable DevTools Hook (Recommended)**

**File:** `src/app/layout.tsx` or `src/components/providers/DevToolsBlocker.tsx` (new)

```typescript
'use client';

import { useEffect } from 'react';

export function DevToolsBlocker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      // Disable React DevTools
      if (typeof window !== 'undefined') {
        // Method 1: Override the DevTools hook
        const disableDevTools = () => {
          const noop = () => {};

          // React DevTools looks for this global
          if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ === 'object') {
            for (const prop in window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
              if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__[prop] === 'function') {
                window.__REACT_DEVTOOLS_GLOBAL_HOOK__[prop] = noop;
              }
            }
          }
        };

        disableDevTools();
      }
    }
  }, []);

  return null;
}
```

**Option B: Pre-mount Blocking (More Thorough)**

**File:** `src/app/layout.tsx`

Add inline script before React hydrates:

```typescript
// In layout.tsx, add to <head>
<script
  dangerouslySetInnerHTML={{
    __html: `
      if (typeof window !== 'undefined' && '${process.env.NODE_ENV}' === 'production') {
        window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
          supportsFiber: true,
          inject: function() {},
          onCommitFiberRoot: function() {},
          onCommitFiberUnmount: function() {}
        };
      }
    `,
  }}
/>
```

**Note:** This requires updating CSP to allow this inline script or using a nonce.

#### 8.3 Additional Browser DevTools Hardening

**Disable Console Methods (Optional)**

```typescript
if (process.env.NODE_ENV === 'production') {
  // Disable console to prevent data leakage via console.log
  const noop = () => {};
  ['log', 'debug', 'info', 'warn'].forEach(method => {
    console[method] = noop;
  });
  // Keep console.error for critical issues
}
```

**Detect DevTools Open (Optional - User Warning)**

```typescript
// Detect if DevTools is open and warn user
const devToolsChecker = () => {
  const threshold = 160;
  const widthThreshold = window.outerWidth - window.innerWidth > threshold;
  const heightThreshold = window.outerHeight - window.innerHeight > threshold;

  if (widthThreshold || heightThreshold) {
    // Show warning banner or log out
    console.warn('Developer tools detected. For your security, sensitive data has been cleared.');
    // Optionally: clearAllSensitiveData();
  }
};
```

**Note:** DevTools detection is unreliable and can be bypassed. Use only as an additional layer, not primary defense.

#### 8.4 Limitations

- **Bypassable:** Determined attackers can disable the blocker before React loads
- **Not a complete solution:** This is defense-in-depth, not absolute protection
- **Browser DevTools still work:** Only React-specific inspection is blocked
- **Memory still readable:** Heap snapshots, memory profiler still expose data

#### 8.5 Files to Create/Modify

**Create:** `src/components/providers/DevToolsBlocker.tsx`

**Modify:** `src/app/layout.tsx` - Add DevToolsBlocker component

---

## Implementation Order

1. **Phase 8** - Disable React DevTools in production (quick win, immediate protection)
2. **Phase 1** - Inactivity timeout (highest impact, user safety)
3. **Phase 4** - Centralized clear function (enables other phases)
4. **Phase 2** - Component cleanup (uses centralized function)
5. **Phase 3** - Auth form hardening (quick wins)
6. **Phase 5** - TipTap security (editor-specific)
7. **Phase 6** - SessionStorage review (verification)
8. **Phase 7** - Reducer audit (cleanup/documentation)

---

## Testing Checklist

### Manual Testing

- [ ] Inactivity timeout triggers after configured time
- [ ] Warning appears before timeout
- [ ] All sensitive data cleared on timeout (check React DevTools)
- [ ] Component unmount clears state (navigate away, check DevTools)
- [ ] Logout clears all sensitive data
- [ ] Password fields clear after form submission
- [ ] TipTap editor clears when entry deselected
- [ ] SessionStorage cleared on logout

### DevTools Verification

After each scenario, verify in React DevTools:
- No decrypted content in component state
- No encryption key in Zustand store
- No sensitive data in sessionStorage

### DevTools Blocker Testing

- [ ] React DevTools shows no component tree in production build
- [ ] Console methods disabled in production (except error)
- [ ] DevTools blocker doesn't affect development mode
- [ ] No CSP violations from inline script (if using Option B)

---

## Configuration Options

### Environment Variables

```env
# Inactivity timeout in milliseconds (default: 300000 = 5 minutes)
NEXT_PUBLIC_INACTIVITY_TIMEOUT=300000

# Warning before timeout in milliseconds (default: 60000 = 1 minute before)
NEXT_PUBLIC_INACTIVITY_WARNING=60000
```

---

## Security Limitations (Documented)

These issues CANNOT be fully mitigated by state management changes:

1. **React DevTools** - ✅ Mitigated by Phase 8 (disabled in production, though bypassable by determined attackers)
2. **XSS attacks** - Attacker can traverse React fiber tree
3. **Browser extensions** - Malicious extensions can intercept state
4. **Memory dumps** - State exists in JavaScript heap

**Existing mitigations (already in place):**
- Content Security Policy (CSP) headers
- DOMPurify HTML sanitization
- Input validation
- HTTPS only

**New mitigations (this plan):**
- React DevTools disabled in production (Phase 8)
- Console methods disabled in production (Phase 8)
- Inactivity auto-logout (Phase 1)
- Centralized data clearing (Phase 4)

---

## Files to Create

1. `src/components/providers/DevToolsBlocker.tsx` - React DevTools disabler (Phase 8)
2. `src/lib/hooks/useInactivityTimeout.ts` - Inactivity detection hook (Phase 1)
3. `src/lib/hooks/useSecurityClear.ts` - Centralized cleanup registry (Phase 4)

## Files to Modify

1. `src/app/layout.tsx` - Add DevToolsBlocker component (Phase 8)
2. `src/components/providers/EncryptionProvider.tsx` - Add inactivity, beforeunload
3. `src/components/journal/EntryEditor.tsx` - Add unmount cleanup
4. `src/components/journal/EntriesList.tsx` - Add clear action and unmount cleanup
5. `src/components/journal/entriesListReducer.ts` - Add CLEAR_DECRYPTED_DATA action
6. `src/app/(auth)/login/page.tsx` - Password clearing
7. `src/app/(auth)/register/page.tsx` - Password/recovery key clearing
8. `src/components/health/MedicationsTab.tsx` - Unmount cleanup

---

## Summary

This plan focuses on **practical security improvements** that reduce exposure time of sensitive data in memory. While we cannot prevent a determined attacker with DevTools/XSS access from reading state, we can:

- **Minimize exposure window** via inactivity timeout
- **Ensure complete cleanup** via centralized clearing
- **Reduce human error** via standardized patterns
- **Enable auditing** via documented sensitive data locations

The changes improve code maintainability while providing meaningful security benefits within React's architectural constraints.
