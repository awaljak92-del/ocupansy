import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ODP, User, fetchODPData, fetchUsers } from './lib/api';

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

  // Tracking
  searchHistory: string[];
  visitedODPs: string[];
  addSearchHistory: (query: string) => void;
  addVisitedODP: (odpName: string) => void;

  // Filters
  filterStatus: string;
  filterKabupatenKota: string;
  filterKecamatan: string;
  filterKelurahan: string;
  setFilterStatus: (status: string) => void;
  setFilterKabupatenKota: (kabupaten: string) => void;
  setFilterKecamatan: (kecamatan: string) => void;
  setFilterKelurahan: (kelurahan: string) => void;
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
        } catch (err) {
          set({ error: 'Gagal memuat data ODP', isLoading: false });
        }
      },
      loadUsers: async () => {
        try {
          const data = await fetchUsers(get().appScriptUrl);
          set({ users: data });
        } catch (err) {
          console.error("Failed to load users", err);
          throw err;
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

      filterStatus: 'all',
      filterKabupatenKota: 'all',
      filterKecamatan: 'all',
      filterKelurahan: 'all',
      setFilterStatus: (status) => set({ filterStatus: status }),
      setFilterKabupatenKota: (kabupaten) => set({ filterKabupatenKota: kabupaten, filterKecamatan: 'all', filterKelurahan: 'all' }),
      setFilterKecamatan: (kecamatan) => set({ filterKecamatan: kecamatan, filterKelurahan: 'all' }),
      setFilterKelurahan: (kelurahan) => set({ filterKelurahan: kelurahan }),
    }),
    {
      name: 'odp-app-storage',
      partialize: (state) => ({ 
        isAuthenticated: state.isAuthenticated, 
        user: state.user,
        appScriptUrl: state.appScriptUrl,
        searchHistory: state.searchHistory,
        visitedODPs: state.visitedODPs
      }),
    }
  )
);
