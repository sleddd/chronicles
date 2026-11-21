import type { KeyboardEvent } from 'react';

/*
 * Things that aren't <button>s but act like one for the keyboard: clickable
 * rows and cells (Enter / Space), and the cards on the planning boards, which
 * Space picks up to drag.
 */

/** Enter or Space on the element itself presses it. A key on a control inside it (a row's own buttons) stays theirs */
export function pressOnKey(onPress: () => void) {
  return (e: KeyboardEvent<HTMLElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(); }
  };
}

/** A row that opens something: a button for the keyboard too (Enter / Space) */
export function pressable(onPress: () => void) {
  return { role: 'button' as const, tabIndex: 0, onClick: onPress, onKeyDown: pressOnKey(onPress) };
}

/** Keyboard drag on a board: Space starts and ends it, so Enter is free to open a card */
export const BOARD_KEYS = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] };

/** dnd-kit hands its listeners over untyped (`Function`) */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type DragKeyHandler = Function;

/**
 * A board card's key handler: dnd-kit's own first (Space picks the card up),
 * then Enter opens a card that isn't being held.
 */
export function boardCardKey(dragKey: DragKeyHandler | undefined, isDragging: boolean, onOpen: () => void) {
  return (e: KeyboardEvent<HTMLElement>): void => {
    (dragKey as ((e: KeyboardEvent) => void) | undefined)?.(e);
    if (e.key === 'Enter' && !isDragging && e.target === e.currentTarget) onOpen();
  };
}
