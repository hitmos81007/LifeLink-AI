import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bed, Building2, Clock3, Droplets, MapPin, Navigation, Phone, Pill, RefreshCw, Search, Wind } from 'lucide-react';
import { LeafletEmergencyMap, MapEntity } from './common/LeafletEmergencyMap';
import { calculateHaversineDistance, isValidCoordinatePair } from '../services/geoService';
import { chooseResultIdForEntity } from '../services/publicResourceSelection';
import { getResourceFreshness, ResourceCategory, ResourceFreshness } from '../services/resourceFreshness';
import {
  getPublicResourceDirectory,
  PublicAmbulanceProvider,
  PublicBloodBank,
  PublicHospital,
  PublicResourceDirectory
} from '../services/publicResourceService';

interface SearchLocation {
  lat: number;
  lng: number;
  label: string;
}

interface ResourceResult {
  id: string;
  entity: MapEntity;
  category: ResourceCategory;
  resourceLabel: string;
  quantity: number | null;
  unit: string;
  availability: string;
  updatedAt: string | null;
  freshness: ResourceFreshness;
  distanceKm: number | null;
}

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  blood: 'Blood', oxygen: 'Oxygen', icu: 'ICU beds', beds: 'General beds', ambulance: 'Ambulances', medicine: 'Medicines'
};

function hospitalEntity(hospital: PublicHospital): MapEntity | null {
  const hasCoordinates = isValidCoordinatePair(hospital.latitude, hospital.longitude);
  return {
    id: hospital.id,
    name: hospital.name,
    type: 'hospital',
    location: hasCoordinates ? { lat: hospital.latitude as number, lng: hospital.longitude as number } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
    address: [hospital.address, hospital.district, hospital.state].filter(Boolean).join(', '),
    phone: hospital.phone || undefined,
    details: {
      traumaLevel: `${hospital.hospital_type}${hospital.trauma_center ? ' · Trauma center' : ''}`,
      hasCoordinates
    }
  };
}

function bloodBankEntity(bank: PublicBloodBank): MapEntity | null {
  const hasCoordinates = isValidCoordinatePair(bank.latitude, bank.longitude);
  return {
    id: bank.id,
    name: bank.name,
    type: 'blood_bank',
    location: hasCoordinates ? { lat: bank.latitude as number, lng: bank.longitude as number } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
    address: [bank.address, bank.district, bank.state].filter(Boolean).join(', '),
    phone: bank.phone || undefined,
    details: { hasCoordinates }
  };
}

function ambulanceEntity(provider: PublicAmbulanceProvider): MapEntity | null {
  const hasCoordinates = isValidCoordinatePair(provider.approximate_latitude, provider.approximate_longitude);
  return {
    id: `ambulance-provider-${provider.id}`,
    name: provider.name,
    type: 'ambulance',
    location: hasCoordinates
      ? { lat: provider.approximate_latitude as number, lng: provider.approximate_longitude as number }
      : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
    address: `Approximate provider area, ${provider.district}, ${provider.state}`,
    phone: provider.phone || undefined,
    details: { hasCoordinates }
  };
}

function createResult(
  entity: MapEntity,
  category: ResourceCategory,
  resourceLabel: string,
  quantity: number | null,
  unit: string,
  availability: string,
  updatedAt: string | null,
  origin: SearchLocation | null
): ResourceResult {
  const distanceKm = origin && entity.details.hasCoordinates !== false
    ? calculateHaversineDistance(origin.lat, origin.lng, entity.location.lat, entity.location.lng)
    : null;
  return {
    id: `${entity.id}:${category}:${resourceLabel}`,
    entity: {
      ...entity,
      details: {
        ...entity.details,
        ...(distanceKm == null ? {} : { distanceKm }),
        resourceFreshness: [{ resource: resourceLabel, freshness: getResourceFreshness(updatedAt, category), updatedAt, availability }]
      }
    },
    category,
    resourceLabel,
    quantity,
    unit,
    availability,
    updatedAt,
    freshness: getResourceFreshness(updatedAt, category),
    distanceKm
  };
}

