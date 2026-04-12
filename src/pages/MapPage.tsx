import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline, Circle, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { Filter, RefreshCw, Search, X, LocateFixed, Loader2 } from 'lucide-react';
import { getODPStatus } from '../lib/api';
import { getRoutesToMany, formatDistance, formatDuration, type RouteResult } from '../lib/routing';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons based on status
const createIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-icon',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const icons = {
  black: createIcon('#000000'),
  green: createIcon('#22c55e'),
  yellow: createIcon('#eab308'),
  orange: createIcon('#f97316'),
  red: createIcon('#ef4444'),
};

const statusLabels: Record<string, string> = {
  black: 'Black (0%)',
  green: 'Green (<50%)',
  yellow: 'Yellow (50-80%)',
  orange: 'Orange (80-99%)',
  red: 'Red (100%)',
};

// Haversine distance in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Radius pencarian (meter)
const SEARCH_RADIUS = 250;

// Component to auto-center map
function MapBounds({ markers, center, userLocation, filterKey }: { markers: { lat: number; lng: number }[], center?: [number, number] | null, userLocation?: [number, number] | null, filterKey: string }) {
  const map = useMap();
  const [hasFitInitialBounds, setHasFitInitialBounds] = useState(false);
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  
  useEffect(() => {
    if (center) {
      map.setView(center, 16);
    }
  }, [center, map]);

  useEffect(() => {
    if (userLocation && !center) {
      map.setView(userLocation, 14);
    }
  }, [userLocation, map]);

  useEffect(() => {
    if (!hasFitInitialBounds && markers.length > 0) {
      try {
        const validMarkers = markers.filter(m => isFinite(m.lat) && isFinite(m.lng) && m.lat !== 0 && m.lng !== 0);
        if (validMarkers.length === 0) return;
        const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng]));
        if (bounds.isValid()) {
          if (userLocation) bounds.extend(userLocation);
          map.fitBounds(bounds, { padding: [50, 50] });
        }
      } catch (e) {
        console.error('[MapBounds] fitBounds initial error:', e);
      }
      setHasFitInitialBounds(true);
    }
  }, [markers, userLocation, map, hasFitInitialBounds]);

  // Adjust bounds when filter changes
  useEffect(() => {
    if (filterKey !== lastFilterKey) {
      if (markers.length > 0 && !center) {
        try {
          const validMarkers = markers.filter(m => isFinite(m.lat) && isFinite(m.lng) && m.lat !== 0 && m.lng !== 0);
          if (validMarkers.length > 0) {
            const bounds = L.latLngBounds(validMarkers.map(m => [m.lat, m.lng]));
            if (bounds.isValid()) {
              map.fitBounds(bounds, { padding: [50, 50] });
            }
          }
        } catch (e) {
          console.error('[MapBounds] fitBounds filter error:', e);
        }
      }
      setLastFilterKey(filterKey);
    }
  }, [filterKey, lastFilterKey, markers, map, center]);

  return null;
}

