'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { TopicEntriesTab } from '@/components/shared/TopicEntriesTab';

type TabKey = 'research' | 'ideas';

interface Tab {
  key: TabKey;
  label: string;
  topicName: string;
}

const validTabs: TabKey[] = ['research', 'ideas'];

export function InspirationView() {
  const searchParams = useSearchParams();
  const { accentColor } = useAccentColor();
  const tabParam = searchParams.get('tab');
  const initialTab = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'research';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam as TabKey)) {
      setActiveTab(tabParam as TabKey);
    }
  }, [tabParam]);

  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: Tab[] = [
    { key: 'research', label: 'Research', topicName: 'Research' },
    { key: 'ideas', label: 'Ideas', topicName: 'Idea' },
  ];

  const handleDataChange = () => {
    setRefreshKey((k) => k + 1);
  };

  const activeTabConfig = tabs.find((t) => t.key === activeTab);

  return (
    <div className="h-full flex flex-col backdrop-blur-md bg-white/70">
      {/* Tab Navigation */}
      <div className="backdrop-blur-md bg-white/50 border-b border-border px-4 overflow-x-auto">
        <div className="flex gap-1 min-w-max md:min-w-0 md:flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-b-2 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              style={activeTab === tab.key ? { color: accentColor, borderColor: accentColor } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTabConfig && (
          <TopicEntriesTab
            topicName={activeTabConfig.topicName}
            refreshKey={refreshKey}
            onDataChange={handleDataChange}
          />
        )}
      </div>
    </div>
  );
}
