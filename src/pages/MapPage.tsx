import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';
import { Filter, RefreshCw } from 'lucide-react';
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

const icons = {
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

export default function MapPage() {
  const {
    odps, isLoading, loadODPs,
    filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan,
    setFilterStatus, setFilterKabupatenKota, setFilterKecamatan, setFilterKelurahan,
  } = useStore();

  const [showFilters, setShowFilters] = useState(false);
  const mapRef = useRef<L.Map | null>(null);

  // Refs untuk tracking perubahan filter (tidak menyebabkan re-render)
  const prevFilterKey = useRef('');
  const initialFitDone = useRef(false);

  useEffect(() => {
    loadODPs();
  }, [loadODPs]);

  // ── Dropdown filter options (hirarki cascade) ─────────────────────────────
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

  // ── Data yang sudah difilter ──────────────────────────────────────────────
  // Koordinat invalid (NaN/0,0) dibuang di sini agar counter == jumlah marker.
  const filteredODPs = useMemo(() => {
    return odps.filter(odp => {
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
  }, [odps, filterStatus, filterKabupatenKota, filterKecamatan, filterKelurahan]);

  const filterKey = `${filterStatus}|${filterKabupatenKota}|${filterKecamatan}|${filterKelurahan}`;

  // Posisi marker sebagai tuple [lat, lng] — sudah pasti valid
  const positions = useMemo<[number, number][]>(
    () => filteredODPs.map(o => [Number(o.LATITUDE), Number(o.LONGITUDE)]),
    [filteredODPs]
  );

  // ── Kontrol posisi peta ───────────────────────────────────────────────────
  // [1] Saat data pertama kali muat → fit ke semua marker
  useEffect(() => {
    if (initialFitDone.current || !mapRef.current || positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [60, 60] });
      initialFitDone.current = true;
    }
  }, [positions]);

  // [2] Saat filter berubah → fit ke marker hasil filter
  useEffect(() => {
    if (filterKey === prevFilterKey.current) return;
    prevFilterKey.current = filterKey;
    if (!mapRef.current || positions.length === 0) return;
    const bounds = L.latLngBounds(positions);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [filterKey, positions]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">

      {/* Peta */}
      <MapContainer
        ref={mapRef}
        center={[-6.2, 106.816]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {filteredODPs.map((odp) => {
          const status = getODPStatus(odp.OCC_2);
          const lat = Number(odp.LATITUDE);
          const lng = Number(odp.LONGITUDE);
          return (
            <Marker
              key={odp.ODP_NAME || `${lat}-${lng}`}
              position={[lat, lng]}
              icon={icons[status]}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <strong>{odp.ODP_NAME}</strong><br />
                  Status: <span style={{ textTransform: 'capitalize' }}>{status}</span><br />
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
        <div className="absolute top-4 left-4 z-[1000] bg-white rounded-xl shadow-xl p-4 w-64">
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
              {filteredODPs.length} ODP tampil
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
