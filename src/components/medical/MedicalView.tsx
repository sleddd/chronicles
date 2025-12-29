'use client';

import { useState } from 'react';
import { MedicationsTab } from './MedicationsTab';
import { ScheduleTab } from './ScheduleTab';
import { FoodTab } from './FoodTab';
import { SymptomsTab } from './SymptomsTab';
import { ReportingTab } from './ReportingTab';

type TabKey = 'medications' | 'schedule' | 'food' | 'symptoms' | 'reporting';

interface Tab {
  key: TabKey;
  label: string;
}

interface Props {
  selectedDate: string;
}

export function MedicalView({ selectedDate }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('medications');
  const [refreshKey, setRefreshKey] = useState(0);

  const tabs: Tab[] = [
    { key: 'medications', label: 'Medications' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'food', label: 'Food' },
    { key: 'symptoms', label: 'Symptoms' },
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
      case 'reporting':
        return <ReportingTab refreshKey={refreshKey} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-indigo-600 border-b-2 border-indigo-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
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
