'use client';

import { CorrelationResult } from '@/lib/utils/correlationAnalysis';

interface Props {
  data: CorrelationResult[];
  title: string;
}

export function CorrelationChart({ data, title }: Props) {
  if (data.length === 0) {
    return (
      <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
        <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
        <div className="text-center py-8 text-gray-400">
          No correlations detected yet. Keep logging food, symptoms, and medications to find patterns.
        </div>
      </div>
    );
  }

  const getCorrelationColor = (correlation: number) => {
    if (correlation >= 75) return 'bg-red-500';
    if (correlation >= 50) return 'bg-orange-500';
    return 'bg-yellow-500';
  };

  const getCorrelationBgColor = (correlation: number) => {
    if (correlation >= 75) return 'bg-red-50';
    if (correlation >= 50) return 'bg-orange-50';
    return 'bg-yellow-50';
  };

  return (
    <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
      <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
      <div className="space-y-3">
        {data.slice(0, 10).map((item, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg ${getCorrelationBgColor(item.correlation)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {item.trigger.name}
                </span>
                <span className="text-gray-400">→</span>
                <span className="text-gray-700">{item.symptom.name}</span>
              </div>
              <span className="font-semibold text-gray-900">
                {item.correlation}%
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 h-2 backdrop-blur-md bg-white/70 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${getCorrelationColor(item.correlation)}`}
                  style={{ width: `${item.correlation}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>
                {item.occurrences} of {item.totalSymptomOccurrences} occurrences
              </span>
              {item.avgTimeToSymptom > 0 && (
                <span>
                  Avg time: {item.avgTimeToSymptom < 60
                    ? `${item.avgTimeToSymptom} min`
                    : `${(item.avgTimeToSymptom / 60).toFixed(1)} hrs`
                  }
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
