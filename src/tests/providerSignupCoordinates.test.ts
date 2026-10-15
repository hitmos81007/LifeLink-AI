import { describe, expect, it } from 'vitest';
import { parseProviderSignupCoordinates } from '../services/providerSignupCoordinates';

describe('provider signup coordinates', () => {
  it('allows both coordinates to be omitted', () => {
    expect(parseProviderSignupCoordinates('', '  ')).toEqual({ latitude: null, longitude: null });
  });

  it('parses a complete coordinate pair', () => {
    expect(parseProviderSignupCoordinates('13.0827', '80.2707')).toEqual({
      latitude: 13.0827,
      longitude: 80.2707
    });
  });

  it('rejects a latitude without a longitude and vice versa', () => {
    expect(() => parseProviderSignupCoordinates('13.08', '')).toThrow('Enter both latitude and longitude');
    expect(() => parseProviderSignupCoordinates('', '80.27')).toThrow('Enter both latitude and longitude');
  });

  it('rejects invalid, non-finite, and out-of-range coordinates', () => {
    expect(() => parseProviderSignupCoordinates('north', '80')).toThrow('Latitude must be a valid number');
    expect(() => parseProviderSignupCoordinates('13', 'Infinity')).toThrow('Longitude must be a valid number');
    expect(() => parseProviderSignupCoordinates('-91', '80')).toThrow('Latitude must be a valid number');
    expect(() => parseProviderSignupCoordinates('13', '181')).toThrow('Longitude must be a valid number');
  });
});
