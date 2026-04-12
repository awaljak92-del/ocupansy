import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { Filter, RefreshCw, Search, X, LocateFixed } from 'lucide-react';
import { getODPStatus } from '../lib/api';

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
  const filteredODPs = useMemo(() => {
    let result = odps.filter(odp => {
      const status = getODPStatus(odp.OCC_2);
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterKabupatenKota !== 'all' && odp.validate_kabupatenkota !== filterKabupatenKota) return false;
      if (filterKecamatan !== 'all' && odp.validate_kecamatan !== filterKecamatan) return false;
      if (filterKelurahan !== 'all' && odp.validate_kelurahan !== filterKelurahan) return false;
      return true;
    });

    if (searchedCenter) {
      // If radius search is active, only show ODPs within 250m
      result = result.filter(odp => getDistance(searchedCenter[0], searchedCenter[1], Number(odp.LATITUDE), Number(odp.LONGITUDE)) <= 250);
    }

    return result;
  }, [odps, filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan, searchedCenter]);

  const isFilterActive = filterStatus !== 'all' || filterKabupatenKota !== 'all' || filterKecamatan !== 'all' || filterKelurahan !== 'all';
  const filterKey = `${filterStatus}-${filterKabupatenKota}-${filterKecamatan}-${filterKelurahan}`;

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

          {/* User Location Marker */}
          {userLocation && (
            <Marker position={userLocation} icon={L.divIcon({ className: 'bg-blue-500 w-4 h-4 rounded-full border-2 border-white shadow-lg', iconSize: [16, 16] })}>
              <Popup>Lokasi Anda</Popup>
            </Marker>
          )}

          {/* Routes when SEARCH is active */}
          {searchedCenter && (
            <>
              <Circle center={searchedCenter} radius={250} pathOptions={{ color: 'red', fillColor: 'red', fillOpacity: 0.1 }} />

              {/* Marker for searched coordinate if it's not an exact ODP match */}
              {!odps.find(o => Number(o.LATITUDE) === searchedCenter[0] && Number(o.LONGITUDE) === searchedCenter[1]) && (
                <Marker position={searchedCenter} icon={L.divIcon({ className: 'bg-red-600 w-3 h-3 rounded-full border-2 border-white shadow-md', iconSize: [12, 12] })}>
                  <Popup>Titik Pencarian</Popup>
                </Marker>
              )}

              {/* Route from User to Searched Center */}
              {userLocation && (
                <Polyline positions={[userLocation, searchedCenter]} color="blue" weight={3} dashArray="5, 5">
                  <Tooltip permanent direction="center" className="bg-white/90 text-blue-700 font-bold text-xs border-none shadow-sm px-1 py-0.5 rounded">
                    {(() => {
                      const dist = getDistance(userLocation[0], userLocation[1], searchedCenter[0], searchedCenter[1]);
                      return dist > 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
                    })()}
                  </Tooltip>
                </Polyline>
              )}

              {/* Routes from Searched Center to Alternative ODPs */}
              {filteredODPs.map((odp) => {
                const lat = Number(odp.LATITUDE);
                const lng = Number(odp.LONGITUDE);
                if (isNaN(lat) || isNaN(lng)) return null;

                const dist = getDistance(searchedCenter[0], searchedCenter[1], lat, lng);
                if (dist < 1) return null; // Skip if it's the exact same point
                return (
                  <Polyline key={`alt-${odp.ODP_NAME}`} positions={[searchedCenter, [lat, lng]]} color="red" weight={2} dashArray="4, 4" opacity={0.6}>
                    <Tooltip permanent direction="center" className="bg-white/90 text-red-600 font-bold text-[10px] border-none shadow-sm px-1 py-0.5 rounded">
                      {Math.round(dist)} m
                    </Tooltip>
                  </Polyline>
                );
              })}
            </>
          )}

          {/* Routes when FILTER is active (but NO search) */}
          {!searchedCenter && isFilterActive && userLocation && filteredODPs.length <= 50 && (
            <>
              {filteredODPs.map((odp) => {
                const lat = Number(odp.LATITUDE);
                const lng = Number(odp.LONGITUDE);
                if (isNaN(lat) || isNaN(lng)) return null;

                const dist = getDistance(userLocation[0], userLocation[1], lat, lng);
                return (
                  <Polyline key={`route-${odp.ODP_NAME}`} positions={[userLocation, [lat, lng]]} color="blue" weight={2} dashArray="4, 4" opacity={0.5}>
                    <Tooltip permanent direction="center" className="bg-white/90 text-blue-700 font-bold text-[10px] border-none shadow-sm px-1 py-0.5 rounded">
                      {dist > 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m'}
                    </Tooltip>
                  </Polyline>
                );
              })}
            </>
          )}

          {filteredODPs.map((odp) => {
            const status = getODPStatus(odp.OCC_2);
            const lat = Number(odp.LATITUDE);
            const lng = Number(odp.LONGITUDE);
            if (isNaN(lat) || isNaN(lng)) return null;

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
        </div>
      )}
    </div>
  );
}
