import { describe, expect, it } from 'vitest';
import {
  calculateDiseaseEarlyWarnings,
  SyntheticDiseaseObservation
} from '../services/diseaseEarlyWarningService';

const now = new Date('2026-10-07T12:00:00Z');

function observationsFor(district: string, recentCaseCount: (dayOffset: number) => number, count = 28, generatedAt = now.toISOString()): SyntheticDiseaseObservation[] {
  return Array.from({ length: count }, (_, index) => {
    const dayOffset = 27 - index;
    const cases = recentCaseCount(dayOffset);
    return {
      district,
      syndrome: 'Respiratory',
      observed_on: new Date(now.getTime() - dayOffset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      case_count: cases,
      admission_count: Math.floor(cases * 0.2),
      oxygen_units_consumed: cases * 2,
      generated_at: generatedAt
    };
  });
}

describe('synthetic district early-warning calculation', () => {
  it('marks a sustained synthetic surge elevated with an interpretable baseline comparison', () => {
    const rows = observationsFor('Synthetic district A', (offset) => offset < 7 ? 12 : 5);
    const [warning] = calculateDiseaseEarlyWarnings(rows, now);
    expect(warning.level).toBe('elevated');
    expect(warning.baselineCasesPerDay).toBe(5);
    expect(warning.recentCasesPerDay).toBe(12);
    expect(warning.caseChangePercent).toBe(140);
    expect(warning.recentAdmissions).toBe(14);
    expect(warning.timeline).toHaveLength(28);
  });

  it('keeps stable synthetic counts normal and orders elevated signals first', () => {
    const rows = [
      ...observationsFor('Synthetic district B', () => 5),
      ...observationsFor('Synthetic district A', (offset) => offset < 7 ? 12 : 5)
    ];
    const warnings = calculateDiseaseEarlyWarnings(rows, now);
    expect(warnings.map((warning) => warning.level)).toEqual(['elevated', 'normal']);
  });

  it('marks a moderate synthetic increase as watch, below the elevated threshold', () => {
    const rows = observationsFor('Synthetic district B', (offset) => offset < 7 ? 8 : 5);
    const [warning] = calculateDiseaseEarlyWarnings(rows, now);
    expect(warning.level).toBe('watch');
    expect(warning.baselineCasesPerDay).toBe(5);
    expect(warning.recentCasesPerDay).toBe(8);
    expect(warning.caseChangePercent).toBe(60);
  });

  it('withholds a tier when there is not enough history and flags old generated data', () => {
    const shortHistory = observationsFor('Synthetic district C', () => 5, 12);
    const missingLatestDay = observationsFor('Synthetic district E', () => 5).slice(0, 27);
    const oldDataset = observationsFor('Synthetic district B', () => 5, 28, '2026-10-05T12:00:00Z');
    const warnings = calculateDiseaseEarlyWarnings([...shortHistory, ...missingLatestDay, ...oldDataset], now);
    expect(warnings.find((warning) => warning.district === 'Synthetic district C')?.level).toBe('insufficient data');
    expect(warnings.find((warning) => warning.district === 'Synthetic district E')?.level).toBe('insufficient data');
    expect(warnings.find((warning) => warning.district === 'Synthetic district B')?.stale).toBe(true);
    expect(warnings[warnings.length - 1]?.district).toBe('Synthetic district B');
  });
});
