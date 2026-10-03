import React, { useState } from 'react';
import {
  Building2,
  Droplet,
  Ambulance,
  MapPin,
  Navigation,
  Phone,
  Clock,
  ShieldAlert,
  Sparkles,
  Layers,
  Filter,
  Check,
  Eye,
  Zap,
  Info,
  Route as RouteIcon,
  Search,
  CheckCircle2
} from 'lucide-react';
import { LeafletEmergencyMap, MapEntity } from './common/LeafletEmergencyMap';

const INITIAL_ENTITIES: MapEntity[] = [
  {
    id: 'pat-01',
    name: 'Patient Incident Site (Sector 4)',
    type: 'patient',
    location: { lat: 28.6139, lng: 77.2090 },
    address: 'Connaught Place Sector 4, New Delhi',
    phone: '+91-98765-91100',
    details: {
      status: 'CRITICAL - RED STEMI',
      etaMinutes: 0
    }
  },
  {
    id: 'hosp-01',
    name: 'Metro Regional Trauma & Critical Care',
    type: 'hospital',
    location: { lat: 28.6250, lng: 77.2180 },
    address: '888 Ring Road Health Hub, New Delhi',
    phone: '+91-11-2345-0001',
    details: {
      traumaLevel: 'Level 1 Regional Trauma',
      icuBeds: 8,
      totalBeds: 45,
      availableBeds: 32,
      ambulanceUnits: 3,
      distanceKm: 1.8,
      etaMinutes: 5,
      bloodStock: { 'O-': 18, 'O+': 45, 'A+': 30, 'B+': 28 }
    }
  },
  {
    id: 'hosp-02',
    name: 'St. Jude General & Emergency Hospital',
    type: 'hospital',
    location: { lat: 28.6010, lng: 77.1950 },
    address: '1201 Medical Enclave, South District',
    phone: '+91-11-2345-0002',
    details: {
      traumaLevel: 'Level 2 Emergency Center',
      icuBeds: 3,
      totalBeds: 25,
      availableBeds: 18,
      ambulanceUnits: 2,
      distanceKm: 3.4,
      etaMinutes: 8,
      bloodStock: { 'O-': 6, 'O+': 22, 'A+': 18, 'B+': 14 }
    }
  },
  {
    id: 'hosp-03',
    name: 'City Memorial Institute of Surgery',
    type: 'hospital',
    location: { lat: 28.6380, lng: 77.2250 },
    address: 'Mission Road Health Corridor',
    phone: '+91-11-2345-0003',
    details: {
      traumaLevel: 'Level 3 Community Center',
      icuBeds: 2,
      totalBeds: 20,
      availableBeds: 12,
      ambulanceUnits: 1,
      distanceKm: 4.2,
      etaMinutes: 11,
      bloodStock: { 'O-': 2, 'O+': 12, 'A+': 10, 'B+': 8 }
    }
  },
  {
    id: 'blood-01',
    name: 'Central Red Cross Blood Depot',
    type: 'blood_bank',
    location: { lat: 28.6210, lng: 77.2020 },
    address: '550 Red Cross Road, Central District',
    phone: '+91-11-9876-0001',
    details: {
      tempCelsius: 3.8,
      distanceKm: 1.2,
      etaMinutes: 4,
      bloodStock: { 'O-': 42, 'O+': 110, 'A-': 15, 'A+': 85, 'B-': 12, 'B+': 64, 'AB-': 8, 'AB+': 22 }
    }
  },
  {
    id: 'blood-02',
    name: 'Regional Transfusion Reserve',
    type: 'blood_bank',
    location: { lat: 28.6050, lng: 77.2280 },
    address: '3333 State Healthcare Line',
    phone: '+91-11-9876-0002',
    details: {
      tempCelsius: 4.1,
      distanceKm: 3.1,
      etaMinutes: 8,
      bloodStock: { 'O-': 24, 'O+': 75, 'A-': 10, 'A+': 50, 'B+': 40 }
    }
  },
  {
    id: 'amb-01',
    name: 'ALS Mobile ICU Unit #08',
    type: 'ambulance',
    location: { lat: 28.6180, lng: 77.2140 },
    address: 'En Route on 16th Expressway',
    phone: '+91-98765-11008',
    details: {
      vehicleId: 'DL-01-AMB-8812',
      driverName: 'Capt. Marcus Vance',
      status: 'DISPATCHED TO PATIENT',
      etaMinutes: 3,
      distanceKm: 0.9
    }
  },
  {
    id: 'amb-02',
    name: 'Rapid Response Rescue #12',
    type: 'ambulance',
    location: { lat: 28.6310, lng: 77.2080 },
    address: 'Stationed at Sector 2 Hub',
    phone: '+91-98765-11012',
    details: {
      vehicleId: 'DL-01-AMB-4409',
      driverName: 'Sgt. Elena Rostova',
      status: 'STANDBY READY',
      etaMinutes: 6,
      distanceKm: 1.6
    }
  }
];

