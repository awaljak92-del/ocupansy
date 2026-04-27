import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ODP, User, fetchODPData, fetchUsers, getODPStatus } from './lib/api';

export interface WeeklySnapshot {
  weekKey: string;       // "2026-W15" or "2026-W15-SAMPIT"
  weekLabel: string;     // "7-13 Apr"
  timestamp: number;
  total: number;
  black: number;
  green: number;
  yellow: number;
  orange: number;
  red: number;
  avgOcc: number;        // rata-rata okupansi %
  datel: string;         // "ALL" | "PANGKALAN BUN" | "SAMPIT"
}

function getWeekKey(): string {
  const d = new Date();
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekLabel(): string {
  const d = new Date();
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${monday.getDate()}-${sunday.getDate()} ${months[sunday.getMonth()]}`;
}

function buildSnapshot(odps: ODP[], datel: string): WeeklySnapshot {
  const datelTag = datel || 'ALL';
  const snap: WeeklySnapshot = {
    weekKey: `${getWeekKey()}-${datelTag}`,
    weekLabel: getWeekLabel(),
    timestamp: Date.now(),
    total: odps.length,
    black: 0, green: 0, yellow: 0, orange: 0, red: 0,
    avgOcc: 0,
    datel: datelTag,
  };
  let totalOcc = 0;
  odps.forEach(odp => {
    const s = getODPStatus(odp.OCC_2);
    snap[s]++;
    totalOcc += Number(odp.OCC_2) || 0;
  });
  snap.avgOcc = odps.length > 0 ? Math.round(totalOcc / odps.length) : 0;
  return snap;
}

interface AppState {
  isAuthenticated: boolean;
  user: User | null;
  login: (user: User) => void;
  logout: () => void;

  appScriptUrl: string;
  setAppScriptUrl: (url: string) => void;

  odps: ODP[];
  users: User[];
  isLoading: boolean;
  error: string | null;
  loadODPs: () => Promise<void>;
  loadUsers: () => Promise<void>;
  refreshCurrentUser: () => void;

  // Tracking
  searchHistory: string[];
  visitedODPs: string[];
  addSearchHistory: (query: string) => void;
  addVisitedODP: (odpName: string) => void;

  // Weekly snapshots
  weeklySnapshots: WeeklySnapshot[];

  // Filters
  filterStatus: string;
  filterKabupatenKota: string;
  filterKecamatan: string;
  filterKelurahan: string;
  setFilterStatus: (status: string) => void;
  setFilterKabupatenKota: (kabupaten: string) => void;
  setFilterKecamatan: (kecamatan: string) => void;
  setFilterKelurahan: (kelurahan: string) => void;

  // Role-based filtered ODPs
  // owner: sees all ODPs | admin/sales: sees only ODPs matching user.datel (STO)
  getFilteredODPs: () => ODP[];

  // Role-based filtered weekly snapshots
  getFilteredSnapshots: () => WeeklySnapshot[];
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      user: null,
      login: (user) => set({ isAuthenticated: true, user }),
      logout: () => set({ isAuthenticated: false, user: null }),

      appScriptUrl: '',
      setAppScriptUrl: (url) => set({ appScriptUrl: url }),

      odps: [],
      users: [],
      isLoading: false,
      error: null,
      loadODPs: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await fetchODPData(get().appScriptUrl);
          set({ odps: data, isLoading: false });

          // Simpan snapshot mingguan (per datel)
          const filteredData = get().getFilteredODPs();
          const userDatel = get().user?.datel?.toUpperCase().trim() || '';
          if (filteredData.length > 0) {
            const snap = buildSnapshot(filteredData, userDatel);
            const existing = get().weeklySnapshots;
            // Update snapshot minggu+datel ini jika sudah ada, atau tambah baru
            const idx = existing.findIndex(s => s.weekKey === snap.weekKey);
            let updated: WeeklySnapshot[];
            if (idx >= 0) {
              updated = [...existing];
              updated[idx] = snap;
            } else {
              updated = [...existing, snap].slice(-50); // simpan maks 50 entries (multi-datel)
            }
            set({ weeklySnapshots: updated });
          }
        } catch (err) {
          set({ error: 'Gagal memuat data ODP', isLoading: false });
        }
      },
      loadUsers: async () => {
        try {
          const data = await fetchUsers(get().appScriptUrl);
          set({ users: data });
          // Auto-refresh current user data (pick up datel changes)
          get().refreshCurrentUser();
        } catch (err) {
          console.error("Failed to load users", err);
          throw err;
        }
      },
      refreshCurrentUser: () => {
        const { user, users } = get();
        if (user && users.length > 0) {
          const fresh = users.find(u => u.username === user.username);
          if (fresh) {
            console.log('[RBAC] Refreshing user data:', { old: user, fresh });
            set({ user: fresh });
          }
        }
      },

      searchHistory: [],
      visitedODPs: [],
      addSearchHistory: (query) => set((state) => {
        const newHistory = [query, ...state.searchHistory.filter(q => q !== query)].slice(0, 10);
        return { searchHistory: newHistory };
      }),
      addVisitedODP: (odpName) => set((state) => {
        const newVisited = [odpName, ...state.visitedODPs.filter(n => n !== odpName)].slice(0, 20);
        return { visitedODPs: newVisited };
      }),

      weeklySnapshots: [],

      filterStatus: 'all',
      filterKabupatenKota: 'all',
      filterKecamatan: 'all',
      filterKelurahan: 'all',
      setFilterStatus: (status) => set({ filterStatus: status }),
      setFilterKabupatenKota: (kabupaten) => set({ filterKabupatenKota: kabupaten, filterKecamatan: 'all', filterKelurahan: 'all' }),
      setFilterKecamatan: (kecamatan) => set({ filterKecamatan: kecamatan, filterKelurahan: 'all' }),
      setFilterKelurahan: (kelurahan) => set({ filterKelurahan: kelurahan }),

      // Role-based ODP access control
      getFilteredODPs: () => {
        const { user, odps } = get();
        // Owner sees everything
        if (!user || user.role === 'owner') return odps;

        // Admin & sales: WAJIB punya datel
        const datel = user.datel?.toUpperCase().trim();
        if (!datel) {
          console.warn('[RBAC] User tidak punya datel, tidak ada ODP yang ditampilkan:', user);
          return [];
        }

        // Mapping datel ke kabupaten/kota yang boleh dilihat
        const DATEL_KABUPATEN_MAP: Record<string, string[]> = {
          'PANGKALAN BUN': ['KOTAWARINGIN BARAT', 'LAMANDAU', 'SUKAMARA'],
          'SAMPIT': ['KOTAWARINGIN TIMUR', 'SERUYAN'],
        };
        const allowedKabs = DATEL_KABUPATEN_MAP[datel];
        if (!allowedKabs) {
          console.warn('[RBAC] Datel tidak dikenali:', datel);
          return [];
        }

        const filtered = odps.filter(odp => {
          const kab = odp.validate_kabupatenkota?.toUpperCase().trim();
          return kab ? allowedKabs.includes(kab) : false;
        });

        console.log(`[RBAC] User datel=${datel}, allowed=${allowedKabs.join(',')}, total=${odps.length}, filtered=${filtered.length}`);
        return filtered;
      },

      // Filter snapshots by current user's datel
      getFilteredSnapshots: () => {
        const { user, weeklySnapshots } = get();
        const datelTag = (!user || user.role === 'owner') ? 'ALL' : (user.datel?.toUpperCase().trim() || 'ALL');
        return weeklySnapshots
          .filter(s => s.datel === datelTag)
          .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
          .slice(-12); // maks 12 minggu terakhir
      },
    }),
    {
      name: 'odp-app-storage',
      partialize: (state) => ({ 
        isAuthenticated: state.isAuthenticated, 
        user: state.user,
        appScriptUrl: state.appScriptUrl,
        searchHistory: state.searchHistory,
        visitedODPs: state.visitedODPs,
        weeklySnapshots: state.weeklySnapshots,
      }),
    }
  )
);
