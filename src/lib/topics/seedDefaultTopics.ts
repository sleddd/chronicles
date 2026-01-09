'use client';

import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { generateTopicToken } from '@/lib/crypto/topicTokens';

// Core topics - always available
// Icon names must match those in IconPicker.tsx TOPIC_ICONS
const DEFAULT_TOPICS = [
  { name: 'Task', color: '#3B82F6', icon: 'circle-check' },
  { name: 'Idea', color: '#8B5CF6', icon: 'lightbulb' },
  { name: 'Research', color: '#10B981', icon: 'magnifying-glass' },
  { name: 'Event', color: '#F59E0B', icon: 'calendar' },
  { name: 'Meeting', color: '#EC4899', icon: 'users' },
  { name: 'Symptom', color: '#EF4444', icon: 'flask' },
  { name: 'Music', color: '#EC4899', icon: 'music' },
  { name: 'Books', color: '#8B5CF6', icon: 'book' },
  { name: 'TV/Movies', color: '#F59E0B', icon: 'film' },
];

// Optional feature topics - only added when enabled in settings
// Icon names must match those in IconPicker.tsx TOPIC_ICONS
export const FEATURE_TOPICS = {
  food: { name: 'Food', color: '#EF4444', icon: 'utensils', description: 'Track meals and nutrition' },
  medication: { name: 'Medication', color: '#14B8A6', icon: 'pills', description: 'Track medications and health' },
  goals: { name: 'Goal', color: '#F97316', icon: 'bullseye', description: 'Set and track goals' },
  milestones: { name: 'Milestone', color: '#A855F7', icon: 'flag', description: 'Mark important achievements' },
  exercise: { name: 'Exercise', color: '#22C55E', icon: 'dumbbell', description: 'Track workouts and fitness' },
  allergies: { name: 'Allergy and Sensitivities', color: '#F59E0B', icon: 'triangle-exclamation', description: 'Track allergies and reactions' },
} as const;

export type FeatureTopicKey = keyof typeof FEATURE_TOPICS;

export async function seedDefaultTopics(encryptionKey: CryptoKey): Promise<boolean> {
  try {
    // Fetch existing topics
    const response = await fetch('/api/topics');
    if (!response.ok) {
      console.error('Failed to fetch topics:', response.status, response.statusText);
      throw new Error(`Failed to fetch topics: ${response.status}`);
    }

    const data = await response.json();
    const existingTopics: Array<{ nameToken: string; encryptedName: string; iv: string }> = data.topics || [];

    // Check which default topics already exist by looking up their nameToken
    const existingTokens = new Set(existingTopics.map((t) => t.nameToken));

    // Also decrypt all existing topic names for case-insensitive comparison
    // This handles topics that may have been created with different casing
    const existingNamesLower = new Set<string>();
    for (const topic of existingTopics) {
      try {
        const decryptedName = await decrypt(topic.encryptedName, topic.iv, encryptionKey);
        existingNamesLower.add(decryptedName.toLowerCase().trim());
      } catch {
        // Skip topics that fail to decrypt
      }
    }

    // Filter to only topics that don't exist yet (check both token and case-insensitive name)
    const topicsToCreate = [];
    for (const topic of DEFAULT_TOPICS) {
      const token = await generateTopicToken(topic.name, encryptionKey);
      const nameLower = topic.name.toLowerCase().trim();

      // Skip if token matches OR if name matches (case-insensitive)
      if (existingTokens.has(token) || existingNamesLower.has(nameLower)) {
        continue;
      }
      topicsToCreate.push({ ...topic, nameToken: token });
    }

    if (topicsToCreate.length === 0) {
      console.log('All default topics already exist');
      return false;
    }

    // Seed missing default topics
    console.log(`Adding ${topicsToCreate.length} missing default topics...`);
    for (const topic of topicsToCreate) {
      const { ciphertext, iv } = await encrypt(topic.name, encryptionKey);

      const createResponse = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encryptedName: ciphertext,
          iv,
          nameToken: topic.nameToken,
          color: topic.color,
          icon: topic.icon,
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        console.error('Failed to create topic:', topic.name, errorData);
        throw new Error(`Failed to create topic ${topic.name}: ${createResponse.status}`);
      }

      console.log('Created topic:', topic.name);
    }

    return true;
  } catch (error) {
    console.error('Failed to seed default topics:', error);
    throw error;
  }
}

// Add a feature topic when user enables it in settings
export async function addFeatureTopic(
  featureKey: FeatureTopicKey,
  encryptionKey: CryptoKey
): Promise<boolean> {
  const feature = FEATURE_TOPICS[featureKey];
  if (!feature) {
    throw new Error(`Unknown feature topic: ${featureKey}`);
  }

  try {
    // Check if topic already exists
    const response = await fetch('/api/topics');
    if (!response.ok) {
      throw new Error(`Failed to fetch topics: ${response.status}`);
    }

    const data = await response.json();
    const existingTopics: Array<{ nameToken: string; encryptedName: string; iv: string }> = data.topics || [];
    const existingTokens = new Set(existingTopics.map((t) => t.nameToken));

    // Also decrypt all existing topic names for case-insensitive comparison
    const existingNamesLower = new Set<string>();
    for (const topic of existingTopics) {
      try {
        const decryptedName = await decrypt(topic.encryptedName, topic.iv, encryptionKey);
        existingNamesLower.add(decryptedName.toLowerCase().trim());
      } catch {
        // Skip topics that fail to decrypt
      }
    }

    const token = await generateTopicToken(feature.name, encryptionKey);
    const nameLower = feature.name.toLowerCase().trim();

    // Skip if token matches OR if name matches (case-insensitive)
    if (existingTokens.has(token) || existingNamesLower.has(nameLower)) {
      console.log(`Feature topic ${feature.name} already exists`);
      return false;
    }

    // Create the topic
    const { ciphertext, iv } = await encrypt(feature.name, encryptionKey);

    const createResponse = await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encryptedName: ciphertext,
        iv,
        nameToken: token,
        color: feature.color,
        icon: feature.icon,
      }),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('Failed to create feature topic:', feature.name, errorData);
      throw new Error(`Failed to create topic ${feature.name}: ${createResponse.status}`);
    }

    console.log('Created feature topic:', feature.name);
    return true;
  } catch (error) {
    console.error('Failed to add feature topic:', error);
    throw error;
  }
}