// Component: klik peta → set titik pencarian
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapPage() {
  const { 
    odps, isLoading, loadODPs, 
    filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan,
    setFilterStatus, setFilterKabupatenKota, setFilterKecamatan, setFilterKelurahan,
    addSearchHistory, addVisitedODP
  } = useStore();

  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchedCenter, setSearchedCenter] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Road routing state
  const [roadRoutes, setRoadRoutes] = useState<Map<string, RouteResult>>(new Map());
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routingProgress, setRoutingProgress] = useState('');
  const routeRequestId = useRef(0); // untuk membatalkan request lama

  const locateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
        (err) => console.error("Geolocation error:", err),
        { enableHighAccuracy: true }
      );
    }
  };

  useEffect(() => {
    loadODPs();
    locateUser();
  }, [loadODPs]);

  // Extract unique values for filters
  const kabupatens = useMemo(() => Array.from(new Set(odps.map(o => o.validate_kabupatenkota))).filter(Boolean), [odps]);
  
  const kecamatans = useMemo(() => {
    let filtered = odps;
    if (filterKabupatenKota !== 'all') {
      filtered = filtered.filter(o => o.validate_kabupatenkota === filterKabupatenKota);
    }
    return Array.from(new Set(filtered.map(o => o.validate_kecamatan))).filter(Boolean);
  }, [odps, filterKabupatenKota]);

  const kelurahans = useMemo(() => {
    let filtered = odps;
    if (filterKabupatenKota !== 'all') {
      filtered = filtered.filter(o => o.validate_kabupatenkota === filterKabupatenKota);
    }
    if (filterKecamatan !== 'all') {
      filtered = filtered.filter(o => o.validate_kecamatan === filterKecamatan);
    }
    return Array.from(new Set(filtered.map(o => o.validate_kelurahan))).filter(Boolean);
  }, [odps, filterKabupatenKota, filterKecamatan]);

  // Filter the data
  // Saat searchedCenter aktif (tap peta / cari koordinat):
  //   → BYPASS filter status/wilayah, hanya filter berdasarkan radius dari titik
  //   → Ini agar ODP di sekitar titik selalu tampil tidak peduli filter apa yang aktif
  // Saat tidak ada searchedCenter:
  //   → Filter status/wilayah berlaku normal
  const filteredODPs = useMemo(() => {
    if (searchedCenter) {
      // Mode pencarian: tampilkan semua ODP dalam radius, abaikan filter lain
      return odps.filter(odp => {
        const lat = Number(odp.LATITUDE);
        const lng = Number(odp.LONGITUDE);
        if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return false;
        return getDistance(searchedCenter[0], searchedCenter[1], lat, lng) <= SEARCH_RADIUS;
      });
    }

    // Mode filter biasa
    return odps.filter(odp => {
      const lat = Number(odp.LATITUDE);
      const lng = Number(odp.LONGITUDE);
      if (!isFinite(lat) || !isFinite(lng) || (lat === 0 && lng === 0)) return false;

      const status = getODPStatus(odp.OCC_2);
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterKabupatenKota !== 'all' && odp.validate_kabupatenkota !== filterKabupatenKota) return false;
      if (filterKecamatan !== 'all' && odp.validate_kecamatan !== filterKecamatan) return false;
      if (filterKelurahan !== 'all' && odp.validate_kelurahan !== filterKelurahan) return false;
      return true;
    });
  }, [odps, filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan, searchedCenter]);

  const isFilterActive = filterStatus !== 'all' || filterKabupatenKota !== 'all' || filterKecamatan !== 'all' || filterKelurahan !== 'all';
  const filterKey = `${filterStatus}-${filterKabupatenKota}-${filterKecamatan}-${filterKelurahan}`;

  // ── Fetch road routes dari lokasi user ke setiap ODP ──────────────────────
  // Maks 20 ODP untuk menghormati rate limit OSRM demo server
  const MAX_ROUTES = 20;
  const shouldShowRoutes = userLocation && filteredODPs.length > 0 && filteredODPs.length <= MAX_ROUTES;

  useEffect(() => {
    if (!shouldShowRoutes || !userLocation) {
      setRoadRoutes(new Map());
      return;
    }

    const currentRequestId = ++routeRequestId.current;
    setIsRoutingLoading(true);
    setRoutingProgress(`Menghitung rute 0/${filteredODPs.length}...`);

    const destinations = filteredODPs
      .filter(o => {
        const lat = Number(o.LATITUDE);
        const lng = Number(o.LONGITUDE);
        return isFinite(lat) && isFinite(lng) && lat !== 0 && lng !== 0;
      })
      .map(o => ({
        lat: Number(o.LATITUDE),
        lng: Number(o.LONGITUDE),
        key: o.ODP_NAME,
      }));

    getRoutesToMany(
      userLocation[0], userLocation[1],
      destinations,
      (done, total) => {
        if (routeRequestId.current === currentRequestId) {
          setRoutingProgress(`Menghitung rute ${done}/${total}...`);
        }
      }
    ).then((routes) => {
      // Hanya set jika ini masih request yang aktif (belum dibatalkan)
      if (routeRequestId.current === currentRequestId) {
        setRoadRoutes(routes);
        setIsRoutingLoading(false);
        setRoutingProgress('');
      }
    }).catch(() => {
      if (routeRequestId.current === currentRequestId) {
        setIsRoutingLoading(false);
        setRoutingProgress('');
      }
    });
  }, [userLocation?.[0], userLocation?.[1], filterKey, searchedCenter?.[0], searchedCenter?.[1], filteredODPs.length]);

  // Handler: tap di peta → set titik pencarian
  const handleMapClick = useCallback((lat: number, lng: number) => {
    setSearchedCenter([lat, lng]);
    setSearchInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) {
      setSearchedCenter(null);
      return;
    }

    addSearchHistory(searchInput);

    // Check if it's coordinates (e.g., "-6.200, 106.816")
    const coordMatch = searchInput.match(/^(-?\d+(\.\d+)?),\s*(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      setSearchedCenter([lat, lng]);
      return;
    }

    // Search by ODP Name
    const found = odps.find(o => o.ODP_NAME.toLowerCase().includes(searchInput.toLowerCase()));
    if (found) {
      setSearchedCenter([Number(found.LATITUDE), Number(found.LONGITUDE)]);
      addVisitedODP(found.ODP_NAME);
    } else {
      alert("ODP tidak ditemukan");
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchedCenter(null);
  };

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Search Bar */}
      <div className="absolute top-4 left-4 right-16 z-[1000]">
        <form onSubmit={handleSearch} className="flex bg-white rounded-lg shadow-lg overflow-hidden">
          <input 
            type="text" 
            placeholder="Cari ODP atau Koordinat (Lat, Lng)..." 
            className="flex-1 px-4 py-3 outline-none text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} className="p-3 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          )}
          <button type="submit" className="bg-blue-600 text-white p-3 hover:bg-blue-700 transition-colors">
            <Search size={20} />
          </button>
        </form>
      </div>

      {/* Map Area */}
      <div className="flex-1 relative z-0">
        <MapContainer 
          center={[-6.200000, 106.816666]} 
          zoom={12} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Tap peta → set titik pencarian */}
          <MapClickHandler onMapClick={handleMapClick} />

          {/* User Location Marker */}
          {userLocation && (
            <Marker position={userLocation} icon={L.divIcon({ className: '', html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(59,130,246,0.6)"></div>', iconSize: [16, 16], iconAnchor: [8, 8] })}>
              <Popup>Lokasi Anda</Popup>
            </Marker>
          )}

          {/* Lingkaran radius + marker titik pencarian */}
          {searchedCenter && (
            <>
              <Circle center={searchedCenter} radius={SEARCH_RADIUS} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 2 }} />
              <Marker position={searchedCenter} icon={L.divIcon({ className: '', html: '<div style="background:#dc2626;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 6px rgba(220,38,38,0.6)"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })}>
                <Popup>
                  <div>
                    <strong>Titik Pencarian</strong><br/>
                    <span style={{fontSize:'11px',color:'#666'}}>
                      {searchedCenter[0].toFixed(6)}, {searchedCenter[1].toFixed(6)}
                    </span><br/>
                    <span style={{fontSize:'11px'}}>
                      {filteredODPs.length} ODP dalam radius {SEARCH_RADIUS}m
                    </span>
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          {/* === RUTE JALAN dari lokasi user ke setiap ODP (mengikuti jalan) === */}
          {shouldShowRoutes && filteredODPs.map((odp) => {
            const route = roadRoutes.get(odp.ODP_NAME);
            if (!route) return null; // belum dimuat atau gagal
            return (
              <Polyline
                key={`road-${odp.ODP_NAME}`}
                positions={route.coordinates}
                color="#2563eb"
                weight={3}
                opacity={0.7}
              >
                <Tooltip
                  permanent
                  direction="center"
                  className="bg-white/90 text-blue-700 font-bold text-[10px] border-none shadow-sm px-1 py-0.5 rounded"
                >
                  {formatDistance(route.distance)} · {formatDuration(route.duration)}
                </Tooltip>
              </Polyline>
            );
          })}

          {/* === Marker ODP === */}
          {filteredODPs.map((odp) => {
            const status = getODPStatus(odp.OCC_2);
            const lat = Number(odp.LATITUDE);
            const lng = Number(odp.LONGITUDE);
            if (isNaN(lat) || isNaN(lng)) return null;
            const route = roadRoutes.get(odp.ODP_NAME);

            return (
              <Marker 
                key={odp.ODP_NAME || `${lat}-${lng}`} 
                position={[lat, lng]} 
                icon={icons[status]}
                eventHandlers={{
                  click: () => addVisitedODP(odp.ODP_NAME)
                }}
              >
                <Popup>
                  <div className="p-1">
                    <h3 className="font-bold text-lg border-b pb-1 mb-2">{odp.ODP_NAME}</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-semibold text-gray-600">Status:</span> <span className="capitalize">{status}</span></p>
                      <p><span className="font-semibold text-gray-600">Akupansi:</span> {odp.OCC_2}% ({odp.USED}/{odp.IS_TOTAL})</p>
                      <p><span className="font-semibold text-gray-600">STO:</span> {odp.STO}</p>
                      <p><span className="font-semibold text-gray-600">Kab/Kota:</span> {odp.validate_kabupatenkota}</p>
                      <p><span className="font-semibold text-gray-600">Kecamatan:</span> {odp.validate_kecamatan}</p>
                      <p><span className="font-semibold text-gray-600">Kelurahan:</span> {odp.validate_kelurahan}</p>
                      {route && (
                        <>
                          <hr className="my-2" />
                          <p><span className="font-semibold text-blue-600">📍 Jarak jalan:</span> {formatDistance(route.distance)}</p>
                          <p><span className="font-semibold text-blue-600">⏱️ Estimasi:</span> {formatDuration(route.duration)}</p>
                        </>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          <MapBounds 
            markers={filteredODPs.map(o => ({ lat: Number(o.LATITUDE), lng: Number(o.LONGITUDE) }))} 
            center={searchedCenter} 
            userLocation={userLocation}
            filterKey={filterKey}
          />
        </MapContainer>
      </div>

      {/* Floating Controls */}
      <div className="absolute top-20 right-4 z-[1000] flex flex-col gap-2">
        <button 
          onClick={() => locateUser()} 
          className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:text-blue-600 transition-colors"
          title="Lokasi Saya"
        >
          <LocateFixed size={20} />
        </button>
        <button 
          onClick={() => loadODPs()} 
          className="bg-white p-3 rounded-full shadow-lg text-gray-700 hover:text-blue-600 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw size={20} className={isLoading ? 'animate-spin text-blue-600' : ''} />
        </button>
        <button 
          onClick={() => setShowFilters(!showFilters)} 
          className={`bg-white p-3 rounded-full shadow-lg transition-colors ${showFilters ? 'text-blue-600' : 'text-gray-700'}`}
          title="Filter"
        >
          <Filter size={20} />
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="absolute top-20 left-4 right-20 z-[1000] bg-white rounded-xl shadow-xl p-4 max-h-[70vh] overflow-y-auto">
          <h3 className="font-bold text-gray-800 mb-3">Filter ODP</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status Akupansi</label>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 bg-gray-50 border"
              >
                <option value="all">Semua Status</option>
                {Object.entries(statusLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kabupaten/Kota</label>
              <select 
                value={filterKabupatenKota} 
                onChange={(e) => setFilterKabupatenKota(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 bg-gray-50 border"
              >
                <option value="all">Semua Kabupaten/Kota</option>
                {kabupatens.map(kab => (
                  <option key={kab} value={kab}>{kab}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kecamatan</label>
              <select 
                value={filterKecamatan} 
                onChange={(e) => setFilterKecamatan(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 bg-gray-50 border"
                disabled={filterKabupatenKota === 'all'}
              >
                <option value="all">Semua Kecamatan</option>
                {kecamatans.map(kec => (
                  <option key={kec} value={kec}>{kec}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kelurahan</label>
              <select 
                value={filterKelurahan} 
                onChange={(e) => setFilterKelurahan(e.target.value)}
                className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 bg-gray-50 border"
                disabled={filterKecamatan === 'all'}
              >
                <option value="all">Semua Kelurahan</option>
                {kelurahans.map(kel => (
                  <option key={kel} value={kel}>{kel}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-500">Menampilkan {filteredODPs.length} ODP</span>
            <button 
              onClick={() => setShowFilters(false)}
              className="text-sm text-blue-600 font-medium"
            >
              Tutup
            </button>
          </div>
          {filteredODPs.length > MAX_ROUTES && (
            <p className="text-[10px] text-orange-500 mt-2">⚠️ Rute jalan hanya ditampilkan untuk maks {MAX_ROUTES} ODP. Filter lebih spesifik untuk melihat rute.</p>
          )}
        </div>
      )}

      {/* Loading indicator routing */}
      {isRoutingLoading && (
        <div className="absolute bottom-20 left-4 right-4 z-[1000] bg-white/95 rounded-lg shadow-lg p-3 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-blue-600" />
          <span className="text-sm text-gray-600">{routingProgress}</span>
        </div>
      )}
    </div>
  );
}
