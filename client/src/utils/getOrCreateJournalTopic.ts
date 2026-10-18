import { topics as topicsApi } from '../services/api.js';
import { useEntriesStore } from '../stores/entriesStore.js';

/** Returns the id of the topic with this name (any case), creating it with `icon` if it doesn't exist. */
export async function getOrCreateTopic(name: string, icon: string): Promise<number> {
  const { allTopics, setTopics } = useEntriesStore.getState();
  let topic = allTopics.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (!topic) {
    topic = await topicsApi.create({ name, icon });
    setTopics([...allTopics, topic]);
  }
  return topic.id;
}

/** Returns the id of the "Journal" topic, creating it if it doesn't exist. */
export async function getOrCreateJournalTopic(): Promise<number> {
  return getOrCreateTopic('Journal', 'book');
}
