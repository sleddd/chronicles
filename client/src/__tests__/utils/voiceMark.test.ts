import { describe, it, expect } from 'vitest';
import { parseMarkCommand } from '@/utils/voiceMark';

describe('parseMarkCommand', () => {
  it('reads medication marks', () => {
    expect(parseMarkCommand('Mark oregano oil taken')).toEqual({ kind: 'med', name: 'oregano oil' });
    expect(parseMarkCommand('mark my medication vitamin D')).toEqual({ kind: 'med', name: 'vitamin D' });
    expect(parseMarkCommand('I took my magnesium this morning')).toEqual({ kind: 'med', name: 'magnesium' });
  });

  it('reads exercise marks', () => {
    expect(parseMarkCommand('mark exercise ocean breathing')).toEqual({ kind: 'exercise', name: 'ocean breathing' });
    expect(parseMarkCommand('I did my morning yoga')).toEqual({ kind: 'exercise', name: 'morning yoga' });
    expect(parseMarkCommand('tick off evening walk as done')).toEqual({ kind: 'any', name: 'evening walk' });
  });

  it('leaves everything else to the save commands', () => {
    expect(parseMarkCommand('add task call the dentist')).toBeNull();
    expect(parseMarkCommand('log meal breakfast eggs')).toBeNull();
    expect(parseMarkCommand('mark')).toBeNull();
  });
});
