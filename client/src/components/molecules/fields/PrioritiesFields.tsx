import styled from 'styled-components';
import { Icon } from '../../atoms/core/Icon.jsx';

export interface PriorityItem { id: string; text: string; done: boolean; }
export interface PrioritiesFieldValues { priorities: PriorityItem[]; }

const Row = styled.div<{ $done?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: ${({ $done }) => $done ? 0.5 : 1};
`;

const Num = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textMuted};
  width: 14px;
  flex-shrink: 0;
`;

const CheckBtn = styled.button<{ $done?: boolean; $color: string }>`
  width: 16px;
  height: 16px;
  border: 1.5px solid ${({ $done, $color, theme }) => $done ? $color : theme.colors.border};
  border-radius: 3px;
  background: ${({ $done, $color }) => $done ? $color : 'transparent'};
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  padding: 0;
  transition: background 0.15s, border-color 0.15s;
`;

const Input = styled.input`
  flex: 1;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background: var(--paper-surface, ${({ theme }) => theme.colors.surface});
  font-size: 15px;
  font-weight: 300;
  color: ${({ theme }) => theme.colors.text};
  padding: 4px 8px;
  outline: none;
  font-family: ${({ theme }) => theme.fontFamily.sans};
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; }
  &:focus { border-color: ${({ theme }) => theme.colors.accent}; }
`;

const RemoveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: 12px;
  padding: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 300;
  color: ${({ theme }) => theme.colors.textMuted};
  padding: 4px 0;
  margin-top: 4px;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

interface Props {
  values: PrioritiesFieldValues;
  onChange: (v: PrioritiesFieldValues) => void;
  accentColor?: string;
}

export function PrioritiesFields({ values, onChange, accentColor = '#4A5568' }: Props) {
  const { priorities } = values;

  const update = (id: string, patch: Partial<PriorityItem>) =>
    onChange({ priorities: priorities.map(p => p.id === id ? { ...p, ...patch } : p) });

  const remove = (id: string) =>
    onChange({ priorities: priorities.filter(p => p.id !== id) });

  const add = () => {
    if (priorities.length >= 5) return;
    onChange({ priorities: [...priorities, { id: Date.now().toString(), text: '', done: false }] });
  };

  return (
    <Wrapper>
      {priorities.map((p, i) => (
        <Row key={p.id} $done={p.done}>
          <CheckBtn $done={p.done} $color={accentColor} onClick={() => update(p.id, { done: !p.done })}>
            {p.done && <Icon name="check" size={10} strokeWidth={2} />}
          </CheckBtn>
          <Num>{i + 1}</Num>
          <Input
            value={p.text}
            placeholder={`Priority ${i + 1}`}
            onChange={e => update(p.id, { text: e.target.value })}
          />
          <RemoveBtn onClick={() => remove(p.id)}>
            <Icon name="trash" size={12} strokeWidth={2} />
          </RemoveBtn>
        </Row>
      ))}
      {priorities.length < 5 && (
        <AddBtn onClick={add}>
          <Icon name="plus" size={12} strokeWidth={2} /> Add priority
        </AddBtn>
      )}
    </Wrapper>
  );
}
