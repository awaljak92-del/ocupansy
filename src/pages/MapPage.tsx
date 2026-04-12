import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { Filter, RefreshCw, LocateFixed } from 'lucide-react';
import { getODPStatus } from '../lib/api';

// Fix Leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const createIcon = (color: string) =>
  new L.DivIcon({
    className: '',
    html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const icons: Record<string, L.DivIcon> = {
  black:  createIcon('#111111'),
  green:  createIcon('#22c55e'),
  yellow: createIcon('#eab308'),
  orange: createIcon('#f97316'),
  red:    createIcon('#ef4444'),
};

const statusLabels: Record<string, string> = {
  black:  'Black (0%)',
  green:  'Green (<50%)',
  yellow: 'Yellow (50-80%)',
  orange: 'Orange (80-99%)',
  red:    'Red (100%)',
};

// ─── Komponen kecil untuk mengontrol posisi peta ────────────────────────────
// react-leaflet TIDAK mendukung ref pada MapContainer →
// satu-satunya cara akses L.Map adalah lewat useMap() di child component.
function MapController({ positions, filterKey }: {
  positions: [number, number][];
  filterKey: string;
}) {
  const map = useMap();
  const lastFilterKey = useRef('__initial__');
  const initialDone = useRef(false);

  // [A] Fit ke semua marker saat data pertama kali muat
  useEffect(() => {
    if (initialDone.current) return;
    if (positions.length === 0) return;

    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      console.log('[MapController] Initial fitBounds, markers:', positions.length);
      map.fitBounds(bounds, { padding: [50, 50] });
      initialDone.current = true;
    }
  }, [positions, map]);

  // [B] Fit ke marker hasil filter saat filterKey berubah
  useEffect(() => {
    if (filterKey === lastFilterKey.current) return;
    lastFilterKey.current = filterKey;

    if (positions.length === 0) {
      console.log('[MapController] Filter changed, 0 markers');
      return;
    }

    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      console.log('[MapController] Filter changed → fitBounds, markers:', positions.length);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [filterKey, positions, map]);

  return null;
}

// ─── Komponen untuk pan ke lokasi user ──────────────────────────────────────
function LocateUser({ location }: { location: [number, number] | null }) {
  const map = useMap();
  const prevLoc = useRef('');

  useEffect(() => {
    if (!location) return;
    const key = `${location[0]},${location[1]}`;
    if (key === prevLoc.current) return;
    prevLoc.current = key;
    console.log('[LocateUser] Pan to user:', location);
    map.setView(location, 15);
  }, [location, map]);

  return null;
}

// ─── Komponen utama ─────────────────────────────────────────────────────────
export default function MapPage() {
  const {
    odps, isLoading, loadODPs,
    filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan,
    setFilterStatus, setFilterKabupatenKota, setFilterKecamatan, setFilterKelurahan,
  } = useStore();

  const [showFilters, setShowFilters] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  // Ambil lokasi user saat pertama kali buka halaman
  useEffect(() => {
    loadODPs();
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('[MapPage] Got user location:', pos.coords.latitude, pos.coords.longitude);
          setUserLocation([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => console.error('[MapPage] Geolocation error:', err),
        { enableHighAccuracy: true }
      );
    }
  }, [loadODPs]);

  // Data debug: log jumlah ODP saat dimuat
  useEffect(() => {
    console.log('[MapPage] Total ODPs loaded:', odps.length);
    if (odps.length > 0) {
      const sample = odps[0];
      console.log('[MapPage] Sample ODP:', {
        name: sample.ODP_NAME,
        lat: sample.LATITUDE, latType: typeof sample.LATITUDE,
        lng: sample.LONGITUDE, lngType: typeof sample.LONGITUDE,
        occ: sample.OCC_2,
        kab: sample.validate_kabupatenkota,
      });
    }
  }, [odps]);

  // ── Dropdown filter options ─────────────────────────────────────────────
  const kabupatens = useMemo(() =>
    Array.from(new Set(odps.map(o => o.validate_kabupatenkota))).filter(Boolean).sort(),
    [odps]
  );

  const kecamatans = useMemo(() => {
    const base = filterKabupatenKota !== 'all'
      ? odps.filter(o => o.validate_kabupatenkota === filterKabupatenKota)
      : odps;
    return Array.from(new Set(base.map(o => o.validate_kecamatan))).filter(Boolean).sort();
  }, [odps, filterKabupatenKota]);

  const kelurahans = useMemo(() => {
    let base = odps;
    if (filterKabupatenKota !== 'all') base = base.filter(o => o.validate_kabupatenkota === filterKabupatenKota);
    if (filterKecamatan !== 'all') base = base.filter(o => o.validate_kecamatan === filterKecamatan);
    return Array.from(new Set(base.map(o => o.validate_kelurahan))).filter(Boolean).sort();
  }, [odps, filterKabupatenKota, filterKecamatan]);

  // ── Data terfilter ────────────────────────────────────────────────────────
  const filteredODPs = useMemo(() => {
    const result = odps.filter(odp => {
      const lat = Number(odp.LATITUDE);
      const lng = Number(odp.LONGITUDE);
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return false;

      const status = getODPStatus(odp.OCC_2);
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      if (filterKabupatenKota !== 'all' && odp.validate_kabupatenkota !== filterKabupatenKota) return false;
      if (filterKecamatan !== 'all' && odp.validate_kecamatan !== filterKecamatan) return false;
      if (filterKelurahan !== 'all' && odp.validate_kelurahan !== filterKelurahan) return false;
      return true;
    });
    console.log('[MapPage] filteredODPs:', result.length);
    return result;
  }, [odps, filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan]);

  // Posisi marker — stabil (memoized)
  const positions = useMemo<[number, number][]>(
    () => filteredODPs.map(o => [Number(o.LATITUDE), Number(o.LONGITUDE)]),
    [filteredODPs]
  );

  const filterKey = `${filterStatus}|${filterKabupatenKota}|${filterKecamatan}|${filterKelurahan}`;

  return (
    <div className="relative h-full w-full">

      {/* Peta */}
      <MapContainer
        center={[-6.2, 106.816]}
        zoom={10}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Controller untuk fitBounds saat filter berubah */}
        <MapController positions={positions} filterKey={filterKey} />

        {/* Controller untuk pan ke lokasi user */}
        <LocateUser location={userLocation} />

        {/* Marker lokasi user */}
        {userLocation && (
          <Marker
            position={userLocation}
            icon={L.divIcon({
              className: '',
              html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px rgba(59,130,246,0.6)"></div>',
              iconSize: [16, 16],
              iconAnchor: [8, 8],
            })}
          >
            <Popup>Lokasi Anda</Popup>
          </Marker>
        )}

        {/* Marker ODP */}
        {filteredODPs.map((odp) => {
          const status = getODPStatus(odp.OCC_2);
          return (
            <Marker
              key={odp.ODP_NAME}
              position={[Number(odp.LATITUDE), Number(odp.LONGITUDE)]}
              icon={icons[status]}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>{odp.ODP_NAME}</strong><br />
                  Status: {status}<br />
                  Akupansi: {odp.OCC_2}% ({odp.USED}/{odp.IS_TOTAL})<br />
                  STO: {odp.STO}<br />
                  {odp.validate_kabupatenkota} / {odp.validate_kecamatan} / {odp.validate_kelurahan}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Tombol kanan atas */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        <button
          onClick={() => {
            if (navigator.geolocation) {
              navigator.geolocation.getCurrentPosition(
                (pos) => setUserLocation([pos.coords.latitude, pos.coords.longitude]),
                (err) => console.error(err),
                { enableHighAccuracy: true }
              );
            }
          }}
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

      {/* Panel filter */}
      {showFilters && (
        <div className="absolute top-4 left-4 z-[1000] bg-white rounded-xl shadow-xl p-4 w-64 max-h-[80vh] overflow-y-auto">
          <h3 className="font-bold text-gray-800 mb-3">Filter ODP</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full border rounded p-2 text-sm bg-gray-50"
              >
                <option value="all">Semua Status</option>
                {Object.entries(statusLabels).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kabupaten/Kota</label>
              <select
                value={filterKabupatenKota}
                onChange={e => setFilterKabupatenKota(e.target.value)}
                className="w-full border rounded p-2 text-sm bg-gray-50"
              >
                <option value="all">Semua</option>
                {kabupatens.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kecamatan</label>
              <select
                value={filterKecamatan}
                onChange={e => setFilterKecamatan(e.target.value)}
                className="w-full border rounded p-2 text-sm bg-gray-50"
                disabled={filterKabupatenKota === 'all'}
              >
                <option value="all">Semua</option>
                {kecamatans.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Kelurahan</label>
              <select
                value={filterKelurahan}
                onChange={e => setFilterKelurahan(e.target.value)}
                className="w-full border rounded p-2 text-sm bg-gray-50"
                disabled={filterKecamatan === 'all'}
              >
                <option value="all">Semua</option>
                {kelurahans.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t flex justify-between items-center">
            <span className="text-xs text-gray-500 font-medium">
              {filteredODPs.length} ODP
            </span>
            <button
              onClick={() => {
                setFilterStatus('all');
                setFilterKabupatenKota('all');
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
