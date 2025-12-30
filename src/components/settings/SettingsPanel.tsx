'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useEncryption } from '@/lib/hooks/useEncryption';
import { seedDefaultTopics, addFeatureTopic, FEATURE_TOPICS, FeatureTopicKey } from '@/lib/topics/seedDefaultTopics';

interface FeatureSettings {
  foodEnabled: boolean;
  medicationEnabled: boolean;
  goalsEnabled: boolean;
  milestonesEnabled: boolean;
  timezone: string;
}

// Common timezones for the dropdown
const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PST)' },
  { value: 'America/Denver', label: 'Mountain Time (MST)' },
  { value: 'America/Chicago', label: 'Central Time (CST)' },
  { value: 'America/New_York', label: 'Eastern Time (EST)' },
  { value: 'America/Sao_Paulo', label: 'São Paulo (BRT)' },
  { value: 'Atlantic/Reykjavik', label: 'Iceland (GMT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Europe/Moscow', label: 'Moscow (MSK)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (ICT)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Seoul', label: 'Seoul (KST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZDT)' },
  { value: 'UTC', label: 'UTC' },
];

export function SettingsPanel() {
  const { data: session } = useSession();
  const { isKeyReady } = useEncryption();
  const [showHowToUse, setShowHowToUse] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [sessions, setSessions] = useState<Array<{
    id: string;
    deviceInfo: string | null;
    lastActiveAt: string;
    createdAt: string;
  }>>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showSessions, setShowSessions] = useState(false);

  const [seedingTopics, setSeedingTopics] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  // Feature settings
  const [featureSettings, setFeatureSettings] = useState<FeatureSettings>({
    foodEnabled: false,
    medicationEnabled: false,
    goalsEnabled: false,
    milestonesEnabled: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [togglingFeature, setTogglingFeature] = useState<FeatureTopicKey | null>(null);
  const [savingTimezone, setSavingTimezone] = useState(false);

  const loadFeatureSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.settings) {
        setFeatureSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load feature settings:', error);
    } finally {
      setLoadingFeatures(false);
    }
  }, []);

  useEffect(() => {
    loadFeatureSettings();
  }, [loadFeatureSettings]);

  const handleToggleFeature = async (featureKey: FeatureTopicKey) => {
    if (!isKeyReady) return;

    const settingKey = `${featureKey}Enabled` as keyof FeatureSettings;
    const currentValue = featureSettings[settingKey];
    const newValue = !currentValue;

    setTogglingFeature(featureKey);

    try {
      // If enabling, create the topic first
      if (newValue) {
        const { encryptionKey } = useEncryption.getState();
        if (encryptionKey) {
          await addFeatureTopic(featureKey, encryptionKey);
        }
      }

      // Update the setting
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [settingKey]: newValue }),
      });

      if (response.ok) {
        setFeatureSettings((prev) => ({ ...prev, [settingKey]: newValue }));
      }
    } catch (error) {
      console.error('Failed to toggle feature:', error);
    } finally {
      setTogglingFeature(null);
    }
  };

  const handleTimezoneChange = async (newTimezone: string) => {
    setSavingTimezone(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: newTimezone }),
      });

      if (response.ok) {
        setFeatureSettings((prev) => ({ ...prev, timezone: newTimezone }));
      }
    } catch (error) {
      console.error('Failed to update timezone:', error);
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleSeedTopics = async () => {
    if (!isKeyReady) {
      setSeedResult('Encryption key not ready. Please refresh and re-enter your password.');
      return;
    }

    setSeedingTopics(true);
    setSeedResult(null);

    try {
      const { encryptionKey } = useEncryption.getState();
      if (!encryptionKey) {
        throw new Error('No encryption key');
      }

      // Seed core default topics
      const seededDefault = await seedDefaultTopics(encryptionKey);

      // Also seed enabled feature topics that might be missing
      const featureResults: string[] = [];
      const featureKeys: FeatureTopicKey[] = ['food', 'medication', 'goals', 'milestones'];

      for (const featureKey of featureKeys) {
        const settingKey = `${featureKey}Enabled` as keyof FeatureSettings;
        if (featureSettings[settingKey]) {
          try {
            const added = await addFeatureTopic(featureKey, encryptionKey);
            if (added) {
              featureResults.push(FEATURE_TOPICS[featureKey].name);
            }
          } catch (err) {
            console.error(`Failed to add feature topic ${featureKey}:`, err);
          }
        }
      }

      // Build result message
      const messages: string[] = [];
      if (seededDefault) {
        messages.push('Default topics created');
      }
      if (featureResults.length > 0) {
        messages.push(`Feature topics added: ${featureResults.join(', ')}`);
      }

      if (messages.length > 0) {
        setSeedResult(messages.join('. ') + '!');
      } else {
        setSeedResult('All topics already exist. No new topics were created.');
      }
    } catch (error) {
      console.error('Failed to seed topics:', error);
      setSeedResult('Failed to create default topics. Check console for details.');
    } finally {
      setSeedingTopics(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError('Password must be at least 12 characters');
      return;
    }

    if (!isKeyReady) {
      setPasswordError('Encryption key not available. Please re-enter your password.');
      return;
    }

    setIsChangingPassword(true);

    try {
      // Get the current encryption key from the store
      const { encryptionKey, decryptData } = useEncryption.getState();
      if (!encryptionKey) {
        throw new Error('Encryption key not available');
      }

      // Get the user's salt for key derivation
      const saltResponse = await fetch('/api/user/salt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session?.user?.email }),
      });

      if (!saltResponse.ok) {
        throw new Error('Failed to get salt for key derivation');
      }

      const { salt } = await saltResponse.json();

      // Derive new key from new password
      const { deriveKey } = await import('@/lib/crypto/keyDerivation');
      const newKey = await deriveKey(newPassword, salt);

      // Fetch all encrypted data
      setPasswordSuccess('Fetching encrypted data...');
      const dataResponse = await fetch('/api/user/reencrypt');
      if (!dataResponse.ok) {
        throw new Error('Failed to fetch encrypted data');
      }

      const { entries, topics, customFields } = await dataResponse.json();

      // Import encryption functions
      const { encrypt, decrypt } = await import('@/lib/crypto/encryption');

      // Re-encrypt all entries
      setPasswordSuccess(`Re-encrypting ${entries.length} entries...`);
      const reencryptedEntries = await Promise.all(
        entries.map(async (entry: { id: string; encryptedContent: string; iv: string }) => {
          try {
            // Decrypt with old key
            const decrypted = await decrypt(entry.encryptedContent, entry.iv, encryptionKey);
            // Re-encrypt with new key
            const { ciphertext, iv } = await encrypt(decrypted, newKey);
            return { id: entry.id, encryptedContent: ciphertext, iv };
          } catch (err) {
            console.error(`Failed to re-encrypt entry ${entry.id}:`, err);
            throw new Error(`Failed to re-encrypt entry: ${entry.id}`);
          }
        })
      );

      // Re-encrypt all topics
      setPasswordSuccess(`Re-encrypting ${topics.length} topics...`);
      const reencryptedTopics = await Promise.all(
        topics.map(async (topic: { id: string; encryptedName: string; iv: string }) => {
          try {
            const decrypted = await decrypt(topic.encryptedName, topic.iv, encryptionKey);
            const { ciphertext, iv } = await encrypt(decrypted, newKey);
            return { id: topic.id, encryptedName: ciphertext, iv };
          } catch (err) {
            console.error(`Failed to re-encrypt topic ${topic.id}:`, err);
            throw new Error(`Failed to re-encrypt topic: ${topic.id}`);
          }
        })
      );

      // Re-encrypt all custom fields
      setPasswordSuccess(`Re-encrypting ${customFields.length} custom fields...`);
      const reencryptedCustomFields = await Promise.all(
        customFields.map(async (cf: { id: string; encryptedData: string; iv: string }) => {
          try {
            const decrypted = await decrypt(cf.encryptedData, cf.iv, encryptionKey);
            const { ciphertext, iv } = await encrypt(decrypted, newKey);
            return { id: cf.id, encryptedData: ciphertext, iv };
          } catch (err) {
            console.error(`Failed to re-encrypt custom field ${cf.id}:`, err);
            throw new Error(`Failed to re-encrypt custom field: ${cf.id}`);
          }
        })
      );

      // Send all re-encrypted data to server
      setPasswordSuccess('Saving re-encrypted data...');
      const response = await fetch('/api/user/reencrypt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          entries: reencryptedEntries,
          topics: reencryptedTopics,
          customFields: reencryptedCustomFields,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save re-encrypted data');
      }

      const result = await response.json();
      setPasswordSuccess(
        `Password changed! Re-encrypted ${result.entriesUpdated} entries, ${result.topicsUpdated} topics. Signing out...`
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Sign out after password change
      setTimeout(() => {
        signOut({ callbackUrl: '/login' });
      }, 3000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const response = await fetch('/api/sessions');
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleShowSessions = () => {
    setShowSessions(true);
    loadSessions();
  };

  const revokeSession = async (sessionId: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}/revoke`, { method: 'POST' });
      loadSessions();
    } catch (error) {
      console.error('Failed to revoke session:', error);
    }
  };

  const revokeAllSessions = async () => {
    if (!confirm('This will sign you out of all devices. Continue?')) return;

    try {
      await fetch('/api/sessions/revoke-all', { method: 'POST' });
      signOut({ callbackUrl: '/login' });
    } catch (error) {
      console.error('Failed to revoke sessions:', error);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white min-h-full">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <Link href="/" className="text-sm hover:underline" style={{ color: '#1aaeae' }}>
          Back to Journal
        </Link>
      </div>

      {/* Account Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Account</h2>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="font-medium text-gray-900">{session?.user?.email}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How to Use Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">How to Use Chronicles</h2>
        <div className="bg-white border rounded-lg">
          <button
            onClick={() => setShowHowToUse(!showHowToUse)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div>
              <p className="font-medium text-gray-900">Getting Started Guide</p>
              <p className="text-sm text-gray-500">Learn how to use Chronicles effectively</p>
            </div>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${showHowToUse ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showHowToUse && (
            <div className="px-4 pb-4 space-y-6 text-sm text-gray-700 border-t">
              {/* Philosophy */}
              <div className="pt-4">
                <h3 className="font-semibold text-gray-900 mb-2">The Philosophy</h3>
                <p className="mb-2">
                  Chronicles is designed as a simple daily log. The goal is to capture the key moments
                  of your day briefly (10-15 minutes), then use topics to organize and find them later.
                </p>
                <p className="text-amber-700 bg-amber-50 p-2 rounded">
                  <strong>Important:</strong> You can only add entries for today or edit past entries.
                  Future dates cannot have entries. This keeps Chronicles focused as a record of what
                  happened, not a planning tool.
                </p>
              </div>

              {/* Topics */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Topics</h3>
                <p className="mb-2">Topics categorize your entries like tags or folders.</p>
                <p className="mb-2"><strong>To create a topic:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2 mb-3">
                  <li>Click &quot;Browse Topics&quot; in the sidebar</li>
                  <li>Click &quot;+ Add Topic&quot;</li>
                  <li>Enter a name, choose an icon and color</li>
                  <li>Click &quot;Create Topic&quot;</li>
                </ol>
                <p className="mb-2"><strong>Built-in topics with special features:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Task</strong> - Todo items with completion tracking and auto-migration</li>
                  <li><strong>Goal</strong> - Long-term objectives with milestone progress</li>
                  <li><strong>Milestone</strong> - Checkpoints within goals</li>
                  <li><strong>Medication</strong> - Medication schedules and dose tracking</li>
                  <li><strong>Food</strong> - Meal logging with ingredients</li>
                  <li><strong>Symptom</strong> - Health symptom tracking with severity</li>
                  <li><strong>Event</strong> - Calendar events with date/time/location</li>
                  <li><strong>Meeting</strong> - Meetings with attendees and agenda</li>
                </ul>
              </div>

              {/* Entries */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Entries</h3>
                <p className="mb-2"><strong>Creating an entry:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-2 mb-3">
                  <li>Select a topic from the sidebar</li>
                  <li>Type your content in the editor</li>
                  <li>Use the toolbar for formatting</li>
                  <li>Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Enter</kbd> or click Save</li>
                </ol>
                <p className="mb-2"><strong>Entry features:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Expand Entry</strong> - Default limit is 200 characters. Check &quot;Expand entry&quot; for longer notes.</li>
                  <li><strong>Bookmark</strong> - Mark important entries for quick access in Favorites</li>
                  <li><strong>Share</strong> - Generate a secure public link to share an entry</li>
                </ul>
                <p className="mt-2 text-gray-500">
                  Tip: <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">Shift+Enter</kbd> creates a new line without saving.
                </p>
              </div>

              {/* Tasks */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Tasks</h3>
                <p className="mb-2">Tasks are actionable items with special options:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Completed</strong> - Check when done</li>
                  <li><strong>Auto-migrate</strong> - Uncompleted tasks automatically move to today at midnight</li>
                  <li><strong>Link to Milestones</strong> - Connect tasks to milestones to track goal progress</li>
                </ul>
              </div>

              {/* Goals & Milestones */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Goals &amp; Milestones</h3>
                <p className="mb-2"><strong>Goals</strong> are larger objectives with:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                  <li><strong>Type</strong> - Short-term or Long-term</li>
                  <li><strong>Status</strong> - Active, Completed, or Archived</li>
                  <li><strong>Target Date</strong> - Optional deadline</li>
                  <li><strong>Progress</strong> - Automatically calculated from milestones</li>
                </ul>
                <p className="mb-2"><strong>Milestones</strong> are checkpoints within goals:</p>
                <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                  <li>Link milestones to one or more goals</li>
                  <li>Link tasks to milestones to track progress</li>
                  <li>Goal progress updates as milestones are completed</li>
                </ul>
                <p className="text-gray-500">
                  The Goals view lets you see all goals, drag to reorder priorities, and track progress at a glance.
                </p>
              </div>

              {/* Medical Tracking */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Medical Tracking</h3>
                <p className="mb-2">Enable medical features in the Features section below to track:</p>
                <p className="mb-2"><strong>Medications:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                  <li>Set dosage, frequency, and schedule times</li>
                  <li>Log doses when taken</li>
                  <li>View today&apos;s medication schedule</li>
                </ul>
                <p className="mb-2"><strong>Food:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                  <li>Log meals with meal type and time</li>
                  <li>Track ingredients for correlation analysis</li>
                </ul>
                <p className="mb-2"><strong>Symptoms:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                  <li>Track severity (1-10 scale)</li>
                  <li>Log time and duration</li>
                  <li>Use reporting to find patterns with food and medications</li>
                </ul>
              </div>

              {/* Calendar & Views */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Views</h3>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Calendar</strong> - Monthly overview of all entries. Click any day to view entries.</li>
                  <li><strong>Goals</strong> - Manage goals with drag-and-drop priority ordering</li>
                  <li><strong>Medical</strong> - Dashboard for medications, doses, food, symptoms, and reports</li>
                  <li><strong>Favorites</strong> - Quick access to bookmarked entries</li>
                </ul>
              </div>

              {/* Encryption Notice */}
              <div className="bg-teal-50 p-3 rounded border border-teal-200">
                <p className="text-teal-800">
                  <strong>Your data is encrypted</strong> in your browser before being sent to the server.
                  Only you can read your entries. If you lose your password, your data cannot be recovered.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Preferences Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Preferences</h2>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Timezone</p>
              <p className="text-sm text-gray-500">Used to determine the current day for journal entries</p>
            </div>
            <div className="flex items-center gap-2">
              {savingTimezone && <span className="text-xs text-gray-400">Saving...</span>}
              <select
                value={featureSettings.timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                disabled={savingTimezone || loadingFeatures}
                className="px-3 py-2 border rounded-md text-sm bg-white text-gray-900 disabled:opacity-50"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
                {/* Include user's timezone if not in list */}
                {!TIMEZONES.find((tz) => tz.value === featureSettings.timezone) && (
                  <option value={featureSettings.timezone}>
                    {featureSettings.timezone}
                  </option>
                )}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Security</h2>

        <div className="bg-white border rounded-lg divide-y">
          {/* Change Password */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Password</p>
                <p className="text-sm text-gray-500">Change your account password</p>
              </div>
              <button
                onClick={() => setShowChangePassword(!showChangePassword)}
                className="text-sm hover:underline"
                style={{ color: '#1aaeae' }}
              >
                {showChangePassword ? 'Cancel' : 'Change'}
              </button>
            </div>

            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    required
                    minLength={12}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white text-gray-900"
                    required
                  />
                </div>

                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600">{passwordSuccess}</p>
                )}

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="px-4 py-2 text-white text-sm rounded-md disabled:bg-gray-400"
                  style={{ backgroundColor: isChangingPassword ? undefined : '#1aaeae' }}
                  onMouseOver={(e) => { if (!isChangingPassword) e.currentTarget.style.backgroundColor = '#158f8f'; }}
                  onMouseOut={(e) => { if (!isChangingPassword) e.currentTarget.style.backgroundColor = '#1aaeae'; }}
                >
                  {isChangingPassword ? 'Changing...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>

          {/* Active Sessions */}
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Active Sessions</p>
                <p className="text-sm text-gray-500">Manage your logged-in devices</p>
              </div>
              <button
                onClick={handleShowSessions}
                className="text-sm hover:underline"
                style={{ color: '#1aaeae' }}
              >
                {showSessions ? 'Refresh' : 'View'}
              </button>
            </div>

            {showSessions && (
              <div className="mt-4">
                {loadingSessions ? (
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      {sessions.map((sess) => (
                        <div key={sess.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{sess.deviceInfo || 'Unknown device'}</p>
                            <p className="text-xs text-gray-500">
                              Last active: {new Date(sess.lastActiveAt).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => revokeSession(sess.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={revokeAllSessions}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Sign out of all devices
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Features</h2>
        <p className="text-sm text-gray-500 mb-4">Enable optional topics for specialized tracking</p>

        <div className="bg-white border rounded-lg divide-y">
          {loadingFeatures ? (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          ) : (
            (Object.keys(FEATURE_TOPICS) as FeatureTopicKey[]).map((featureKey) => {
              const feature = FEATURE_TOPICS[featureKey];
              const settingKey = `${featureKey}Enabled` as keyof FeatureSettings;
              const isEnabled = featureSettings[settingKey];
              const isToggling = togglingFeature === featureKey;

              return (
                <div key={featureKey} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: feature.color }}
                    />
                    <div>
                      <p className="font-medium text-gray-900">{feature.name}</p>
                      <p className="text-sm text-gray-500">{feature.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggleFeature(featureKey)}
                    disabled={isToggling || !isKeyReady}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isEnabled ? '' : 'bg-gray-200'
                    } ${(isToggling || !isKeyReady) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={isEnabled ? { backgroundColor: '#1aaeae' } : undefined}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Data Section */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Data</h2>
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Default Topics</p>
              <p className="text-sm text-gray-500">Create default journal topics if missing</p>
            </div>
            <button
              onClick={handleSeedTopics}
              disabled={seedingTopics || !isKeyReady}
              className="px-4 py-2 text-sm border rounded-md hover:bg-teal-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
              style={{ color: seedingTopics || !isKeyReady ? undefined : '#1aaeae', borderColor: seedingTopics || !isKeyReady ? undefined : '#1aaeae' }}
            >
              {seedingTopics ? 'Adding...' : 'Add Default Topics'}
            </button>
          </div>
          {seedResult && (
            <p className={`mt-3 text-sm ${seedResult.includes('successfully') ? 'text-green-600' : seedResult.includes('already') ? 'text-gray-600' : 'text-red-600'}`}>
              {seedResult}
            </p>
          )}
        </div>
      </section>

      {/* Privacy Notice */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Privacy</h2>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            <strong>Zero-Knowledge Encryption:</strong> Your journal entries are encrypted
            in your browser before being sent to the server. We cannot read your data.
            If you lose your password, your data cannot be recovered.
          </p>
        </div>
      </section>

      {/* Danger Zone */}
      <section>
        <h2 className="text-lg font-medium text-red-600 mb-4">Danger Zone</h2>
        <div className="bg-white border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Sign Out</p>
              <p className="text-sm text-gray-500">Sign out of your account on this device</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
