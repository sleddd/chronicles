import { useCallback, useRef } from 'react';
import styled from 'styled-components';
import {
  DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useDroppable,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MaterialIcon } from '../atoms/MaterialIcon.js';
import { useDecryptedImage } from '../../hooks/useDecryptedImage.js';
import { focusPosition } from './EntryImageGallery.js';

/* Planning boards (goals, milestones, tasks, todos): one column per status —
   a toned panel with its name, "N cards" and a full-width + to start a new entry
   in that column — holding bordered cards (a tone pill, the title, a short
   line of detail, a date chip and a progress chip). Drag a card to another
   column to change its status; within a column to reorder (when supported). */

export interface BoardItem {
  id: number;
  title: string;
  /** One line of detail under the title (parent goal, description, …) */
  detail?: string;
  /** Small outlined pill above the title, in its own colour */
  badge?: { label: string; color: string };
  /** Small tracked-caps line above the title in the accent (a milestone's goal) — no pill */
  kicker?: string;
  /** Shown in a flag chip, e.g. "Jul 2" */
  date?: string;
  /** "2/5" chip, e.g. milestones done of a goal's milestones */
  progress?: { done: number; total: number };
  completed?: boolean;
  /** The entry's picture (encrypted thumbnail), shown as a small round avatar on the right */
  image?: { key: string; iv: string; mimeType: string; focusX?: number; focusY?: number };
}

export interface BoardColumn<K extends string> {
  key: K;
  label: string;
  items: BoardItem[];
}

/* ── Styles ── */

/* Columns always sit side by side; narrow screens scroll the row sideways
   (snapping to a column, the next one peeking in) — never stacked */
const Scroll = styled.div`
  overflow-x: auto;
  margin: 0 -4px;
  padding: 20px 4px 8px;
  -webkit-overflow-scrolling: touch;
  @media (max-width: 768px) {
    scroll-snap-type: x mandatory;
    scroll-padding: 0 4px;
  }
`;

const Board = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols}, minmax(250px, 1fr));
  gap: 16px;
  align-items: start;
  @media (max-width: 768px) {
    grid-template-columns: repeat(${({ $cols }) => $cols}, min(80vw, 300px));
    gap: 12px;
    & > * { scroll-snap-align: start; }
  }
`;

const Column = styled.section<{ $over?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 14px 12px 12px;
  background: ${({ $over }) => ($over ? 'var(--bg-lane-over)' : 'var(--bg-lane)')};
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 6px);
  min-height: 160px;
  transition: background 120ms ease;
`;

const ColumnHead = styled.header`
  padding: 0 4px 4px;
`;

const ColumnTitle = styled.h3`
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 300;
  line-height: 1.25;
  color: var(--text-primary);
`;

const ColumnCount = styled.span`
  display: block;
  margin-top: 2px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-disabled);
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 6px);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: border-color 120ms, color 120ms;
  &:hover { border-color: var(--border-strong); color: var(--text-primary); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

const Cards = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 40px;
`;

const Empty = styled.div`
  padding: 14px 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-disabled);
  text-align: center;
`;

const Card = styled.article<{ $dragging?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  background: var(--bg-lane-card);
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 6px);
  cursor: pointer;
  opacity: ${({ $dragging }) => ($dragging ? 0.5 : 1)};
  touch-action: manipulation;
  /* Press-and-hold picks the card up — no iOS callout or text selection */
  -webkit-touch-callout: none;
  user-select: none;
  transition: border-color 120ms;
  &:hover { border-color: var(--border-strong); }
  &:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
`;

/* Pill + title on the left, the picture avatar on the right */
const Top = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const TopText = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Avatar = styled.img`
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-default);
`;

const Pill = styled.span<{ $color: string }>`
  align-self: flex-start;
  padding: 2px 9px;
  font-family: var(--font-sans);
  font-size: 12px;
  line-height: 1.4;
  color: ${({ $color }) => $color};
  border: 1px solid color-mix(in srgb, ${({ $color }) => $color} 55%, transparent);
  background: color-mix(in srgb, ${({ $color }) => $color} 10%, transparent);
  border-radius: 999px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Kicker = styled.span`
  font-family: var(--font-sans);
  font-size: 9.5px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-accent);
  margin-bottom: -2px; /* a little air before the title */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardTitle = styled.h4<{ $done?: boolean }>`
  margin: 0;
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.35;
  color: ${({ $done }) => ($done ? 'var(--text-tertiary)' : 'var(--text-primary)')};
  text-decoration: ${({ $done }) => ($done ? 'line-through' : 'none')};
  overflow-wrap: anywhere;
`;

const Detail = styled.p`
  margin: -4px 0 0;
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-disabled);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  &:empty { display: none; }
`;

const Chip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px 3px 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-tertiary);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  white-space: nowrap;
  &:only-child { margin-right: auto; }
`;

