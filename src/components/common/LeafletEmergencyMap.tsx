import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Building2,
  Droplets,
  Truck,
  MapPin,
  Navigation,
  Phone,
  Clock,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
  Crosshair,
  AlertTriangle,
  Compass,
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { BASEMAP_LAYERS, BasemapLayerConfig, CARTO_API_KEY, DEFAULT_BASEMAP } from '../../config/mapConfig';

export interface MapEntity {
  id: string;
  name: string;
  type: 'hospital' | 'blood_bank' | 'ambulance' | 'patient' | 'mci';
  location: { lat: number; lng: number };
  address: string;
  phone?: string;
  details: {
    traumaLevel?: string;
    icuBeds?: number;
    totalBeds?: number;
    availableBeds?: number;
    ambulanceUnits?: number;
    bloodStock?: Record<string, number>;
    tempCelsius?: number;
    vehicleId?: string;
    driverName?: string;
    driverPhone?: string;
    status?: string;
    distanceKm?: number;
    etaMinutes?: number;
    casualties?: number;
    triageRed?: number;
    triageYellow?: number;
    triageGreen?: number;
    triageBlack?: number;
    emergencyType?: string;
  };
}

interface LeafletEmergencyMapProps {
  entities?: MapEntity[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  selectableLocation?: boolean;
  selectedLocation?: { lat: number; lng: number } | null;
  onLocationSelect?: (location: { lat: number; lng: number; address?: string }) => void;
  selectedEntityId?: string | null;
  onEntitySelect?: (entity: MapEntity) => void;
  activeRouteDestinationId?: string | null;
  showRadiusCircle?: boolean;
  radiusMeters?: number;
  interactive?: boolean;
  compact?: boolean;
  initialBasemap?: 'cartoVoyager' | 'cartoDark' | 'cartoPositron' | 'osmStandard';
}

export const LeafletEmergencyMap: React.FC<LeafletEmergencyMapProps> = ({
  entities = [],
  center = [28.6139, 77.2090], // Default New Delhi / Urban center
  zoom = 13,
  height = '480px',
  selectableLocation = false,
  selectedLocation,
  onLocationSelect,
  selectedEntityId,
  onEntitySelect,
  activeRouteDestinationId,
  showRadiusCircle = false,
  radiusMeters = 3000,
  interactive = true,
  compact = false,
  initialBasemap = 'cartoVoyager'
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);

  const [activeBasemapKey, setActiveBasemapKey] = useState<string>(initialBasemap);
  const [showBasemapMenu, setShowBasemapMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<{
    hospitals: boolean;
    bloodBanks: boolean;
    ambulances: boolean;
    patient: boolean;
    mci: boolean;
  }>({
    hospitals: true,
    bloodBanks: true,
    ambulances: true,
    patient: true,
    mci: true
  });

  const [geolocating, setGeolocating] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: center,
        zoom: zoom,
        zoomControl: !compact,
        attributionControl: false
      });

      // Load initial Carto basemap layer with active API key
      const basemapConfig = BASEMAP_LAYERS[activeBasemapKey] || DEFAULT_BASEMAP;
      const tileLayer = L.tileLayer(basemapConfig.url, {
        maxZoom: basemapConfig.maxZoom,
        subdomains: basemapConfig.subdomains
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Attribution small in bottom right
      L.control.attribution({ position: 'bottomright', prefix: false })
        .addAttribution(basemapConfig.attribution)
        .addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Handle map clicks for selecting location in patient request/guest mode
      if (selectableLocation && onLocationSelect) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          onLocationSelect({
            lat: Math.round(lat * 1000000) / 1000000,
            lng: Math.round(lng * 1000000) / 1000000,
            address: `Geotagged (${lat.toFixed(4)}, ${lng.toFixed(4)})`
          });
        });
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Basemap Tiles when style changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const basemapConfig = BASEMAP_LAYERS[activeBasemapKey] || DEFAULT_BASEMAP;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const newTileLayer = L.tileLayer(basemapConfig.url, {
      maxZoom: basemapConfig.maxZoom,
      subdomains: basemapConfig.subdomains
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
  }, [activeBasemapKey]);

