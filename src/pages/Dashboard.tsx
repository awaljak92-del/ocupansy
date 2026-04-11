import React, { useMemo } from 'react';
import { useStore } from '../store';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import { Activity, Users, MapPin, Search, Navigation } from 'lucide-react';
import { getODPStatus } from '../lib/api';

const COLORS = {
  black: '#000000',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
};

// Mock traffic data
const trafficData = [
  { time: '08:00', users: 12 },
  { time: '10:00', users: 25 },
  { time: '12:00', users: 45 },
  { time: '14:00', users: 30 },
  { time: '16:00', users: 50 },
  { time: '18:00', users: 20 },
];

export default function Dashboard() {
  const { odps, users, searchHistory, visitedODPs, user: currentUser } = useStore();

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

  const salesUsers = users.filter(u => u.role === 'sales');

  // Generate mock tracking data for other sales users, but use real local data for current user
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
      
      // Mock data for others
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

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Monitoring</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <MapPin className="text-blue-500 mb-2" size={28} />
          <span className="text-3xl font-bold text-gray-800">{stats.total}</span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">Total ODP</span>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center">
          <Activity className="text-green-500 mb-2" size={28} />
          <span className="text-3xl font-bold text-gray-800">98%</span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-wider text-center">System Uptime</span>
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

      {/* Top Visited & Searches (Current User / Team) */}
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

      {/* Status Distribution */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <h3 className="font-semibold text-gray-700 mb-4">Distribusi Akupansi ODP</h3>
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

      {/* Traffic Usage */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-700">Trafik Penggunaan Aplikasi</h3>
          <Users size={16} className="text-gray-400" />
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trafficData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="users" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