export const GoogleMapsEmergencyView: React.FC = () => {
  const [entities, setEntities] = useState<MapEntity[]>(INITIAL_ENTITIES);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>('hosp-01');
  const [routeDestinationId, setRouteDestinationId] = useState<string | null>('hosp-01');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEntities = entities.filter(e => {
    if (!searchQuery) return true;
    return e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           e.address.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const selectedEntity = entities.find(e => e.id === selectedEntityId);
  const routeDestination = entities.find(e => e.id === routeDestinationId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 py-2">
      {/* Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5 text-blue-400" /> CARTO Basemaps GIS Spatial Engine
            </span>
            <span className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> API Connected: Real-Time Vector Tiles
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Live Emergency Spatial Map &amp; Green Corridor Route
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-3xl leading-relaxed">
            Real-time interactive GIS mapping displaying regional emergency hospitals, cold-chain blood banks, GPS-tracked ambulances, and patient incident coordinates with instant driving corridor calculations.
          </p>
        </div>

        {/* Counters */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-blue-600"></span>
            <span className="font-bold text-white">3 Hospitals</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-rose-600"></span>
            <span className="font-bold text-white">2 Blood Banks</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
            <span className="font-bold text-white">2 Ambulances</span>
          </div>
          <div className="bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-xl flex items-center space-x-2 text-xs">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="font-bold text-amber-300">1 Incident</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Sidebar + Leaflet Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Sidebar: Controls & List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search facility name or location..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white font-medium focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Route Destination Selector */}
          <div className="bg-slate-950 p-3 rounded-xl border border-blue-900/60 space-y-2 text-xs">
            <div className="flex items-center justify-between font-bold text-white">
              <span className="flex items-center gap-1 text-blue-400">
                <RouteIcon className="w-4 h-4" /> Destination Green Corridor
              </span>
              <span className="text-[10px] font-mono text-emerald-400">Active</span>
            </div>

            <select
              value={routeDestinationId || ''}
              onChange={(e) => {
                setRouteDestinationId(e.target.value);
                setSelectedEntityId(e.target.value);
              }}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs font-bold text-white"
            >
              <optgroup label="Hospitals">
                {entities.filter(e => e.type === 'hospital').map(h => (
                  <option key={h.id} value={h.id}>🏥 {h.name} ({h.details.distanceKm} km)</option>
                ))}
              </optgroup>
              <optgroup label="Blood Banks">
                {entities.filter(e => e.type === 'blood_bank').map(b => (
                  <option key={b.id} value={b.id}>🩸 {b.name} ({b.details.distanceKm} km)</option>
                ))}
              </optgroup>
            </select>

            {routeDestination && (
              <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono">
                <span>Distance: <strong className="text-blue-400">{routeDestination.details.distanceKm} km</strong></span>
                <span>ETA: <strong className="text-emerald-400">~{routeDestination.details.etaMinutes} mins</strong></span>
              </div>
            )}
          </div>

          {/* Scrollable List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase font-mono block">
              Emergency Network Nodes ({filteredEntities.length})
            </span>
            <div className="max-h-[320px] overflow-y-auto space-y-2 pr-1 text-xs">
              {filteredEntities.map((entity) => {
                const isSelected = selectedEntityId === entity.id;
                const isRouteTarget = routeDestinationId === entity.id;

                return (
                  <div
                    key={entity.id}
                    onClick={() => {
                      setSelectedEntityId(entity.id);
                      if (entity.type === 'hospital' || entity.type === 'blood_bank') {
                        setRouteDestinationId(entity.id);
                      }
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-blue-950/80 border-blue-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${
                          entity.type === 'hospital' ? 'bg-blue-500' :
                          entity.type === 'blood_bank' ? 'bg-rose-500' :
                          entity.type === 'ambulance' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        <span className="font-bold text-xs truncate max-w-[170px]">{entity.name}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{entity.address}</p>
                    </div>

                    {entity.details.distanceKm && (
                      <span className="text-[10px] font-mono font-bold bg-slate-900 px-2 py-1 rounded text-blue-300 border border-slate-700 shrink-0">
                        {entity.details.distanceKm} km
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Area: Interactive Leaflet Map */}
        <div className="lg:col-span-8 space-y-4">
          <LeafletEmergencyMap
            entities={filteredEntities}
            center={[28.6139, 77.2090]}
            zoom={13}
            height="500px"
            selectedEntityId={selectedEntityId}
            activeRouteDestinationId={routeDestinationId}
          />
        </div>

      </div>
    </div>
  );
};
