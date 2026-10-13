import styled from 'styled-components';
import { ScrollList } from '../atoms/ScrollList.js';
import { CorrelationChart } from '../molecules/charts/CorrelationChart.js';
import { FrequencyChart } from '../molecules/charts/FrequencyChart.js';
import { SeverityTrendChart } from '../molecules/charts/SeverityTrendChart.js';
import type { PeriodType } from '../../types/health.js';
import type {
  DecryptedSymptom,
  DecryptedFood,
  DecryptedMedicationLog,
  DecryptedExercise,
  DecryptedWellness,
  WellnessTrendPoint,
  WellnessInsight,
} from '../../utils/correlationAnalysis.js';
import {
  calculateCorrelations,
  calculateExerciseCorrelations,
  calculateSymptomFrequency,
  calculateSeverityTrend,
  calculateExerciseImpact,
  calculateExerciseFrequency,
  calculateSymptomCoOccurrences,
  calculateWellnessTrend,
  calculateWellnessInsights,
} from '../../utils/correlationAnalysis.js';
import React, { useMemo, useState } from 'react';

/* ── Styled ── */

/* Plain bordered cards — no fill or shadow (matches the Health dashboard cards). */
const StatCard = styled.div`
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 2px);
  padding: 14px;
  text-align: center;
`;

const StatValue = styled.div<{ $color: string }>`
  font-family: var(--font-display);
  font-size: 31px;
  font-weight: 300;
  color: ${({ $color }) => $color};
`;

const StatLabel = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 2px;
`;

const StatSub = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 4px;
`;

const SectionCard = styled.div`
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg, 2px);
  padding: 16px;
`;

const SectionTitle = styled.h3`
  font-family: var(--font-display);
  font-size: ${({ theme }) => theme.typography.h3.fontSize};
  font-weight: 300;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 12px;
`;

const SectionDesc = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin: 0 0 12px;
`;

const ListRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 15px;
`;

const ListLabel = styled.span`
  color: ${({ theme }) => theme.colors.text};
  text-transform: capitalize;
`;

const ListValue = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CoRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  & + & { margin-top: 6px; }
`;

const CoLabels = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.text};
`;

const CoArrow = styled.span`
  color: ${({ theme }) => theme.colors.textMuted};
`;

const CoBadge = styled.span<{ $color: string }>`
  font-size: 13px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 99px;
  background: ${({ $color }) => `${$color}18`};
  color: ${({ $color }) => $color};
`;

const CoMeta = styled.div`
  text-align: right;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ExFreqRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
`;

const ExFreqLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  width: 80px;
  flex-shrink: 0;
`;

const ExFreqBar = styled.div`
  flex: 1;
  height: 12px;
  border-radius: 6px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
`;

const ExFreqFill = styled.div<{ $width: number; $color: string }>`
  height: 100%;
  width: ${({ $width }) => $width}%;
  background: ${({ $color }) => $color};
  border-radius: 6px;
`;

const ExFreqValue = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  width: 80px;
  text-align: right;
  flex-shrink: 0;
`;

const ImpactRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  & + & { margin-top: 6px; }
`;

const ImpactLeft = styled.div``;
const ImpactName = styled.span`
  font-size: 16px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  text-transform: capitalize;
`;
const ImpactSub = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ImpactRight = styled.div`
  text-align: right;
`;

const ImpactArrow = styled.div`
  font-size: 15px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const ImpactChange = styled.div<{ $positive: boolean; $neutral: boolean }>`
  font-size: 15px;
  font-weight: 500;
  color: ${({ $positive, $neutral, theme }) => $neutral ? theme.colors.textMuted : $positive ? theme.colors.success : theme.colors.danger};
`;

const WellnessGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  column-gap: 24px;
  row-gap: 16px;
`;

const WellnessTrendWrap = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 80px;
  margin-bottom: 8px;
`;

const WellnessTrendCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
`;

const WellnessTrendBar = styled.div<{ $height: number; $color: string }>`
  width: 100%;
  min-width: 10px;
  height: ${({ $height }) => Math.max($height, 2)}px;
  background: ${({ $color }) => $color};
  border-radius: 3px 3px 0 0;
`;

const WellnessTrendLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-top: 3px;
  white-space: nowrap;
`;

const WellnessDotRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 80px;
  margin-bottom: 8px;
`;

const WellnessDotCol = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
`;

const WellnessDot = styled.div<{ $bottom: number; $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  margin-bottom: ${({ $bottom }) => $bottom}px;
`;

const TrendChartLegend = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textMuted};
  margin-bottom: 4px;
`;

const TrendLegendDot = styled.div<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

const TrendLegendItem = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const InsightRow = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius.md}px;
  & + & { margin-top: 8px; }