function buildResults(
  directory: PublicResourceDirectory,
  category: ResourceCategory,
  bloodGroup: string,
  searchText: string,
  minimumQuantity: number,
  origin: SearchLocation | null,
  radiusKm: number
): ResourceResult[] {
  const results: ResourceResult[] = [];
  const add = (result: ResourceResult) => {
    if (result.quantity == null && minimumQuantity > 0) return;
    if (result.quantity != null && result.quantity < minimumQuantity) return;
    if (origin && (result.distanceKm == null || result.distanceKm > radiusKm)) return;
    const term = searchText.trim().toLowerCase();
    if (term && !`${result.entity.name} ${result.entity.address} ${result.resourceLabel} ${result.entity.details.traumaLevel || ''}`.toLowerCase().includes(term)) return;
    results.push(result);
  };

  if (category === 'blood') {
    directory.blood_banks.forEach((bank) => {
      const entity = bloodBankEntity(bank);
      if (!entity) return;
      const stock = bank.stock.find((item) => item.blood_group === bloodGroup);
      add(createResult(entity, category, `${bloodGroup} blood`, stock?.quantity ?? null, 'units', stock?.availability_status || 'Unknown', stock?.updated_at || null, origin));
    });
  }

  if (category === 'oxygen') {
    directory.hospitals.forEach((hospital) => {
      const entity = hospitalEntity(hospital);
      if (!entity) return;
      if (hospital.oxygen.length === 0) {
        add(createResult(entity, category, 'Oxygen', null, 'record(s)', 'Unknown', null, origin));
      } else {
        hospital.oxygen.forEach((item) => add(createResult(entity, category, item.type || 'Oxygen', item.quantity, item.unit || 'units', item.availability_status || 'Unknown', item.updated_at || null, origin)));
      }
    });
  }

  if (category === 'icu' || category === 'beds') {
    directory.hospitals.forEach((hospital) => {
      const entity = hospitalEntity(hospital);
      if (!entity) return;
      const isIcu = category === 'icu';
      add(createResult(
        entity, category, isIcu ? 'ICU beds' : 'General beds',
        isIcu ? hospital.icu_beds : hospital.general_beds,
        'beds', isIcu ? hospital.icu_status : hospital.general_beds_status,
        isIcu ? hospital.icu_updated_at : hospital.general_beds_updated_at, origin
      ));
    });
  }

  if (category === 'medicine') {
    directory.hospitals.forEach((hospital) => {
      const entity = hospitalEntity(hospital);
      if (!entity) return;
      if (hospital.medicines.length === 0) {
        add(createResult(entity, category, 'Medicine inventory', null, 'items', 'Unknown', null, origin));
      } else {
        hospital.medicines.forEach((item) => add(createResult(
          entity, category, `${item.name || 'Medicine'}${item.dosage ? ` ${item.dosage}` : ''}${item.category ? ` (${item.category})` : ''}`,
          item.quantity, item.unit || 'units', item.availability_status || 'Unknown', item.updated_at || null, origin
        )));
      }
    });
  }

  if (category === 'ambulance') {
    directory.ambulance_providers.forEach((provider) => {
      const entity = ambulanceEntity(provider);
      if (!entity) return;
      add(createResult(entity, category, 'Ambulance units', provider.available_units, 'units', provider.availability_status, provider.updated_at, origin));
    });
  }

  const statusRank = (result: ResourceResult) => result.freshness === 'Fresh'
    ? (result.availability === 'Available' ? 0 : 1)
    : result.freshness === 'Stale' ? 2 : 3;
  return results.sort((a, b) => statusRank(a) - statusRank(b)
    || (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY)
    || (b.quantity ?? -1) - (a.quantity ?? -1));
}

