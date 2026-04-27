import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents, Polyline, Circle, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { Filter, RefreshCw, Search, X, LocateFixed, Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
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

// User location icon — person silhouette
const userIcon = new L.DivIcon({
  className: '',
  html: `<div style="position:relative;width:32px;height:32px;">
    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#3b82f6" opacity="0.15"/>
      <circle cx="12" cy="8" r="3.5" fill="#2563eb"/>
      <path d="M5.5 19.5c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" stroke="#2563eb" stroke-width="2" stroke-linecap="round" fill="#3b82f6" fill-opacity="0.5"/>
      <circle cx="12" cy="12" r="11" stroke="#2563eb" stroke-width="1.5" fill="none"/>
    </svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Search point icon — crosshair pin
const searchIcon = new L.DivIcon({
  className: '',
  html: `<div style="position:relative;width:28px;height:36px;">
    <svg viewBox="0 0 28 36" width="28" height="36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C7.37 0 2 5.37 2 12c0 8.25 10.26 22.18 11.18 23.42a1 1 0 001.64 0C15.74 34.18 26 20.25 26 12 26 5.37 20.63 0 14 0z" fill="#dc2626"/>
      <circle cx="14" cy="12" r="5" fill="white"/>
      <line x1="14" y1="5" x2="14" y2="9" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="14" y1="15" x2="14" y2="19" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="7" y1="12" x2="11" y2="12" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="17" y1="12" x2="21" y2="12" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="14" cy="12" r="1.5" fill="#dc2626"/>
    </svg>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 36],
  popupAnchor: [0, -36],
});

const statusLabels: Record<string, string> = {
  black: 'Black (0%)',
  green: 'Green (<50%)',
  yellow: 'Yellow (50-80%)',
  orange: 'Orange (80-99%)',
  red: 'Red (100%)',
};

