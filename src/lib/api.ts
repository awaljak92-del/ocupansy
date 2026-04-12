export type ODPStatus = 'black' | 'green' | 'yellow' | 'orange' | 'red';
export type UserRole = 'sales' | 'admin' | 'owner';

export interface User {
  username: string;
  password?: string;
  role: UserRole;
  name: string;
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

