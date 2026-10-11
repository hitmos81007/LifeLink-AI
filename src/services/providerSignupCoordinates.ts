export interface ProviderSignupCoordinates {
  latitude: number | null;
  longitude: number | null;
}

/** Validate the optional facility map point as an all-or-nothing coordinate pair. */
export function parseProviderSignupCoordinates(
  latitudeInput: string,
  longitudeInput: string
): ProviderSignupCoordinates {
  const latitudeText = latitudeInput.trim();
  const longitudeText = longitudeInput.trim();

  if (Boolean(latitudeText) !== Boolean(longitudeText)) {
    throw new Error('Enter both latitude and longitude, or leave both blank.');
  }
  if (!latitudeText) return { latitude: null, longitude: null };

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude must be a valid number between -90 and 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude must be a valid number between -180 and 180.');
  }
  return { latitude, longitude };
}