// Kendala icon — warning triangle
const kendalaIcon = new L.DivIcon({
  className: '',
  html: `<div style="position:relative;width:24px;height:24px;">
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L1 21h22L12 2z" fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
      <text x="12" y="17" text-anchor="middle" fill="white" font-size="12" font-weight="bold">!</text>
    </svg>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -24],
});

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

// Copyable coordinate component
function CopyableCoord({ lat, lng }: { lat: number; lng: number }) {
  const [copied, setCopied] = React.useState(false);
  const coordText = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(coordText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = coordText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      onClick={handleCopy}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        cursor: 'pointer',
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '6px',
        padding: '6px 10px',
        marginTop: '4px',
        transition: 'all 0.2s',
      }}
      title="Klik untuk copy koordinat"
    >
      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#0369a1', flex: 1 }}>
        {coordText}
      </span>
      {copied ? (
        <Check size={14} style={{ color: '#16a34a', flexShrink: 0 }} />
      ) : (
        <Copy size={14} style={{ color: '#0369a1', flexShrink: 0 }} />
      )}
      {copied && (
        <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>Copied!</span>
      )}
    </div>
  );
}

export default function MapPage() {
  const { 
    isLoading, loadODPs, loadUsers, getFilteredODPs,
    filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan,
    setFilterStatus, setFilterKabupatenKota, setFilterKecamatan, setFilterKelurahan,
    addSearchHistory, addVisitedODP,
    showKendala, toggleKendala, isKendalaLoading, getFilteredKendala,
    kendalaItems: allKendalaItems,
    filterMenuPenanganan, filterKategoriKendala, filterBulanKendala,
    setFilterMenuPenanganan, setFilterKategoriKendala, setFilterBulanKendala
  } = useStore();

  // Role-based filtered ODPs (admin only sees their datel)
  const odps = getFilteredODPs();
  const kendalaItems = showKendala ? getFilteredKendala() : [];

  // Unique values for kendala filter dropdowns (dari seluruh data, bukan yang sudah difilter)
  const kendalaMenuOptions = useMemo(() => 
    Array.from(new Set(allKendalaItems.map(k => k.menuPenanganan).filter(Boolean))).sort(),
    [allKendalaItems]
  );
  const kendalaKategoriOptions = useMemo(() => 
    Array.from(new Set(allKendalaItems.map(k => k.kategoriKendala).filter(Boolean))).sort(),
    [allKendalaItems]
  );
  const kendalaBulanOptions = useMemo(() => 
    Array.from(new Set(allKendalaItems.map(k => k.bulan).filter(Boolean))).sort(),
    [allKendalaItems]
  );

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
    // Refresh user data (datel) then load ODPs
    loadUsers().catch(() => {});
    loadODPs();
    locateUser();
  }, [loadODPs, loadUsers]);

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
  // - Tanpa aksi (tidak ada search & filter) → JANGAN tampilkan marker (kosong)
  // - Saat searchedCenter aktif (tap peta / cari koordinat) → tampilkan ODP dalam radius
  // - Saat filter aktif → filter status/wilayah berlaku
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

    // Jika tidak ada filter aktif → kembalikan array kosong (jangan tampilkan semua)
    const isFilterActive = filterStatus !== 'all' || filterKabupatenKota !== 'all' || filterKecamatan !== 'all' || filterKelurahan !== 'all';
    if (!isFilterActive) return [];

    // Mode filter: tampilkan ODP sesuai filter
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

  // ── Titik asal pengukuran rute ─────────────────────────────────────────────
  // Saat pencarian aktif:
  //   → Jika user berada di area (dalam radius) → ukur dari lokasi user
  //   → Jika user di luar area → ukur dari titik pencarian
  // Tanpa pencarian: ukur dari lokasi user
  const routeOrigin = useMemo<[number, number] | null>(() => {
    if (searchedCenter) {
      if (userLocation) {
        const distUserToSearch = getDistance(userLocation[0], userLocation[1], searchedCenter[0], searchedCenter[1]);
        if (distUserToSearch <= SEARCH_RADIUS) {
          // User di area pencarian → ukur dari user
          return userLocation;
        }
      }
      // User di luar area → ukur dari titik pencarian
      return searchedCenter;
    }
    // Tidak ada pencarian → ukur dari user
    return userLocation;
  }, [searchedCenter, userLocation]);

  // ── Fetch road routes dari titik asal ke setiap ODP ───────────────────────
  // Maks 20 ODP untuk menghormati rate limit OSRM demo server
  const MAX_ROUTES = 20;
  const shouldShowRoutes = routeOrigin && filteredODPs.length > 0 && filteredODPs.length <= MAX_ROUTES;

  useEffect(() => {
    if (!shouldShowRoutes || !routeOrigin) {
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
      routeOrigin[0], routeOrigin[1],
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
  }, [routeOrigin?.[0], routeOrigin?.[1], filterKey, filteredODPs.length]);

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
            <Marker position={userLocation} icon={userIcon}>
              <Popup>Lokasi Anda</Popup>
            </Marker>
          )}

          {/* Lingkaran radius + marker titik pencarian */}
          {searchedCenter && (
            <>
              <Circle center={searchedCenter} radius={SEARCH_RADIUS} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.08, weight: 2 }} />
              <Marker position={searchedCenter} icon={searchIcon}>
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
                      <div>
                        <span className="font-semibold text-gray-600">Koordinat:</span>
                        <CopyableCoord lat={lat} lng={lng} />
                      </div>
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
          {/* === Marker Kendala === */}
          {showKendala && kendalaItems.map((item, idx) => {
            if (item.latitude === 0 && item.longitude === 0) return null;
            const statusColor = item.statusOrder?.toUpperCase().includes('CLOSE') ? '#16a34a' : '#dc2626';
            return (
              <Marker
                key={`kendala-${idx}`}
                position={[item.latitude, item.longitude]}
                icon={kendalaIcon}
              >
                <Popup maxWidth={300}>
                  <div style={{ padding: '4px', minWidth: '220px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #ef4444', paddingBottom: '6px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '16px' }}>⚠️</span>
                      <h3 style={{ margin: 0, fontWeight: 'bold', fontSize: '14px', color: '#dc2626' }}>Kendala</h3>
                    </div>
                    <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Timestamp:</span> {item.timestamp || '-'}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Sektor:</span> {item.sektor}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Order ID:</span> {item.orderId || '-'}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Menu:</span> {item.menuPenanganan}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Kategori:</span> {item.kategoriKendala}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Kendala:</span> {item.kendalaSpesifik}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Sales:</span> {item.namaSales}</p>
                      <p style={{ margin: 0 }}><span style={{ fontWeight: 600, color: '#6b7280' }}>Channel:</span> {item.channel}</p>
                      <p style={{ margin: 0 }}>
                        <span style={{ fontWeight: 600, color: '#6b7280' }}>Status:</span>{' '}
                        <span style={{ fontWeight: 700, color: statusColor, textTransform: 'uppercase', fontSize: '11px' }}>{item.statusOrder}</span>
                      </p>
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#6b7280' }}>Koordinat:</span>
                        <CopyableCoord lat={item.latitude} lng={item.longitude} />
                      </div>
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
        <button 
          onClick={toggleKendala} 
          className={`p-3 rounded-full shadow-lg transition-colors ${showKendala ? 'bg-red-600 text-white' : 'bg-white text-gray-700 hover:text-red-600'}`}
          title={showKendala ? 'Sembunyikan Kendala' : 'Tampilkan Kendala'}
        >
          {isKendalaLoading ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <AlertTriangle size={20} />
          )}
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

      {/* Kendala layer panel */}
      {showKendala && !isKendalaLoading && (
        <div className="absolute bottom-20 left-4 right-4 z-[1000] bg-white rounded-xl shadow-xl border border-red-200 p-3" style={{ maxWidth: '360px' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <span className="text-sm font-bold text-red-700">Kendala</span>
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{kendalaItems.length} titik</span>
            </div>
            <button onClick={toggleKendala} className="text-gray-400 hover:text-red-600 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 uppercase">Menu Penanganan</label>
              <select
                value={filterMenuPenanganan}
                onChange={(e) => setFilterMenuPenanganan(e.target.value)}
                className="w-full border border-gray-300 rounded-md text-xs p-1.5 bg-gray-50 focus:border-red-500 focus:ring-red-500 outline-none"
              >
                <option value="all">Semua Menu</option>
                {kendalaMenuOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 uppercase">Kategori Kendala</label>
              <select
                value={filterKategoriKendala}
                onChange={(e) => setFilterKategoriKendala(e.target.value)}
                className="w-full border border-gray-300 rounded-md text-xs p-1.5 bg-gray-50 focus:border-red-500 focus:ring-red-500 outline-none"
              >
                <option value="all">Semua Kategori</option>
                {kendalaKategoriOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5 uppercase">Bulan</label>
              <select
                value={filterBulanKendala}
                onChange={(e) => setFilterBulanKendala(e.target.value)}
                className="w-full border border-gray-300 rounded-md text-xs p-1.5 bg-gray-50 focus:border-red-500 focus:ring-red-500 outline-none"
              >
                <option value="all">Semua Bulan</option>
                {kendalaBulanOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
      {showKendala && isKendalaLoading && (
        <div className="absolute bottom-20 left-4 z-[1000] bg-white/95 rounded-lg shadow-lg px-3 py-2 flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-red-600" />
          <span className="text-xs text-gray-600">Memuat data kendala...</span>
        </div>
      )}
    </div>
  );
}
