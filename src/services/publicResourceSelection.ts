export interface EntityResultReference {
  id: string;
  entity: { id: string };
}

/** Keep the selected resource when a facility marker represents multiple rows. */
export function chooseResultIdForEntity<T extends EntityResultReference>(
  results: T[],
  entityId: string,
  selectedResultId: string | null
): string | null {
  const forEntity = results.filter((result) => result.entity.id === entityId);
  return forEntity.find((result) => result.id === selectedResultId)?.id
    ?? forEntity[0]?.id
    ?? null;
}