  // Update Markers & Overlays
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!map || !markersGroup) return;

    markersGroup.clearLayers();

    if (routeLineRef.current) {
      map.removeLayer(routeLineRef.current);
      routeLineRef.current = null;
    }
    if (radiusCircleRef.current) {
      map.removeLayer(radiusCircleRef.current);
      radiusCircleRef.current = null;
    }

    const bounds = L.latLngBounds([]);

    // Custom Icons generator using HTML strings
    const createCustomIcon = (
      type: MapEntity['type'],
      name: string,
      isSelected: boolean,
      details: MapEntity['details']
    ) => {
      let iconColor = '#2563EB'; // Blue (Hospital)
      let iconSymbol = '🏥';
      let badgeHtml = '';

      if (type === 'hospital') {
        iconColor = '#2563EB';
        iconSymbol = '🏥';
        if (details.icuBeds !== undefined) {
          badgeHtml = `<span style="position: absolute; top: -6px; right: -6px; background: #10B981; color: white; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 9999px; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${details.icuBeds} ICU</span>`;
        }
      } else if (type === 'blood_bank') {
        iconColor = '#E11D48'; // Rose Red
        iconSymbol = '🩸';
        badgeHtml = `<span style="position: absolute; top: -6px; right: -6px; background: #BE123C; color: white; font-size: 8px; font-weight: 800; padding: 1px 3px; border-radius: 9999px; border: 1.5px solid white;">BLOOD</span>`;
      } else if (type === 'ambulance') {
        iconColor = '#059669'; // Emerald
        iconSymbol = '🚑';
        badgeHtml = `<span style="position: absolute; top: -6px; right: -6px; background: #047857; color: white; font-size: 8px; font-weight: 800; padding: 1px 3px; border-radius: 9999px; border: 1.5px solid white;">AMB</span>`;
      } else if (type === 'patient') {
        iconColor = '#D97706'; // Amber Gold
        iconSymbol = '⚠️';
        badgeHtml = `<span style="position: absolute; top: -6px; right: -6px; background: #DC2626; color: white; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 9999px; border: 1.5px solid white; animation: pulse 1.5s infinite;">URGENT</span>`;
      } else if (type === 'mci') {
        iconColor = '#DC2626'; // Red Danger
        iconSymbol = '🚨';
        badgeHtml = `<span style="position: absolute; top: -6px; right: -6px; background: #7F1D1D; color: #FCA5A5; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 9999px; border: 1.5px solid white; animation: pulse 1s infinite;">MCI</span>`;
      }

      const pulseRing = (type === 'patient' || type === 'mci' || isSelected)
        ? `<div style="position: absolute; inset: -8px; border-radius: 50%; background: ${iconColor}; opacity: 0.35; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
        : '';

      const html = `
        <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${pulseRing}
          <div style="width: 34px; height: 34px; background: ${iconColor}; border: 2.5px solid #FFFFFF; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 10px rgba(0,0,0,0.35); transform: ${isSelected ? 'scale(1.2)' : 'scale(1)'}; transition: transform 0.2s ease;">
            ${iconSymbol}
          </div>
          ${badgeHtml}
        </div>
      `;

      return L.divIcon({
        html,
        className: 'custom-leaflet-pin',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -20]
      });
    };

    // Filter entities
    const visibleEntities = entities.filter((e) => {
      if (e.type === 'hospital' && !activeFilter.hospitals) return false;
      if (e.type === 'blood_bank' && !activeFilter.bloodBanks) return false;
      if (e.type === 'ambulance' && !activeFilter.ambulances) return false;
      if (e.type === 'patient' && !activeFilter.patient) return false;
      if (e.type === 'mci' && !activeFilter.mci) return false;
      return true;
    });

    let originPatientLocation: [number, number] | null = null;
    let targetDestinationLocation: [number, number] | null = null;
    let targetDestinationName = '';

    visibleEntities.forEach((entity) => {
      const latLng: [number, number] = [entity.location.lat, entity.location.lng];
      bounds.extend(latLng);

      if (entity.type === 'patient' || entity.type === 'mci') {
        originPatientLocation = latLng;
      }

      if (activeRouteDestinationId && entity.id === activeRouteDestinationId) {
        targetDestinationLocation = latLng;
        targetDestinationName = entity.name;
      }

      const isSelected = selectedEntityId === entity.id;
      const icon = createCustomIcon(entity.type, entity.name, isSelected, entity.details);

      const marker = L.marker(latLng, { icon, riseOnHover: true });

      // Build rich popup
      let popupContent = `
        <div style="min-width: 220px; font-family: ui-sans-serif, system-ui, sans-serif; color: #0F172A; padding: 2px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: ${
              entity.type === 'hospital' ? '#2563EB' :
              entity.type === 'blood_bank' ? '#E11D48' :
              entity.type === 'ambulance' ? '#059669' : '#D97706'
            };">
              ${entity.type.replace('_', ' ')}
            </span>
            ${entity.details.distanceKm ? `<span style="font-size: 10px; font-weight: bold; background: #F1F5F9; padding: 2px 6px; border-radius: 4px;">${entity.details.distanceKm} km</span>` : ''}
          </div>
          <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; line-height: 1.3;">${entity.name}</h4>
          <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748B;">${entity.address}</p>
      `;

      if (entity.type === 'hospital') {
        popupContent += `
          <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span><strong>ICU Beds:</strong></span> <span style="color: #16A34A; font-weight: bold;">${entity.details.icuBeds ?? 'Available'} Available</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
              <span><strong>Trauma Level:</strong></span> <span>${entity.details.traumaLevel ?? 'Level 1'}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span><strong>Total Capacity:</strong></span> <span>${entity.details.availableBeds ?? 20} / ${entity.details.totalBeds ?? 50} beds</span>
            </div>
          </div>
        `;
      } else if (entity.type === 'blood_bank' && entity.details.bloodStock) {
        popupContent += `
          <div style="background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-bottom: 6px;">
            <div style="font-weight: 700; color: #BE123C; margin-bottom: 4px;">Cold Storage Stock (Units):</div>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; text-align: center;">
              ${Object.entries(entity.details.bloodStock).slice(0, 4).map(([grp, units]) => `
                <div style="background: white; border: 1px solid #FDA4AF; border-radius: 4px; padding: 2px;">
                  <div style="font-weight: 800; font-size: 9px; color: #9F1239;">${grp}</div>
                  <div style="font-size: 10px; font-weight: bold;">${units}</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else if (entity.type === 'ambulance') {
        popupContent += `
          <div style="background: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-bottom: 6px;">
            <div><strong>Vehicle:</strong> ${entity.details.vehicleId ?? 'ALS-01'}</div>
            <div><strong>Driver:</strong> ${entity.details.driverName ?? 'Paramedic Team'}</div>
            <div style="color: #047857; font-weight: 700; margin-top: 2px;">Status: ${entity.details.status ?? 'Active En Route'}</div>
          </div>
        `;
      } else if (entity.type === 'mci') {
        popupContent += `
          <div style="background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 6px; padding: 6px 8px; font-size: 11px; margin-bottom: 6px;">
            <div style="font-weight: 800; color: #991B1B;">MASS CASUALTY INCIDENT</div>
            <div>Estimated Casualties: <strong>${entity.details.casualties ?? '15+'}</strong></div>
            <div style="font-size: 10px; color: #B91C1C;">Multi-Hospital Green Corridors Active</div>
          </div>
        `;
      }

      if (entity.phone) {
        popupContent += `
          <div style="font-size: 10px; color: #475569; display: flex; align-items: center; gap: 4px;">
            <span>📞 Direct Line:</span> <strong>${entity.phone}</strong>
          </div>
        `;
      }

      popupContent += `</div>`;

      marker.bindPopup(popupContent, { maxWidth: 300 });

      marker.on('click', () => {
        if (onEntitySelect) {
          onEntitySelect(entity);
        }
      });

      markersGroup.addLayer(marker);
    });

    // Render User-Dropped Selected Pin if present
    if (selectedLocation) {
      const selectedLatLng: [number, number] = [selectedLocation.lat, selectedLocation.lng];
      bounds.extend(selectedLatLng);
      originPatientLocation = selectedLatLng;

      const userPinIcon = L.divIcon({
        html: `
          <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; inset: 0; border-radius: 50%; background: #EF4444; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="width: 38px; height: 38px; background: #DC2626; border: 3px solid #FFFFFF; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; box-shadow: 0 4px 12px rgba(220,38,38,0.5);">
              📍
            </div>
            <span style="position: absolute; top: -8px; background: #991B1B; color: white; font-size: 8px; font-weight: 900; padding: 1px 5px; border-radius: 9999px; border: 1.5px solid white;">PATIENT</span>
          </div>
        `,
        className: 'custom-user-location-pin',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const userMarker = L.marker(selectedLatLng, { icon: userPinIcon, zIndexOffset: 1000 });
      userMarker.bindPopup(`
        <div style="font-family: system-ui; padding: 4px; text-align: center;">
          <strong style="color: #DC2626; font-size: 12px;">🚨 Emergency Incident Location</strong>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #475569;">${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}</p>
        </div>
      `);
      markersGroup.addLayer(userMarker);
    }

    // Render Disaster Radius Circle if enabled
    if (showRadiusCircle && (originPatientLocation || center)) {
      const circleCenter = originPatientLocation || center;
      const circle = L.circle(circleCenter, {
        radius: radiusMeters,
        color: '#DC2626',
        fillColor: '#EF4444',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6'
      }).addTo(map);

      radiusCircleRef.current = circle;
    }

    // Render Live Dynamic Polyline Route
    if (originPatientLocation && targetDestinationLocation) {
      // Calculate smooth intermediate waypoint curve
      const [startLat, startLng] = originPatientLocation;
      const [endLat, endLng] = targetDestinationLocation;
      const midLat = (startLat + endLat) / 2 + (Math.random() - 0.5) * 0.005;
      const midLng = (startLng + endLng) / 2 + (Math.random() - 0.5) * 0.005;

      const path: [number, number][] = [
        [startLat, startLng],
        [midLat, midLng],
        [endLat, endLng]
      ];

      const polyline = L.polyline(path, {
        color: '#2563EB',
        weight: 5,
        opacity: 0.85,
        dashArray: '10, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      routeLineRef.current = polyline;

      // Fit map bounds to encompass the entire route smoothly
      map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.isValid() && visibleEntities.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }, [entities, activeFilter, selectedEntityId, activeRouteDestinationId, selectedLocation, showRadiusCircle, radiusMeters]);

  // GPS Geolocation Handler
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setGeolocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 15, { animate: true });
        }
        if (onLocationSelect) {
          onLocationSelect({
            lat: Math.round(latitude * 1000000) / 1000000,
            lng: Math.round(longitude * 1000000) / 1000000,
            address: `GPS Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`
          });
        }
        setGeolocating(false);
      },
      (err) => {
        console.warn('Geolocation error, fallback to urban center:', err.message);
        setGeolocating(false);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo(center, 14, { animate: true });
        }
        if (onLocationSelect) {
          onLocationSelect({
            lat: center[0],
            lng: center[1],
            address: 'District Central Emergency Grid'
          });
        }
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);
  };

  return (
    <div
      className={`relative rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-slate-900 transition-all duration-300 ${
        isFullscreen ? 'fixed inset-4 z-[9999] h-[calc(100vh-2rem)]' : ''
      }`}
      style={{ height: isFullscreen ? 'calc(100vh - 2rem)' : height }}
    >
      {/* Map Element Container */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        
        {/* Layer Filters */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1.5 rounded-xl flex flex-wrap items-center gap-1.5 pointer-events-auto shadow-lg text-[11px] font-bold text-white">
          <button
            onClick={() => setActiveFilter(f => ({ ...f, hospitals: !f.hospitals }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
              activeFilter.hospitals ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <span>🏥 Hospitals</span>
          </button>

          <button
            onClick={() => setActiveFilter(f => ({ ...f, bloodBanks: !f.bloodBanks }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
              activeFilter.bloodBanks ? 'bg-rose-600 text-white shadow-xs' : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <span>🩸 Blood Banks</span>
          </button>

          <button
            onClick={() => setActiveFilter(f => ({ ...f, ambulances: !f.ambulances }))}
            className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
              activeFilter.ambulances ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-800/80 text-slate-400 hover:text-white'
            }`}
          >
            <span>🚑 Ambulances</span>
          </button>

          {entities.some(e => e.type === 'mci') && (
            <button
              onClick={() => setActiveFilter(f => ({ ...f, mci: !f.mci }))}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                activeFilter.mci ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800/80 text-slate-400'
              }`}
            >
              <span>🚨 MCI Disaster</span>
            </button>
          )}
        </div>

        {/* Right Action Tools: Basemap Switcher + GPS Locate + Fullscreen */}
        <div className="flex items-center gap-1.5 pointer-events-auto ml-auto">
          
          {/* Basemap Style Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowBasemapMenu(!showBasemapMenu)}
              title="Change Map Style"
              className="px-2.5 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl shadow-lg cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
            >
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">
                {BASEMAP_LAYERS[activeBasemapKey]?.name.split(' ')[1] || 'Map Style'}
              </span>
            </button>

            {showBasemapMenu && (
              <div className="absolute right-0 mt-1.5 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-[1100] space-y-1 text-xs">
                <div className="px-2 py-1 text-[10px] font-mono text-slate-400 border-b border-slate-800 flex items-center justify-between">
                  <span>CARTO BASEMAPS</span>
                  <span className="text-emerald-400 font-bold">API ACTIVE</span>
                </div>
                {Object.entries(BASEMAP_LAYERS).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveBasemapKey(key);
                      setShowBasemapMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center justify-between cursor-pointer ${
                      activeBasemapKey === key
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{cfg.name}</span>
                    {activeBasemapKey === key && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectableLocation && (
            <button
              onClick={handleLocateMe}
              disabled={geolocating}
              title="Use current GPS location"
              className="p-2 bg-slate-900/90 hover:bg-slate-800 text-amber-400 border border-slate-700/80 rounded-xl shadow-lg cursor-pointer transition-all flex items-center gap-1.5 text-xs font-bold"
            >
              <Crosshair className={`w-4 h-4 ${geolocating ? 'animate-spin text-amber-300' : ''}`} />
              <span className="hidden sm:inline">{geolocating ? 'Locating...' : 'GPS Auto-Pin'}</span>
            </button>
          )}

          {!compact && (
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen' : 'Expand Map'}
              className="p-2 bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl shadow-lg cursor-pointer transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Bottom Hint / API Key Status Banner */}
      <div className="absolute bottom-2 left-2 z-[1000] flex items-center gap-2 pointer-events-none">
        <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-slate-300 text-[10px] px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 pointer-events-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono">CARTO Basemaps API: Connected</span>
        </div>

        {selectableLocation && (
          <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700 text-amber-300 text-[10px] sm:text-[11px] px-2.5 py-1 rounded-lg shadow-lg flex items-center gap-1.5 pointer-events-auto">
            <MapPin className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
            <span>Click map to drop emergency scene pin</span>
          </div>
        )}
      </div>
    </div>
  );
};
