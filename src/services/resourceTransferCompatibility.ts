import type { MedicineInventoryTable, OxygenInventoryTable, TransferResourceType, TransferStatus } from '../types/database';

export interface TransferStockOption {
  key: string;
  label: string;
  resourceName: string;
  transferable: number;
  unit: string;
  identity?: {
    resource_type: 'Oxygen' | 'Medicine';
    name: string;
    unit: string | null;
    category?: string | null;
    dosage?: string | null;
    manufacturer?: string | null;
    expiry_date?: string | null;
  };
}

export function canSourceHospitalReviewTransfer(
  transfer: { source_hospital_id: string; status: TransferStatus },
  hospitalId: string | null | undefined
): boolean {
  return Boolean(hospitalId)
    && transfer.source_hospital_id === hospitalId
    && transfer.status === 'Pending';
}

export interface TransferInventoryIdentity {
  name: string;
  unit?: string | null;
  category?: string | null;
  dosage?: string | null;
  manufacturer?: string | null;
  expiry_date?: string | null;
}

/** Ensure transferable quantities refer to the same kind of inventory at both facilities. */
export function areTransferInventoryItemsCompatible(
  resourceType: TransferResourceType,
  source: TransferInventoryIdentity | undefined,
  destination: TransferInventoryIdentity | undefined
): boolean {
  if (!source || !destination || source.name !== destination.name) return false;
  if (resourceType === 'ICU Beds' || resourceType === 'General Beds') return true;
  if (source.unit !== destination.unit) return false;
  if (resourceType === 'Oxygen') return true;
  return source.category === destination.category
    && source.dosage === destination.dosage
    && source.manufacturer === destination.manufacturer
    && source.expiry_date === destination.expiry_date;
}

/** Expiry dates are date-only values; stock expiring today remains eligible through that day. */
export function isMedicineExpiryTransferable(expiryDate: string | null | undefined, currentDate = new Date().toISOString().slice(0, 10)): boolean {
  if (!expiryDate) return true;
  const normalizedExpiry = expiryDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedExpiry)) return false;
  const parsedExpiry = new Date(`${normalizedExpiry}T00:00:00.000Z`);
  if (Number.isNaN(parsedExpiry.getTime()) || parsedExpiry.toISOString().slice(0, 10) !== normalizedExpiry) return false;
  return normalizedExpiry >= currentDate.slice(0, 10);
}

export function buildOxygenTransferOptions(
  sourceRows: OxygenInventoryTable[],
  destinationRows: OxygenInventoryTable[]
): TransferStockOption[] {
  const identityFor = (row: OxygenInventoryTable) => ({ resource_type: 'Oxygen' as const, name: row.oxygen_type, unit: row.unit });
  const keyFor = (row: OxygenInventoryTable) => JSON.stringify(identityFor(row));
  const sourceCounts = new Map<string, number>();
  const destinationCounts = new Map<string, number>();
  sourceRows.forEach((row) => sourceCounts.set(keyFor(row), (sourceCounts.get(keyFor(row)) || 0) + 1));
  destinationRows.forEach((row) => destinationCounts.set(keyFor(row), (destinationCounts.get(keyFor(row)) || 0) + 1));

  return sourceRows.flatMap((row) => {
    const key = keyFor(row);
    const destinationMatches = destinationRows.filter((candidate) => keyFor(candidate) === key);
    const destination = destinationMatches[0];
    const transferable = Math.max(0, Math.floor(row.available_capacity - row.minimum_threshold));
    if (sourceCounts.get(key) !== 1 || destinationCounts.get(key) !== 1
      || !Number.isFinite(row.available_capacity) || row.available_capacity < 0
      || !Number.isFinite(row.minimum_threshold) || row.minimum_threshold < 0 || !Number.isFinite(transferable)
      || transferable <= 0 || !areTransferInventoryItemsCompatible('Oxygen', identityFor(row), destination && identityFor(destination))) return [];
    return [{ key, label: `${row.oxygen_type} · ${row.unit}`, resourceName: row.oxygen_type, identity: identityFor(row), transferable, unit: row.unit }];
  });
}

export function buildMedicineTransferOptions(
  sourceRows: MedicineInventoryTable[],
  destinationRows: MedicineInventoryTable[],
  currentDate = new Date().toISOString().slice(0, 10)
): TransferStockOption[] {
  const identityFor = (row: MedicineInventoryTable) => ({
    resource_type: 'Medicine' as const,
    name: row.medicine_name,
    category: row.category,
    dosage: row.dosage,
    manufacturer: row.manufacturer,
    unit: row.unit,
    expiry_date: row.expiry_date
  });
  const keyFor = (row: MedicineInventoryTable) => JSON.stringify(identityFor(row));
  const sourceCounts = new Map<string, number>();
  const destinationCounts = new Map<string, number>();
  sourceRows.forEach((row) => sourceCounts.set(keyFor(row), (sourceCounts.get(keyFor(row)) || 0) + 1));
  destinationRows.forEach((row) => destinationCounts.set(keyFor(row), (destinationCounts.get(keyFor(row)) || 0) + 1));

  return sourceRows.flatMap((row) => {
    const key = keyFor(row);
    const destinationMatches = destinationRows.filter((candidate) => keyFor(candidate) === key);
    const destination = destinationMatches[0];
    const transferable = Math.max(0, row.current_stock - row.minimum_stock);
    if (sourceCounts.get(key) !== 1 || destinationCounts.get(key) !== 1
      || !Number.isFinite(row.current_stock) || row.current_stock < 0
      || !Number.isFinite(row.minimum_stock) || row.minimum_stock < 0 || !Number.isFinite(transferable)
      || transferable <= 0 || !isMedicineExpiryTransferable(row.expiry_date, currentDate)
      || !isMedicineExpiryTransferable(destination?.expiry_date, currentDate)
      || !areTransferInventoryItemsCompatible('Medicine', identityFor(row), destination && identityFor(destination))) return [];
    const identity = identityFor(row);
    const description = [row.dosage, row.manufacturer, row.expiry_date ? `expires ${row.expiry_date}` : 'no expiry date'].filter(Boolean).join(' · ');
    return [{ key, label: `${row.medicine_name} · ${description}`, resourceName: row.medicine_name, identity, transferable, unit: row.unit }];
  });
}