/* ── Pieces ── */

function DropColumn({ id, children }: { id: string; children: (over: boolean, ref: (el: HTMLElement | null) => void) => React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <>{children(isOver, setNodeRef)}</>;
}

function CardAvatar({ image }: { image: NonNullable<BoardItem['image']> }) {
  const { url } = useDecryptedImage(image.key, image.iv, image.mimeType);
  return url ? <Avatar src={url} alt="" style={{ objectPosition: focusPosition(image) }} /> : null;
}

function BoardCard({ item, onOpen }: { item: BoardItem; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const hasFoot = !!item.date || !!item.progress;
  return (
    <Card
      ref={setNodeRef}
      style={style}
      $dragging={isDragging}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(item.id)}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(item.id); }}
    >
      <Top>
        <TopText>
          {item.kicker && <Kicker>{item.kicker}</Kicker>}
          {item.badge && <Pill $color={item.badge.color}>{item.badge.label}</Pill>}
          <CardTitle $done={item.completed}>{item.title}</CardTitle>
        </TopText>
        {item.image && <CardAvatar image={item.image} />}
      </Top>
      {item.detail && <Detail>{item.detail}</Detail>}
      {hasFoot && (
        <Foot>
          {item.date && <Chip><MaterialIcon $size={15} aria-hidden="true">flag</MaterialIcon>{item.date}</Chip>}
          {item.progress && (
            <Chip title={`${item.progress.done} of ${item.progress.total} done`}>
              <MaterialIcon $size={15} aria-hidden="true">check_circle</MaterialIcon>
              {item.progress.done}/{item.progress.total}
            </Chip>
          )}
        </Foot>
      )}
    </Card>
  );
}

/* ── Board ── */

interface KanbanBoardProps<K extends string> {
  columns: BoardColumn<K>[];
  /** Noun for the count line and the + button's label, e.g. "goal" */
  noun: string;
  onOpen: (id: number) => void;
  /** A card dropped into another column */
  onMove: (id: number, to: K) => void;
  /** A card dropped onto another card in the same column */
  onReorder?: (id: number, overId: number) => void;
  /** The column's + button; omitted = no button */
  onAdd?: (column: K) => void;
}

export function KanbanBoard<K extends string>({ columns, noun, onOpen, onMove, onReorder, onAdd }: KanbanBoardProps<K>) {
  // Mouse drags after a small move; on touch a card is picked up by a short
  // press-and-hold, so a quick swipe still scrolls the board sideways
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOf = (id: number) => columns.find(c => c.items.some(i => i.id === id))?.key;

  // Releasing a dragged card fires a click on it — that must not open the
  // card (it would leave the board, and its filters). Clicks are ignored
  // while dragging and for a moment after the drop.
  const dragUntil = useRef(0);
  const open = useCallback((id: number) => { if (Date.now() >= dragUntil.current) onOpen(id); }, [onOpen]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    dragUntil.current = Date.now() + 300;
    if (!over) return;
    const id = Number(active.id);
    const from = columnOf(id);
    const overId = String(over.id);
    const to = overId.startsWith('col:') ? (overId.slice(4) as K) : columnOf(Number(over.id));
    if (!from || !to) return;
    if (from !== to) onMove(id, to);
    else if (!overId.startsWith('col:') && over.id !== active.id) onReorder?.(id, Number(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter}
      onDragStart={() => { dragUntil.current = Number.POSITIVE_INFINITY; }}
      onDragCancel={() => { dragUntil.current = Date.now() + 300; }}
      onDragEnd={handleDragEnd}>
      <Scroll>
        <Board $cols={columns.length}>
          {columns.map(col => (
            <DropColumn key={col.key} id={`col:${col.key}`}>
              {(over, ref) => (
                <Column ref={ref} $over={over} aria-label={col.label}>
                  <ColumnHead>
                    <ColumnTitle>{col.label}</ColumnTitle>
                    <ColumnCount>{col.items.length} {col.items.length === 1 ? 'card' : 'cards'}</ColumnCount>
                  </ColumnHead>
                  {onAdd && (
                    <AddBtn type="button" aria-label={`New ${noun} in ${col.label}`} onClick={() => onAdd(col.key)}>
                      <MaterialIcon $size={20}>add</MaterialIcon>
                    </AddBtn>
                  )}
                  <SortableContext items={col.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <Cards>
                      {col.items.length === 0
                        ? <Empty>Drop {noun}s here</Empty>
                        : col.items.map(item => <BoardCard key={item.id} item={item} onOpen={open} />)}
                    </Cards>
                  </SortableContext>
                </Column>
              )}
            </DropColumn>
          ))}
        </Board>
      </Scroll>
    </DndContext>
  );
}
