import React, { useMemo } from 'react';
import { useStore, type WeeklySnapshot } from '../store';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';
import { Activity, Users, MapPin, Search, Navigation, TrendingUp, Calendar } from 'lucide-react';
import { getODPStatus } from '../lib/api';

const COLORS = {
  black: '#374151',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  black: 'Kosong',
  green: '<50%',
  yellow: '50-80%',
  orange: '80-99%',
  red: 'Penuh',
};

export default function Dashboard() {
  const { odps, users, searchHistory, visitedODPs, user: currentUser, weeklySnapshots } = useStore();

  const stats = useMemo(() => {
    const total = odps.length;
    const byStatus = {
      black: 0, green: 0, yellow: 0, orange: 0, red: 0
    };
    
    odps.forEach(odp => {
      const status = getODPStatus(odp.OCC_2);
      if (byStatus[status] !== undefined) {
        byStatus[status]++;
      }
    });

    const pieData = Object.entries(byStatus).map(([name, value]) => ({
      name, value
    })).filter(d => d.value > 0);

    // Group by Kabupaten/Kota
    const byKabupaten: Record<string, number> = {};
    odps.forEach(odp => {
      const kab = odp.validate_kabupatenkota || 'Unknown';
      byKabupaten[kab] = (byKabupaten[kab] || 0) + 1;
    });
    
    const barData = Object.entries(byKabupaten).map(([name, count]) => ({
      name, count
    }));

    return { total, byStatus, pieData, barData };
  }, [odps]);

  // Data progress mingguan untuk chart
  const weeklyChartData = useMemo(() => {
    return weeklySnapshots.map(snap => ({
      week: snap.weekLabel,
      Kosong: snap.black,
      'Rendah': snap.green,
      'Sedang': snap.yellow,
      'Tinggi': snap.orange,
      Penuh: snap.red,
      'Rata-rata Okupansi': snap.avgOcc,
      total: snap.total,
    }));
  }, [weeklySnapshots]);

  // Perbandingan minggu ini vs minggu lalu
  const weeklyComparison = useMemo(() => {
    if (weeklySnapshots.length < 2) return null;
    const current = weeklySnapshots[weeklySnapshots.length - 1];
    const prev = weeklySnapshots[weeklySnapshots.length - 2];
    return {
      redDelta: current.red - prev.red,
      orangeDelta: current.orange - prev.orange,
      greenDelta: current.green - prev.green,
      blackDelta: current.black - prev.black,
      avgOccDelta: current.avgOcc - prev.avgOcc,
      totalDelta: current.total - prev.total,
    };
  }, [weeklySnapshots]);

  const salesUsers = users.filter(u => u.role === 'sales');

  const salesTrackingData = useMemo(() => {
    return salesUsers.map((u, i) => {
      if (u.username === currentUser?.username) {
        return {
          ...u,
          lastActive: 'Baru saja',
          totalSearches: searchHistory.length,
          totalVisited: visitedODPs.length,
          topVisited: visitedODPs.slice(0, 3),
          topSearches: searchHistory.slice(0, 3)
        };
      }
      
      return {
        ...u,
        lastActive: `${Math.floor(Math.random() * 5) + 1} jam yang lalu`,
        totalSearches: Math.floor(Math.random() * 50) + 10,
        totalVisited: Math.floor(Math.random() * 30) + 5,
        topVisited: ['ODP-JKT-002', 'ODP-JKT-005', 'ODP-JKT-008'].slice(0, Math.floor(Math.random() * 3) + 1),
        topSearches: ['Menteng', '-6.200, 106.816', 'Kuningan'].slice(0, Math.floor(Math.random() * 3) + 1)
      };
    });
  }, [salesUsers, currentUser, searchHistory, visitedODPs]);

  const DeltaBadge = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
    if (value === 0) return <span className="text-xs text-gray-400">—</span>;
    const isUp = value > 0;
    return (
      <span className={`text-xs font-medium ${isUp ? 'text-red-500' : 'text-green-500'}`}>
        {isUp ? '▲' : '▼'} {Math.abs(value)}{suffix}
      </span>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Monitoring</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <MapPin className="text-blue-500 mb-2" size={28} />
          <span className="text-3xl font-bold text-gray-800">{stats.total}</span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">Total ODP</span>
          {weeklyComparison && (
            <DeltaBadge value={weeklyComparison.totalDelta} />
          )}
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <Activity className="text-orange-500 mb-2" size={28} />
          <span className="text-3xl font-bold text-gray-800">
            {weeklySnapshots.length > 0 ? weeklySnapshots[weeklySnapshots.length - 1].avgOcc : 0}%
          </span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">Rata-rata Okupansi</span>
          {weeklyComparison && (
            <DeltaBadge value={weeklyComparison.avgOccDelta} suffix="%" />
          )}
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <div className="w-7 h-7 rounded-full mb-2" style={{ background: '#ef4444' }}></div>
          <span className="text-3xl font-bold text-gray-800">{stats.byStatus.red}</span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">ODP Penuh (100%)</span>
          {weeklyComparison && (
            <DeltaBadge value={weeklyComparison.redDelta} />
          )}
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <div className="w-7 h-7 rounded-full mb-2" style={{ background: '#374151' }}></div>
          <span className="text-3xl font-bold text-gray-800">{stats.byStatus.black}</span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">ODP Kosong (0%)</span>
          {weeklyComparison && (
            <DeltaBadge value={weeklyComparison.blackDelta} />
          )}
        </div>
      </div>

      {/* ══════════ PROGRESS MINGGUAN ══════════ */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-blue-500" />
          <h3 className="font-semibold text-gray-700">Progress Okupansi Mingguan</h3>
        </div>

        {weeklySnapshots.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">Belum ada data mingguan.</p>
            <p className="text-xs">Data akan terekam setiap kali Anda membuka aplikasi.</p>
          </div>
        ) : weeklySnapshots.length === 1 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-4">Minggu ini ({weeklySnapshots[0].weekLabel})</p>
            <div className="flex justify-center gap-4 flex-wrap">
              {(['black', 'green', 'yellow', 'orange', 'red'] as const).map(status => (
                <div key={status} className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: COLORS[status] }}>
                    {weeklySnapshots[0][status]}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">Grafik tren muncul mulai minggu ke-2.</p>
          </div>
        ) : (
          <>
            {/* Area chart: distribusi status per minggu */}
            <div className="h-56 mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                  <Area type="monotone" dataKey="Penuh" stackId="1" fill="#ef4444" stroke="#ef4444" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="Tinggi" stackId="1" fill="#f97316" stroke="#f97316" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="Sedang" stackId="1" fill="#eab308" stroke="#eab308" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="Rendah" stackId="1" fill="#22c55e" stroke="#22c55e" fillOpacity={0.8} />
                  <Area type="monotone" dataKey="Kosong" stackId="1" fill="#374151" stroke="#374151" fillOpacity={0.8} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-[10px]">
              {Object.entries(COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }}></div>
                  <span className="text-gray-500">{STATUS_LABELS[status]}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Grafik rata-rata okupansi mingguan */}
      {weeklySnapshots.length >= 2 && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-orange-500" />
            <h3 className="font-semibold text-gray-700">Tren Rata-rata Okupansi (%)</h3>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
                  formatter={(value: number) => [`${value}%`, 'Okupansi']}
                />
                <Line
                  type="monotone"
                  dataKey="Rata-rata Okupansi"
                  stroke="#f97316"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#f97316', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 7 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Status Distribution */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">Distribusi Akupansi ODP (Saat Ini)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {stats.pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, `Status: ${name}`]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap justify-center gap-3 mt-2">
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="flex items-center text-xs">
              <div className="w-3 h-3 rounded-full mr-1" style={{ backgroundColor: COLORS[status as keyof typeof COLORS] }}></div>
              <span className="capitalize text-gray-600">{status}: {count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ODP per Kabupaten */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">ODP per Kabupaten/Kota</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: '#f9fafb' }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sales Users Table */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Aktivitas Sales</h3>
          <Users size={16} className="text-gray-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50">
              <tr>
                <th className="px-4 py-2">Nama</th>
                <th className="px-4 py-2">Terakhir Aktif</th>
                <th className="px-4 py-2 text-center">Pencarian</th>
                <th className="px-4 py-2 text-center">Kunjungan</th>
              </tr>
            </thead>
            <tbody>
              {salesTrackingData.map((user, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-500">{user.lastActive}</td>
                  <td className="px-4 py-3 text-center">{user.totalSearches}</td>
                  <td className="px-4 py-3 text-center">{user.totalVisited}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Visited & Searches */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Navigation size={16} className="text-blue-500" />
            <h3 className="font-semibold text-gray-700">Sering Dikunjungi (Anda)</h3>
          </div>
          <ul className="space-y-2">
            {visitedODPs.length > 0 ? visitedODPs.slice(0, 5).map((odp, idx) => (
              <li key={idx} className="text-sm p-2 bg-gray-50 rounded border border-gray-100 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">{idx + 1}</span>
                {odp}
              </li>
            )) : <p className="text-sm text-gray-500 italic">Belum ada data kunjungan.</p>}
          </ul>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Search size={16} className="text-orange-500" />
            <h3 className="font-semibold text-gray-700">Sering Dicari (Anda)</h3>
          </div>
          <ul className="space-y-2">
            {searchHistory.length > 0 ? searchHistory.slice(0, 5).map((query, idx) => (
              <li key={idx} className="text-sm p-2 bg-gray-50 rounded border border-gray-100 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">{idx + 1}</span>
                {query}
              </li>
            )) : <p className="text-sm text-gray-500 italic">Belum ada data pencarian.</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
