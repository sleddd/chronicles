import { useState, type ComponentProps } from 'react';
import { Icon } from '../atoms/core/Icon.jsx';
import { FoldableBox, FoldBtn } from '../molecules/DashPanel.js';

export { DashPanelHead } from '../molecules/DashPanel.js';

/* The Health dashboard's panels, foldable like the home dashboard's cards: a chevron at
   the top right folds a panel to its title row. Which ones are folded is remembered per
   browser, by the panel's label */
const KEY = 'health-panels-folded-v1';

function readFolded(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}

function writeFolded(set: Set<string>) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode: not remembered */ }
}

type Props = ComponentProps<'section'> & { 'aria-label'?: string; className?: string };

export function DashPanel({ children, ...rest }: Props) {
  const label = rest['aria-label'];
  const [folded, setFolded] = useState(() => (label ? readFolded().has(label) : false));
  if (!label) return <FoldableBox $folded={false} {...rest}>{children}</FoldableBox>;
  const toggle = () => {
    const set = readFolded();
    if (folded) set.delete(label); else set.add(label);
    writeFolded(set);
    setFolded(!folded);
  };
  return (
    <FoldableBox $folded={folded} {...rest}>
      {children}
      <FoldBtn type="button" data-fold-btn="" $folded={folded} aria-expanded={!folded}
        aria-label={folded ? `Show ${label}` : `Fold ${label}`} onClick={toggle}>
        <Icon name="chevron-down" size={18} strokeWidth={1.8} />
      </FoldBtn>
    </FoldableBox>
  );
}
