import { describe, it, expect } from 'vitest';
import { missingDefaultTopics } from '@/utils/defaultTopics';
import { isScheduleTopic, SCHEDULE_TOPIC, scheduleTopicId, scheduleTopicIds, activeRoutines } from '@/utils/routines';

describe('Exercise Routine topic', () => {
  it('is the schedule topic, under its new and earlier names', () => {
    expect(SCHEDULE_TOPIC).toBe('Exercise Routine');
    for (const n of ['Exercise Routine', 'exercise schedule', 'Routines']) expect(isScheduleTopic(n)).toBe(true);
  });

  it('reads routines from every schedule topic, so a second one never hides them', () => {
    const topics = [{ id: 3, name: 'Exercise Schedule' }, { id: 4, name: 'Exercise Routine' }, { id: 5, name: 'Exercise' }];
    expect(scheduleTopicIds(topics)).toEqual([3, 4]);
    const entries = [
      { id: 10, content: '<p>Yoga</p>', metadata: { _taxonomyId: 4, _customFields: { routineName: 'Yoga', times: ['07:00'] } } },
      { id: 11, content: '<p>Walk</p>', metadata: { _taxonomyId: 5, _customFields: {} } },
    ];
    expect(activeRoutines(entries, scheduleTopicIds(topics), t => t).map(r => r.name)).toEqual(['Yoga']);
    // New routines go to the topic already holding them
    expect(scheduleTopicId(topics, entries)).toBe(4);
    expect(scheduleTopicId(topics)).toBe(3);
  });

  it('doesn\'t seed a second schedule topic for an account with an earlier name', () => {
    const names = missingDefaultTopics([{ name: 'Exercise Schedule' }]).map(t => t.name);
    expect(names).not.toContain('Exercise Routine');
  });
});