export const GoogleMapsEmergencyView: React.FC = () => {
  const [directory, setDirectory] = useState<PublicResourceDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ResourceCategory>('blood');
  const [bloodGroup, setBloodGroup] = useState('O-');
  const [searchText, setSearchText] = useState('');
  const [minimumQuantity, setMinimumQuantity] = useState(0);
  const [radiusKm, setRadiusKm] = useState(25);
  const [location, setLocation] = useState<SearchLocation | null>(null);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDirectory(await getPublicResourceDirectory());
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load the public resource directory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const results = useMemo(() => directory ? buildResults(
    directory, category, bloodGroup, searchText, Math.max(0, minimumQuantity), location, radiusKm
  ) : [], [directory, category, bloodGroup, searchText, minimumQuantity, location, radiusKm]);

  useEffect(() => {
    if (selectedResultId && !results.some((result) => result.id === selectedResultId)) {
      setSelectedResultId(null);
    }
  }, [results, selectedResultId]);

  const mapEntities = useMemo(() => {
    const byId = new Map<string, MapEntity>();
    results.forEach((result) => {
      if (result.entity.details.hasCoordinates !== false) byId.set(result.entity.id, result.entity);
    });
    return [...byId.values()];
  }, [results]);

  const locateMe = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError('Location is unavailable in this browser. Enter coordinates below instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isValidCoordinatePair(coords.latitude, coords.longitude)) {
          setLocationError('The browser returned an invalid location. Enter coordinates manually instead.');
          return;
        }
        setLocation({ lat: coords.latitude, lng: coords.longitude, label: 'Current browser location' });
      },
      () => setLocationError('Location permission was denied or unavailable. Enter coordinates below instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  const useManualLocation = (event: React.FormEvent) => {
    event.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!manualLat.trim() || !manualLng.trim() || !isValidCoordinatePair(lat, lng)) {
      setLocationError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      return;
    }
    setLocation({ lat, lng, label: 'Manually entered location' });
    setLocationError(null);
  };

  const clearLocation = () => {
    setLocation(null);
    setLocationError(null);
  };

  const selectedResult = results.find((result) => result.id === selectedResultId);
  const visibleSelectedEntityId = selectedResult?.entity.id ?? null;
  const resourceIcon = category === 'blood' ? Droplets : category === 'oxygen' ? Wind : category === 'ambulance' ? Navigation : category === 'medicine' ? Pill : Bed;
  const ResourceIcon = resourceIcon;

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <span className="inline-flex px-2.5 py-1 text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Synthetic prototype data • Supabase
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">Find nearby healthcare resources</h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
            This finder uses synthetic resource records for demonstration only. Availability is not real-world capacity and may be stale. Confirm through verified channels; this is not an emergency service or dispatch system.
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={loading} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-xs font-bold inline-flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh directory
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-300 font-bold space-y-1.5">
              <span>Resource</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as ResourceCategory)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white">
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            {category === 'blood' ? (
              <label className="text-xs text-slate-300 font-bold space-y-1.5">
                <span>Blood group</span>
                <select value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white">
                  {BLOOD_GROUPS.map((group) => <option key={group}>{group}</option>)}
                </select>
              </label>
            ) : (
              <label className="text-xs text-slate-300 font-bold space-y-1.5">
                <span>Minimum quantity</span>
                <input type="number" min="0" step="1" value={minimumQuantity} onChange={(event) => setMinimumQuantity(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white" />
              </label>
            )}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input type="search" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search name, area, or subtype" className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white" />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-blue-400" /> Search location</span>
              <button type="button" onClick={locateMe} className="text-[11px] font-bold text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"><Navigation className="w-3.5 h-3.5" /> Use my location</button>
            </div>
            {location ? (
              <div className="text-[11px] text-emerald-300 flex items-center justify-between gap-2">
                <span>{location.label} · {location.lat.toFixed(3)}, {location.lng.toFixed(3)}</span>
                <button type="button" onClick={clearLocation} className="text-slate-300 underline">Clear</button>
              </div>
            ) : (
              <form onSubmit={useManualLocation} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input aria-label="Latitude" inputMode="decimal" placeholder="Latitude" value={manualLat} onChange={(event) => setManualLat(event.target.value)} className="min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white" />
                <input aria-label="Longitude" inputMode="decimal" placeholder="Longitude" value={manualLng} onChange={(event) => setManualLng(event.target.value)} className="min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white" />
                <button type="submit" className="px-2.5 py-2 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs font-bold">Apply</button>
              </form>
            )}
            {locationError && <p role="alert" className="text-[11px] text-amber-300">{locationError}</p>}
            {location && <label className="flex items-center gap-2 text-[11px] text-slate-300">Radius
              <select value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white">
                {[5, 10, 25, 50].map((radius) => <option key={radius} value={radius}>{radius} km</option>)}
              </select>
              <span className="text-slate-500">Straight-line distance</span>
            </label>}
          </div>

          {category === 'blood' && <label className="flex items-center gap-2 text-xs text-slate-300 font-bold">Minimum units
            <input type="number" min="0" step="1" value={minimumQuantity} onChange={(event) => setMinimumQuantity(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} className="w-24 bg-slate-950 border border-slate-700 rounded-lg p-2 text-white" />
          </label>}

          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase">
            <span>{CATEGORY_LABELS[category]} results</span><span>{results.length}</span>
          </div>
          <p className="text-[11px] text-slate-500">Freshness shows when prototype data was updated; it does not confirm real-world availability. Distance breaks ties when a location is set. Stale or unknown records are never presented as confirmed.</p>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading current resource summaries…</div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-4 text-xs text-rose-200 space-y-3">
              <p className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4" /> Directory unavailable</p>
              <p>{error}</p>
              <button onClick={() => void refresh()} className="px-3 py-2 bg-rose-800 hover:bg-rose-700 rounded-lg font-bold">Retry</button>
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-center space-y-3">
              <p className="text-sm font-bold text-slate-200">No matching resources found</p>
              <p className="text-xs text-slate-400">Try a wider radius or lower minimum quantity. Filters are not changed automatically.</p>
              <div className="flex justify-center gap-2">
                {location && radiusKm < 50 && <button onClick={() => setRadiusKm(50)} className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-bold">Search within 50 km</button>}
                {minimumQuantity > 0 && <button onClick={() => setMinimumQuantity(0)} className="px-3 py-2 rounded-lg bg-slate-800 text-xs font-bold">Clear minimum</button>}
              </div>
            </div>
          ) : (
            <div className="max-h-[390px] overflow-y-auto space-y-2 pr-1">
              {results.map((result) => {
                const isSelected = selectedResultId === result.id;
                const shownStatus = result.freshness === 'Stale' ? 'Stale' : result.freshness === 'Unknown' ? 'Unknown' : result.availability;
                return (
                  <div key={result.id} role="button" aria-pressed={isSelected} tabIndex={0} onClick={() => setSelectedResultId(result.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedResultId(result.id); } }} className={`w-full text-left rounded-xl border p-3 space-y-2 cursor-pointer ${isSelected ? 'bg-blue-950/60 border-blue-500' : 'bg-slate-950 border-slate-800 hover:border-slate-600'}`}>
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white truncate">{result.entity.name}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{result.entity.address}</span>
                      </span>
                      <span className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-extrabold ${shownStatus === 'Available' ? 'bg-emerald-950 text-emerald-300' : shownStatus === 'Critical' ? 'bg-rose-950 text-rose-300' : 'bg-amber-950 text-amber-300'}`}>{shownStatus}</span>
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-300">
                      <span className="font-semibold">{result.resourceLabel}: <strong className={result.freshness === 'Fresh' ? 'text-white' : 'text-amber-200'}>{result.quantity == null ? 'Unknown' : result.freshness === 'Fresh' ? `${result.quantity} ${result.unit}` : `${result.freshness === 'Stale' ? 'Last reported' : 'Unverified report'}: ${result.quantity} ${result.unit}`}</strong></span>
                      <span className="inline-flex items-center gap-1 text-slate-400"><Clock3 className="w-3 h-3" />{result.updatedAt ? new Date(result.updatedAt).toLocaleString() : 'Update time unknown'}</span>
                    </span>
                    <span className="flex items-center justify-between text-[11px]">
                      <span className="text-blue-300">{result.distanceKm == null ? 'Distance not set' : `${result.distanceKm} km straight-line`}</span>
                      <span className="flex gap-2">
                        {result.entity.phone && <a onClick={(event) => event.stopPropagation()} href={`tel:${result.entity.phone}`} className="inline-flex items-center gap-1 text-emerald-300"><Phone className="w-3 h-3" />Call to confirm</a>}
                        {result.entity.details.hasCoordinates !== false && <a onClick={(event) => event.stopPropagation()} target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${result.entity.location.lat}%2C${result.entity.location.lng}`} className="inline-flex items-center gap-1 text-blue-300"><Navigation className="w-3 h-3" />Directions</a>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-8 space-y-3">
          <div className="bg-blue-950/60 border border-blue-900 rounded-xl px-4 py-3 text-xs text-blue-100">
            <ResourceIcon className="w-4 h-4 inline mr-2" /> Results use shareable availability summaries. Reserved counts, safety thresholds, and vehicle or driver details are not exposed. Availability must be confirmed with the facility.
          </div>
          <LeafletEmergencyMap
            entities={mapEntities}
            center={location ? [location.lat, location.lng] : DEFAULT_CENTER}
            zoom={12}
            height="530px"
            selectedEntityId={visibleSelectedEntityId}
            onEntitySelect={(entity) => {
              setSelectedResultId((currentId) => chooseResultIdForEntity(results, entity.id, currentId));
            }}
            selectedLocation={location ? { lat: location.lat, lng: location.lng } : null}
            selectableLocation
            showGpsControl={false}
            onLocationSelect={(picked) => setLocation({ lat: picked.lat, lng: picked.lng, label: 'Map selected location' })}
            showRadiusCircle={Boolean(location)}
            radiusMeters={radiusKm * 1000}
          />
          {selectedResult && (
            <p className="text-xs text-slate-400 px-1">Selected: <strong className="text-slate-200">{selectedResult.entity.name}</strong> · {selectedResult.resourceLabel} · Please call to verify before travelling.</p>
          )}
          {!loading && directory && results.length > 0 && <p className="text-[11px] text-slate-500 px-1">Directory contains {directory.hospitals.length} hospital(s), {directory.blood_banks.length} blood bank(s), and {directory.ambulance_providers.length} ambulance provider(s). Data is synthetic prototype information.</p>}
        </section>
      </div>
    </div>
  );
};
