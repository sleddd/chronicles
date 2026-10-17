import styled from 'styled-components';
import type { SeverityTrendData } from '../../../utils/correlationAnalysis.js';

/* Same filled, bordered card as the other report sections */
const Card = styled.div`
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-lg, 6px);
  background: var(--bg-surface);
  padding: 20px 24px;
  @media (max-width: 480px) { padding: 16px; }
`;

const Title = styled.h3`
  font-family: ${({ theme }) => theme.typography.bodySm.fontFamily};
  font-size: ${({ theme }) => theme.typography.bodySm.fontSize};
  font-weight: ${({ theme }) => theme.fontWeight.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 24px;
`;

const Empty = styled.div`
  text-align: center;
  padding: 24px 0;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ChartWrapper = styled.div`
  position: relative;
  height: 160px;
`;

const YAxis = styled.div`
  position: absolute;
  left: 0;
  top: 0;
  bottom: 24px;
  width: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ChartArea = styled.div`
  margin-left: 28px;
  position: relative;
  height: 120px;
`;

const GridLine = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  position: absolute;
  left: 0;
  right: 0;
`;

const XAxis = styled.div`
  margin-left: 28px;
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
`;

const XLabel = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

const Legend = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const LegendDot = styled.div<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.borderRadius.sm}px;
  background: ${({ $color }) => $color};
`;

const LegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

function getSeverityColor(severity: number): string {
  if (severity <= 3) return '#5A8A6A';
  if (severity <= 6) return '#B8965A';
  return '#9B4444';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

interface SeverityTrendChartProps {
  data: SeverityTrendData[];
  title: string;
}

export function SeverityTrendChart({ data, title }: SeverityTrendChartProps) {
  if (data.length === 0) return <Card><Title>{title}</Title><Empty>No severity data available</Empty></Card>;

  const chartHeight = 120;
  const maxSeverity = 10;

  const points = data.map((d, i) => {
    const sev = Number.isFinite(d.avgSeverity) ? d.avgSeverity : 0;
    return {
      x: (i / (data.length - 1 || 1)) * 100,
      y: ((maxSeverity - sev) / maxSeverity) * chartHeight,
    };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}`).join(' ');

  return (
    <Card>
      <Title>{title}</Title>
      <ChartWrapper>
        <YAxis><span>10</span><span>5</span><span>0</span></YAxis>
        <ChartArea>
          <GridLine style={{ top: 0 }} />
          <GridLine style={{ top: '50%' }} />
          <GridLine style={{ bottom: 0 }} />
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <linearGradient id="severityGrad" x1="0" x2="1" y1="0" y2="0">
                {data.map((d, i) => (
                  <stop key={i} offset={`${(i / (data.length - 1 || 1)) * 100}%`} stopColor={getSeverityColor(d.avgSeverity)} />
                ))}
              </linearGradient>
            </defs>
            <path d={linePath} fill="none" stroke="url(#severityGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((p, i) => (
              <circle key={i} cx={`${p.x}%`} cy={p.y} r="4" fill={getSeverityColor(data[i].avgSeverity)}>
                <title>{`${formatDate(data[i].date)}: ${data[i].avgSeverity}/10`}</title>
              </circle>
            ))}
          </svg>
        </ChartArea>
        <XAxis>
          {data.slice(0, 10).map((d, i) => (
            <XLabel key={i} style={{ width: `${100 / data.length}%` }}>{formatDate(d.date)}</XLabel>
          ))}
        </XAxis>
      </ChartWrapper>
      <Legend>
        <LegendItem><LegendDot $color="#5A8A6A" /><span>Mild (1-3)</span></LegendItem>
        <LegendItem><LegendDot $color="#B8965A" /><span>Moderate (4-6)</span></LegendItem>
        <LegendItem><LegendDot $color="#9B4444" /><span>Severe (7-10)</span></LegendItem>
      </Legend>
    </Card>
  );
}
