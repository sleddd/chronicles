'use client';

import { SeverityTrendData } from '@/lib/utils/correlationAnalysis';

interface Props {
  data: SeverityTrendData[];
  title: string;
}

export function SeverityTrendChart({ data, title }: Props) {
  if (data.length === 0) {
    return (
      <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
        <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
        <div className="text-center py-8 text-gray-400">
          No severity data available
        </div>
      </div>
    );
  }

  const maxSeverity = 10;
  const chartHeight = 120;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Create SVG path for the line chart
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1 || 1)) * 100,
    y: ((maxSeverity - d.avgSeverity) / maxSeverity) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}`)
    .join(' ');

  const getSeverityColor = (severity: number) => {
    if (severity <= 3) return '#22c55e'; // green
    if (severity <= 6) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  return (
    <div className="backdrop-blur-md bg-white/70 rounded-lg border border-border p-4">
      <h3 className="font-medium text-gray-900 mb-4">{title}</h3>

      <div className="relative" style={{ height: chartHeight + 40 }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-8 w-6 flex flex-col justify-between text-xs text-gray-400">
          <span>10</span>
          <span>5</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="ml-8 relative" style={{ height: chartHeight }}>
          {/* Grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            <div className="border-b border-border" />
            <div className="border-b border-border" />
            <div className="border-b border-border" />
          </div>

          {/* SVG Line */}
          <svg className="absolute inset-0 w-full h-full overflow-visible">
            {/* Line gradient */}
            <defs>
              <linearGradient id="severityGradient" x1="0" x2="1" y1="0" y2="0">
                {data.map((d, i) => (
                  <stop
                    key={i}
                    offset={`${(i / (data.length - 1 || 1)) * 100}%`}
                    stopColor={getSeverityColor(d.avgSeverity)}
                  />
                ))}
              </linearGradient>
            </defs>

            {/* Line path */}
            <path
              d={linePath}
              fill="none"
              stroke="url(#severityGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  cx={`${p.x}%`}
                  cy={p.y}
                  r="4"
                  fill={getSeverityColor(data[i].avgSeverity)}
                  className="hover:r-6 transition-all cursor-pointer"
                />
                <title>{`${formatDate(data[i].date)}: ${data[i].avgSeverity}/10`}</title>
              </g>
            ))}
          </svg>
        </div>

        {/* X-axis labels */}
        <div className="ml-8 flex justify-between mt-2">
          {data.slice(0, 10).map((d, i) => (
            <span
              key={i}
              className="text-xs text-gray-500"
              style={{ width: `${100 / data.length}%`, textAlign: 'center' }}
            >
              {formatDate(d.date)}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Mild (1-3)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Moderate (4-6)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span>Severe (7-10)</span>
        </div>
      </div>
    </div>
  );
}
