'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAccentColor } from '@/lib/hooks/useAccentColor';
import { MedicationsTab } from './MedicationsTab';
import { ScheduleTab } from './ScheduleTab';
import { FoodTab } from './FoodTab';
import { SymptomsTab } from './SymptomsTab';
import { ExerciseTab } from './ExerciseTab';
import { ReportingTab } from './ReportingTab';

type TabKey = 'medications' | 'schedule' | 'food' | 'symptoms' | 'exercise' | 'reporting';

interface Tab {
  key: TabKey;
  label: string;
}

interface Props {
  selectedDate: string;
}

const validTabs: TabKey[] = ['medications', 'schedule', 'food', 'symptoms', 'exercise', 'reporting'];

export function HealthView({ selectedDate }: Props) {
  const searchParams = useSearchParams();
  const { accentColor } = useAccentColor();
  const tabParam = searchParams.get('tab');
  const initialTab = validTabs.includes(tabParam as TabKey) ? (tabParam as TabKey) : 'medications';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam as TabKey)) {
      setActiveTab(tabParam as TabKey);
    }
  }, [tabParam]);
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: Tab[] = [
    { key: 'medications', label: 'Medications List' },
    { key: 'schedule', label: 'Medication Schedule' },
    { key: 'food', label: 'Food' },
    { key: 'symptoms', label: 'Symptoms' },
    { key: 'exercise', label: 'Exercise' },
    { key: 'reporting', label: 'Reporting' },
  ];

  const handleDataChange = () => {
    setRefreshKey((k) => k + 1);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'medications':
        return <MedicationsTab onDataChange={handleDataChange} refreshKey={refreshKey} />;
      case 'schedule':
        return <ScheduleTab selectedDate={selectedDate} refreshKey={refreshKey} onDataChange={handleDataChange} />;
      case 'food':
        return <FoodTab selectedDate={selectedDate} onDataChange={handleDataChange} refreshKey={refreshKey} />;
      case 'symptoms':
        return <SymptomsTab selectedDate={selectedDate} onDataChange={handleDataChange} refreshKey={refreshKey} />;
      case 'exercise':
        return <ExerciseTab selectedDate={selectedDate} onDataChange={handleDataChange} refreshKey={refreshKey} />;
      case 'reporting':
        return <ReportingTab refreshKey={refreshKey} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col backdrop-blur-sm bg-white/30">
      {/* Tab Navigation */}
      <div className="backdrop-blur-sm bg-white/30 border-b border-border px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
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
        {renderTabContent()}
      </div>
    </div>
  );
}
