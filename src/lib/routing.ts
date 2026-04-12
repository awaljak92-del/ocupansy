// OSRM (Open Source Routing Machine) - routing berbasis jalan 
// Gratis, menggunakan data OpenStreetMap

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lng] untuk Leaflet
  distance: number;   // meter (jarak jalan, bukan garis lurus)
  duration: number;   // detik
}

const OSRM_BASE = 'https://router.project-osrm.org';

// Cache agar tidak query ulang rute yang sama
const routeCache = new Map<string, RouteResult>();

/**
 * Ambil rute jalan dari titik A ke titik B via OSRM
 */
export async function getRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number
): Promise<RouteResult | null> {
  const key = `${fromLat.toFixed(6)},${fromLng.toFixed(6)}-${toLat.toFixed(6)},${toLng.toFixed(6)}`;
  
  if (routeCache.has(key)) return routeCache.get(key)!;
  
  try {
    // OSRM uses lng,lat order (opposite of Leaflet)
    const url = `${OSRM_BASE}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.code !== 'Ok' || !data.routes?.[0]) return null;
    
    const route = data.routes[0];
    // OSRM geometry: [[lng, lat], ...] → convert to [[lat, lng], ...] untuk Leaflet
    const coords: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
    );
    
    const result: RouteResult = {
      coordinates: coords,
      distance: route.distance,
      duration: route.duration,
    };
    
    routeCache.set(key, result);
    return result;
  } catch (e) {
    console.error('[OSRM] Route error:', e);
    return null;
  }
}

/**
 * Ambil rute jalan dari satu titik ke banyak tujuan.
 * Dibatasi batch per 5 request untuk menghormati rate limit OSRM demo server.
 */
export async function getRoutesToMany(
  fromLat: number, fromLng: number,
  destinations: { lat: number; lng: number; key: string }[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, RouteResult>> {
  const results = new Map<string, RouteResult>();
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < destinations.length; i += BATCH_SIZE) {
    const batch = destinations.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (dest) => {
      const route = await getRoute(fromLat, fromLng, dest.lat, dest.lng);
      if (route) results.set(dest.key, route);
    });
    await Promise.all(promises);
    onProgress?.(Math.min(i + BATCH_SIZE, destinations.length), destinations.length);
    
    // Jeda 300ms antar batch agar tidak membebani server OSRM
    if (i + BATCH_SIZE < destinations.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  return results;
}

/**
 * Format jarak: < 1km → "XXX m", ≥ 1km → "X.XX km"
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return (meters / 1000).toFixed(2) + ' km';
  return Math.round(meters) + ' m';
}

/**
 * Format durasi: < 60s → "XXs", < 60min → "Xm", ≥ 60min → "Xj Xm"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return Math.round(seconds) + 's';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return mins + ' menit';
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}j ${remainMins}m`;
}