`;

const InsightLabel = styled.div`
  font-size: 15px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;

const InsightDetail = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textMuted};
  line-height: 1.5;
`;

const InsightBadge = styled.span<{ $positive: boolean }>`
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 6px;
  background: ${({ $positive }) => $positive ? 'rgba(90,138,106,0.12)' : 'rgba(0,0,0,0.06)'};
  color: ${({ $positive }) => $positive ? '#5A8A6A' : '#888'};
`;

/* ── Helpers ── */

function strengthColor(c: number): string {
  if (c >= 75) return '#9B4444';
  if (c >= 50) return '#B5704F';
  return '#B8965A';
}

/* ── Props ── */

interface HealthReportProps {
  symptoms: DecryptedSymptom[];
  foods: DecryptedFood[];
  medLogs: DecryptedMedicationLog[];
  exercises: DecryptedExercise[];
  wellness: DecryptedWellness[];
  period: PeriodType;
  accentColor: string;
}

/* ── Component ── */

export function HealthReport({ symptoms, foods, medLogs, exercises, wellness, period, accentColor }: HealthReportProps) {
  const today = new Date();
  const correlations = useMemo(() => {
    if (symptoms.length === 0) return [];
    return [...calculateCorrelations(symptoms, foods, medLogs), ...calculateExerciseCorrelations(symptoms, exercises)];
  }, [symptoms, foods, medLogs, exercises]);

  const symptomFrequency = useMemo(() =>
    symptoms.length > 0 ? calculateSymptomFrequency(symptoms, period === 'year' ? 'month' : 'day') : [], [symptoms, period]);

  const severityTrend = useMemo(() =>
    symptoms.length > 0 ? calculateSeverityTrend(symptoms, period === 'year' ? 'week' : 'day') : [], [symptoms, period]);

  const coOccurrences = useMemo(() =>
    symptoms.length > 0 ? calculateSymptomCoOccurrences(symptoms) : [], [symptoms]);

  const exerciseImpact = useMemo(() =>
    exercises.length > 0 ? calculateExerciseImpact(symptoms, exercises) : [], [symptoms, exercises]);

  const exerciseFrequency = useMemo(() =>
    exercises.length > 0 ? calculateExerciseFrequency(exercises, period === 'year' ? 'month' : 'week') : [], [exercises, period]);

  const exerciseSummary = useMemo(() => {
    if (exercises.length === 0) return null;
    const byType = exercises.reduce((acc, e) => {
      const k = e.exerciseType.toLowerCase();
      if (!acc[k]) acc[k] = { count: 0, duration: 0 };
      acc[k].count++;
      acc[k].duration += e.duration;
      return acc;
    }, {} as Record<string, { count: number; duration: number }>);
    return byType;
  }, [exercises]);

  const topSymptoms = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of symptoms) { const k = s.name.toLowerCase(); counts[k] = (counts[k] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [symptoms]);

  const topIngredients = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of foods) for (const ing of f.ingredients) { const k = ing.toLowerCase(); counts[k] = (counts[k] || 0) + 1; }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [foods]);

  const wellnessTrend: WellnessTrendPoint[] = useMemo(() =>
    wellness.length > 0 ? calculateWellnessTrend(wellness) : [], [wellness]);

  const wellnessInsights: WellnessInsight[] = useMemo(() =>
    wellness.length >= 3 ? calculateWellnessInsights(wellness, symptoms, exercises) : [],
    [wellness, symptoms, exercises]);

  const wellnessSummary = useMemo(() => {
    if (wellness.length === 0) return null;
    const withWater = wellness.filter(w => w.waterGlasses > 0);
    const withMood  = wellness.filter(w => w.moodScore > 0);
    const withSleep = wellness.filter(w => w.sleepHours > 0);
    const withSleepQ = wellness.filter(w => w.sleepQuality > 0);
    return {
      avgWater:  withWater.length  > 0 ? withWater.reduce((s, w) => s + w.waterGlasses, 0) / withWater.length : 0,
      avgMood:   withMood.length   > 0 ? withMood.reduce((s, w) => s + w.moodScore, 0) / withMood.length : 0,
      avgSleep:  withSleep.length  > 0 ? withSleep.reduce((s, w) => s + w.sleepHours, 0) / withSleep.length : 0,
      avgSleepQ: withSleepQ.length > 0 ? withSleepQ.reduce((s, w) => s + w.sleepQuality, 0) / withSleepQ.length : 0,
      days: wellness.length,
    };
  }, [wellness]);

  return (
    <ScrollList $gap="24px" $padding="16px 0">
      {/* Wellness summary stats */}
      {wellnessSummary && (
        <WellnessGrid>
          <StatCard>
            <StatValue $color={accentColor}>{wellnessSummary.avgWater.toFixed(1)}</StatValue>
            <StatLabel>Avg Water</StatLabel>
            <StatSub>/ 8 glasses · {wellnessSummary.days} days</StatSub>
          </StatCard>
          <StatCard>
            <StatValue $color={accentColor}>{wellnessSummary.avgMood > 0 ? wellnessSummary.avgMood.toFixed(1) : '—'}</StatValue>
            <StatLabel>Avg Mood</StatLabel>
            <StatSub>/ 5</StatSub>
          </StatCard>
          <StatCard>
            <StatValue $color={accentColor}>{wellnessSummary.avgSleep > 0 ? `${wellnessSummary.avgSleep.toFixed(1)}h` : '—'}</StatValue>
            <StatLabel>Avg Sleep</StatLabel>
            {wellnessSummary.avgSleepQ > 0 && <StatSub>Quality {wellnessSummary.avgSleepQ.toFixed(1)}/5</StatSub>}
          </StatCard>
        </WellnessGrid>
      )}

      {/* Wellness trends */}
      {wellnessTrend.length > 1 && (
        <SectionCard>
          <SectionTitle>Wellness Trends</SectionTitle>
          <TrendChartLegend>
            <TrendLegendItem><TrendLegendDot $color={accentColor} /><span>Water (glasses)</span></TrendLegendItem>
            <TrendLegendItem><TrendLegendDot $color="#5A8A6A" /><span>Mood (×2)</span></TrendLegendItem>
            <TrendLegendItem><TrendLegendDot $color="#B8965A" /><span>Sleep (hours ÷ 2)</span></TrendLegendItem>
          </TrendChartLegend>
          <WellnessTrendWrap>
            {wellnessTrend.slice(-14).map((pt, i) => {
              const maxH = 72;
              const waterH  = (pt.waterGlasses / 8) * maxH;
              const moodH   = pt.moodScore   > 0 ? ((pt.moodScore * 2) / 10) * maxH : 0;
              const sleepH  = pt.sleepHours  > 0 ? (pt.sleepHours / 12) * maxH : 0;
              const date = new Date(pt.date + 'T12:00:00');
              const label = `${date.getMonth() + 1}/${date.getDate()}`;
              return (
                <WellnessTrendCol key={i} title={`${pt.date}: ${pt.waterGlasses} water, mood ${pt.moodScore}/5, ${pt.sleepHours}h sleep`}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, flex: 1, justifyContent: 'center' }}>
                    <WellnessTrendBar $height={waterH} $color={accentColor} style={{ width: 5 }} />
                    {moodH > 0  && <WellnessTrendBar $height={moodH}  $color="#5A8A6A" style={{ width: 5 }} />}
                    {sleepH > 0 && <WellnessTrendBar $height={sleepH} $color="#B8965A" style={{ width: 5 }} />}
                  </div>
                  <WellnessTrendLabel>{label}</WellnessTrendLabel>
                </WellnessTrendCol>
              );
            })}
          </WellnessTrendWrap>
        </SectionCard>
      )}

      {/* Wellness cross-correlation insights */}
      {wellnessInsights.length > 0 && (
        <SectionCard>
          <SectionTitle>Wellness Insights</SectionTitle>
          <SectionDesc>Cross-correlations between sleep, water, mood, exercise, and symptoms</SectionDesc>
          {wellnessInsights.map((insight, i) => (
            <InsightRow key={i}>
              <InsightLabel>
                {insight.label}
                <InsightBadge $positive={insight.direction === 'positive'}>
                  {insight.direction === 'positive' ? 'pattern found' : 'tracking'} · {insight.dataPoints} days
                </InsightBadge>
              </InsightLabel>
              <InsightDetail>
                {insight.high}<br />{insight.low}
              </InsightDetail>
            </InsightRow>
          ))}
        </SectionCard>
      )}

      {/* Correlations */}
      <CorrelationChart data={correlations} title="Correlations Detected" />

      {/* Co-occurrences */}
      {coOccurrences.length > 0 && (
        <SectionCard>
          <SectionTitle>Symptom Co-occurrences</SectionTitle>
          <SectionDesc>Symptoms that tend to occur together within 24 hours</SectionDesc>
          {coOccurrences.slice(0, 10).map((co, i) => (
            <CoRow key={i}>
              <CoLabels>
                <span>{co.symptom1.name}</span>
                <CoArrow>&harr;</CoArrow>
                <span>{co.symptom2.name}</span>
              </CoLabels>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <CoBadge $color={strengthColor(co.correlation)}>{co.correlation}%</CoBadge>
                <CoMeta>
                  <div>{co.coOccurrences} co-occurrences</div>
                  {co.avgTimeBetween > 0 && (
                    <div>~{co.avgTimeBetween < 60 ? `${co.avgTimeBetween}m` : `${Math.round(co.avgTimeBetween / 60)}h`} apart</div>
                  )}
                </CoMeta>
              </div>
            </CoRow>
          ))}
        </SectionCard>
      )}

      {/* Symptom frequency */}
      <FrequencyChart data={symptomFrequency} title="Symptom Frequency" color={accentColor} />

      {/* Severity trend */}
      <SeverityTrendChart data={severityTrend} title="Severity Trend Over Time" />

      {/* Top symptoms */}
      {topSymptoms.length > 0 && (
        <SectionCard>
          <SectionTitle>Most Common Symptoms</SectionTitle>
          {topSymptoms.map(([name, count]) => (
            <ListRow key={name}><ListLabel>{name}</ListLabel><ListValue>{count} occurrence{count !== 1 ? 's' : ''}</ListValue></ListRow>
          ))}
        </SectionCard>
      )}

      {/* Top ingredients */}
      {topIngredients.length > 0 && (
        <SectionCard>
          <SectionTitle>Most Consumed Ingredients</SectionTitle>
          {topIngredients.map(([name, count]) => (
            <ListRow key={name}><ListLabel>{name}</ListLabel><ListValue>{count} time{count !== 1 ? 's' : ''}</ListValue></ListRow>
          ))}
        </SectionCard>
      )}

      {/* Exercise summary */}
      {exerciseSummary && (
        <SectionCard>
          <SectionTitle>Exercise Summary</SectionTitle>
          {Object.entries(exerciseSummary)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([type, data]) => (
              <ListRow key={type}><ListLabel>{type}</ListLabel><ListValue>{data.count} session{data.count !== 1 ? 's' : ''} ({data.duration} min)</ListValue></ListRow>
            ))}
        </SectionCard>
      )}

      {/* Exercise frequency */}
      {exerciseFrequency.length > 0 && (
        <SectionCard>
          <SectionTitle>Exercise Frequency</SectionTitle>
          {exerciseFrequency.slice(-7).map(data => {
            const maxCount = Math.max(...exerciseFrequency.map(d => d.count));
            return (
              <ExFreqRow key={data.period}>
                <ExFreqLabel>{data.period}</ExFreqLabel>
                <ExFreqBar><ExFreqFill $width={maxCount > 0 ? (data.count / maxCount) * 100 : 0} $color={accentColor} /></ExFreqBar>
                <ExFreqValue>{data.count} ({data.totalDuration} min)</ExFreqValue>
              </ExFreqRow>
            );
          })}
        </SectionCard>
      )}

      {/* Exercise impact on symptoms */}
      {exerciseImpact.length > 0 && (
        <SectionCard>
          <SectionTitle>Exercise Impact on Symptoms</SectionTitle>
          <SectionDesc>How symptom severity changes after different exercise types (within 24 hours)</SectionDesc>
          {exerciseImpact.map(impact => (
            <ImpactRow key={impact.exerciseType}>
              <ImpactLeft>
                <ImpactName>{impact.exerciseType}</ImpactName>
                <ImpactSub>{impact.occurrences} data points</ImpactSub>
              </ImpactLeft>
              <ImpactRight>
                <ImpactArrow>Before: {impact.avgSeverityBefore} &rarr; After: {impact.avgSeverityAfter}</ImpactArrow>
                <ImpactChange $positive={impact.improvement > 0} $neutral={impact.improvement === 0}>
                  {impact.improvement > 0 ? '\u2193' : impact.improvement < 0 ? '\u2191' : '\u2212'}{' '}
                  {Math.abs(impact.improvement)} point{Math.abs(impact.improvement) !== 1 ? 's' : ''}{' '}
                  {impact.improvement > 0 ? 'improvement' : impact.improvement < 0 ? 'increase' : 'no change'}
                </ImpactChange>
              </ImpactRight>
            </ImpactRow>
          ))}
        </SectionCard>
      )}
    </ScrollList>
  );
}
