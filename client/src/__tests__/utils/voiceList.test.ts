import { describe, it, expect } from 'vitest';
import { parseListItemCommand } from '@/utils/voiceList';

describe('parseListItemCommand', () => {
  it('crosses an item off a list named however it\'s said', () => {
    expect(parseListItemCommand("Cross laundry off to-do list titled my to do's")).toEqual(
      { action: 'check', item: 'laundry', list: "my to do's", shopping: false, priorities: false, saidList: true });
    expect(parseListItemCommand("cross off laundry from my to do's")).toMatchObject({ item: 'laundry', list: "my to do's", saidList: true });
    expect(parseListItemCommand('tick off the dishes on the to-do list')).toMatchObject({ item: 'the dishes', list: '', saidList: true });
    expect(parseListItemCommand('check eggs off the shopping list')).toMatchObject({ action: 'check', item: 'eggs', list: '', shopping: true });
    expect(parseListItemCommand('cross raspberries off active shopping list')).toEqual(
      { action: 'check', item: 'raspberries', list: '', shopping: true, priorities: false, saidList: true });
    expect(parseListItemCommand('cross bread off the current to-do list')).toMatchObject({ list: '', shopping: false });
  });

  it('adds an item to a list', () => {
    expect(parseListItemCommand('add milk to to-do list groceries')).toEqual(
      { action: 'add', item: 'milk', list: 'groceries', shopping: false, priorities: false, saidList: true });
    expect(parseListItemCommand('add eggs to my shopping list')).toMatchObject({ item: 'eggs', list: '', shopping: true });
    expect(parseListItemCommand('add towels to packing')).toMatchObject({ item: 'towels', list: 'packing', saidList: false });
  });

  it('leaves other sentences alone', () => {
    expect(parseListItemCommand('add task call the dentist')).toBeNull();
    expect(parseListItemCommand('mark oregano oil taken')).toBeNull();
  });

  it('adds to and crosses off today\'s priorities', () => {
    const pri = { list: '', shopping: false, priorities: true, saidList: true };
    expect(parseListItemCommand('add priority call the bank')).toEqual({ action: 'add', item: 'call the bank', ...pri });
    expect(parseListItemCommand('add a new priority finish the report')).toMatchObject({ action: 'add', item: 'finish the report', priorities: true });
    expect(parseListItemCommand('add call the bank to my priorities')).toEqual({ action: 'add', item: 'call the bank', ...pri });
    expect(parseListItemCommand("cross call the bank off today's priorities")).toEqual({ action: 'check', item: 'call the bank', ...pri });
    expect(parseListItemCommand('mark priority call the bank done')).toEqual({ action: 'check', item: 'call the bank', ...pri });
  });
});

