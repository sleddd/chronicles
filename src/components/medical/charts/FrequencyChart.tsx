'use client';

import { FrequencyData } from '@/lib/utils/correlationAnalysis';

interface Props {
  data: FrequencyData[];
  title: string;
  color?: string;
}

export function FrequencyChart({ data, title, color = 'bg-teal-500' }: Props) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No data available
      </div>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count));
  const maxHeight = 120;

  const formatPeriod = (period: string) => {
    if (period.startsWith('W')) {
      // Week format: W2025-01-01
      const date = new Date(period.substring(1) + 'T12:00:00');
      return `W${Math.ceil(date.getDate() / 7)}`;
    }
    if (period.length === 7) {
      // Month format: 2025-01
      const [year, month] = period.split('-');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
    }
    // Day format: 2025-01-15
    const date = new Date(period + 'T12:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
      <div className="flex items-end gap-1 justify-between" style={{ height: maxHeight + 30 }}>
        {data.slice(-12).map((item, index) => {
          const height = maxCount > 0 ? (item.count / maxCount) * maxHeight : 0;

          return (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="relative group">
                <div
                  className={`${color} rounded-t transition-all hover:opacity-80`}
                  style={{ height: Math.max(height, 4), width: '100%', minWidth: 20 }}
                />
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {item.count}
                </div>
              </div>
              <span className="text-xs text-gray-500 mt-1 truncate w-full text-center">
                {formatPeriod(item.period)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
