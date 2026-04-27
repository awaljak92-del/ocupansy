export type ODPStatus = 'black' | 'green' | 'yellow' | 'orange' | 'red';
export type UserRole = 'sales' | 'admin' | 'owner';

export interface User {
  username: string;
  password?: string;
  role: UserRole;
  name: string;
  datel?: string; // maps to ODP.DATEL — e.g. "PANGKALAN BUN", "SAMPIT"
}

export interface ODP {
  ODP_NAME: string;
  LATITUDE: number;
  LONGITUDE: number;
  AVAI: number;
  USED: number;
  RSV: number;
  RSK: number;
  IS_TOTAL: number;
  STO: string;
  DATEL: string;
  TGL_GOLIVE: string;
  TAHUN_ODP: string | number;
  BULAN_ODP: string | number;
  OCC_2: string | number;
  validate_kelurahan: string;
  validate_kecamatan: string;
  validate_kabupatenkota: string;
}

export function getODPStatus(occ: string | number): ODPStatus {
  if (typeof occ === 'string') {
    const lower = occ.toLowerCase().trim();
    if (['black', 'green', 'yellow', 'orange', 'red'].includes(lower)) {
      return lower as ODPStatus;
    }
  }

  const numOcc = Number(occ);
  if (isNaN(numOcc) || numOcc === 0) return 'black';
  if (numOcc < 50) return 'green';
  if (numOcc < 80) return 'yellow';
  if (numOcc < 100) return 'orange';
  return 'red';
}

// Ganti string kosong di bawah ini dengan URL Web App Google Apps Script Anda
// Contoh: "https://script.google.com/macros/s/AKfycbx.../exec"
export const APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbyeaV8jjNZ-XqBvZvvzKa0c_fEjjSF22V0b0ciRH1TvEFae-4ctigoGjsYq8DEpq4N7/exec";

export async function fetchODPData(appScriptUrl?: string): Promise<ODP[]> {
  const targetUrl = appScriptUrl || APPSCRIPT_URL;
  if (!targetUrl) {
    throw new Error("APPSCRIPT_URL is not configured.");
  }

  try {
    const url = new URL(targetUrl);
    url.searchParams.append('action', 'getODPs');
    const response = await fetch(url.toString());
    const data = await response.json();
    
    // Validasi: pastikan response adalah array
    if (!Array.isArray(data)) {
      console.error("API response bukan array:", data);
      // Jika data dibungkus dalam object (mis. { data: [...] }), coba unwrap
      if (data && Array.isArray(data.data)) return data.data as ODP[];
      if (data && Array.isArray(data.result)) return data.result as ODP[];
      return [];
    }
    return data as ODP[];
  } catch (error) {
    console.error("Failed to fetch ODPs from AppScript", error);
    throw error;
  }
}

export async function fetchUsers(appScriptUrl?: string): Promise<User[]> {
  const targetUrl = appScriptUrl || APPSCRIPT_URL;
  if (!targetUrl) {
    throw new Error("APPSCRIPT_URL is not configured.");
  }

  try {
    const url = new URL(targetUrl);
    url.searchParams.append('action', 'getUsers');
    const response = await fetch(url.toString());
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return data as User[];
  } catch (error) {
    console.error("Failed to fetch Users from AppScript", error);
    throw error;
  }
}

// ════════════════════════════════════════════════════════════════════
// Kendala (Issues) — sumber data dari Google Sheets langsung
// ════════════════════════════════════════════════════════════════════

export interface KendalaItem {
  sektor: string;
  koordinat: string;
  latitude: number;
  longitude: number;
  menuPenanganan: string;
  kategoriKendala: string;
  kendalaSpesifik: string;
  namaSales: string;
  channel: string;
  statusOrder: string;
}

const KENDALA_SHEET_ID = '1ZCQR8Y4GvDAwGekco37y7mj8lkcJah9INYFsiH4egSM';

function parseCoordinateString(coord: string): [number, number] {
  if (!coord) return [0, 0];
  // Format: "-2.6850, 111.6258" atau "-2.6850 111.6258"
  const cleaned = coord.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/[,\s]+/).map(s => parseFloat(s.trim()));
  if (parts.length >= 2 && isFinite(parts[0]) && isFinite(parts[1])) {
    return [parts[0], parts[1]];
  }
  return [0, 0];
}

export async function fetchKendala(): Promise<KendalaItem[]> {
  // Baca dari Google Sheets via gviz endpoint
  // headers=2 → baris 1 = judul, baris 2 = header kolom, data mulai baris 3
  const url = `https://docs.google.com/spreadsheets/d/${KENDALA_SHEET_ID}/gviz/tq?tqx=out:json&headers=2&sheet=kendala`;

  try {
    const response = await fetch(url);
    const text = await response.text();

    // Response format: /*O_o*/\ngoogle.visualization.Query.setResponse({...});
    const match = text.match(/setResponse\s*\(\s*(\{[\s\S]*\})\s*\)/);
    if (!match) throw new Error('Format response gviz tidak valid');

    const json = JSON.parse(match[1]);
    const cols: any[] = json.table.cols || [];
    const rows: any[] = json.table.rows || [];

    // Cari index kolom berdasarkan label
    const colIndex: Record<string, number> = {};
    cols.forEach((col: any, i: number) => {
      const label = col.label?.toString()?.trim()?.toUpperCase();
      if (label) colIndex[label] = i;
    });

    console.log('[Kendala] Kolom yang ditemukan:', Object.keys(colIndex));

    const getIdx = (name: string): number | undefined => colIndex[name];

    const SEKTOR = getIdx('SEKTOR');
    const KOORDINAT = getIdx('KOORDINAT PELANGGAN TEKNISI');
    const MENU = getIdx('MENU PENANGANAN');
    const KATEGORI = getIdx('KATEGORI KENDALA');
    const KENDALA = getIdx('KENDALA SPESIFIK');
    const SALES = getIdx('NAMA SALES');
    const CHANNEL = getIdx('CHANNEL');
    const STATUS = getIdx('STATUS ORDER');

    const items: KendalaItem[] = [];

    for (const row of rows) {
      const cells = row.c || [];
      const val = (idx: number | undefined): string => {
        if (idx === undefined || !cells[idx]) return '';
        return cells[idx].v?.toString()?.trim() || '';
      };

      const sektor = val(SEKTOR).toUpperCase();
      // Hanya ambil PANGKALAN BUN dan SAMPIT
      if (sektor !== 'PANGKALAN BUN' && sektor !== 'SAMPIT') continue;

      const koordinat = val(KOORDINAT);
      const [lat, lng] = parseCoordinateString(koordinat);

      items.push({
        sektor,
        koordinat,
        latitude: lat,
        longitude: lng,
        menuPenanganan: val(MENU),
        kategoriKendala: val(KATEGORI),
        kendalaSpesifik: val(KENDALA),
        namaSales: val(SALES),
        channel: val(CHANNEL),
        statusOrder: val(STATUS),
      });
    }

    console.log(`[Kendala] Total items: ${items.length}`);
    return items;
  } catch (error) {
    console.error('Gagal memuat data Kendala dari Google Sheets:', error);
    throw error;
  }
}

