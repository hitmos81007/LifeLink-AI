import { describe, expect, it } from 'vitest';
import { chooseResultIdForEntity } from '../services/publicResourceSelection';

const results = [
  { id: 'hospital-a:medicine:paracetamol', entity: { id: 'hospital-a' } },
  { id: 'hospital-a:medicine:saline', entity: { id: 'hospital-a' } },
  { id: 'hospital-b:medicine:saline', entity: { id: 'hospital-b' } }
];

describe('map marker resource selection', () => {
  it('preserves the selected resource when a marker represents multiple rows', () => {
    expect(chooseResultIdForEntity(results, 'hospital-a', 'hospital-a:medicine:saline'))
      .toBe('hospital-a:medicine:saline');
  });

  it('selects the first filtered resource for a marker when none from it is selected', () => {
    expect(chooseResultIdForEntity(results, 'hospital-a', 'hospital-b:medicine:saline'))
      .toBe('hospital-a:medicine:paracetamol');
  });

  it('clears selection for a marker with no matching result', () => {
    expect(chooseResultIdForEntity(results, 'hospital-c', null)).toBeNull();
  });
});
