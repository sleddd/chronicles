import { describe, it, expect } from 'vitest';
import { CALC_START, pressCalc, showCalc, calcKeyFor, type CalcKey } from '../../utils/calculator';

const run = (keys: CalcKey[]) => keys.reduce(pressCalc, CALC_START);

describe('calculator', () => {
  it('adds, subtracts, multiplies and divides', () => {
    expect(run(['1', '2', '+', '8', '=']).display).toBe('20');
    expect(run(['5', '-', '9', '=']).display).toBe('-4');
    expect(run(['6', '×', '7', '=']).display).toBe('42');
    expect(run(['1', '÷', '4', '=']).display).toBe('0.25');
  });

  it('chains operators left to right', () => {
    const s = run(['2', '+', '3', '×']);
    expect(s.display).toBe('5');
    expect(run(['2', '+', '3', '×', '4', '=']).display).toBe('20');
  });

  it('swaps an operator pressed twice', () => {
    expect(run(['9', '+', '-', '4', '=']).display).toBe('5');
  });

  it('tidies floating-point noise', () => {
    expect(run(['0', '.', '1', '+', '0', '.', '2', '=']).display).toBe('0.3');
  });

  it('shows Error on divide by zero and recovers', () => {
    expect(run(['8', '÷', '0', '=']).display).toBe('Error');
    expect(run(['8', '÷', '0', '=', '3']).display).toBe('3');
  });

  it('backspaces, clears and takes a percent', () => {
    expect(run(['1', '2', '3', '⌫']).display).toBe('12');
    expect(run(['1', '2', 'C']).display).toBe('0');
    expect(run(['5', '0', '%']).display).toBe('0.5');
    expect(run(['1', '.', '.', '5']).display).toBe('1.5');
  });

  it('writes the sum above the figure', () => {
    expect(run(['1', '2', '0', '+', '3', '0', '=']).trail).toBe('120 + 30 =');
  });

  it('groups thousands for the screen', () => {
    expect(showCalc('1234567.5')).toBe('1,234,567.5');
    expect(showCalc('-1200')).toBe('-1,200');
  });

  it('maps keyboard keys', () => {
    expect(calcKeyFor('*')).toBe('×');
    expect(calcKeyFor('/')).toBe('÷');
    expect(calcKeyFor('Enter')).toBe('=');
    expect(calcKeyFor('q')).toBeNull();
  });
});
