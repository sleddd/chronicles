import styled from 'styled-components';

/** Keeps a unit's own casing inside a capitalized field label: "Iron (mg)", not "Iron (Mg)". */
const Unit = styled.span`
  text-transform: none;
  color: var(--text-tertiary);
`;

export function UnitLabel({ label, unit }: { label: string; unit?: string }) {
  return <>{label}{unit ? <> <Unit>({unit})</Unit></> : null}</>;
}
