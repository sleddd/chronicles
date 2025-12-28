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

    setIsChangingPassword(true);

    try {
      const response = await fetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully. You will be signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Sign out after password change
      setTimeout(() => {
        signOut({ callbackUrl: '/login' });
      }, 2000);
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
        <Link href="/" className="text-sm text-indigo-600 hover:text-indigo-800">
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
                className="text-sm text-indigo-600 hover:text-indigo-800"
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
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:bg-gray-400"
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
                className="text-sm text-indigo-600 hover:text-indigo-800"
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
                      isEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                    } ${(isToggling || !isKeyReady) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
              className="px-4 py-2 text-sm text-indigo-600 border border-indigo-300 rounded-md hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
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
