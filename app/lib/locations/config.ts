export const LOCATION_SEARCH_MIN_CHARACTERS = 3
export const LOCATION_SEARCH_DEBOUNCE_MS = 550
export const LOCATION_SEARCH_RESULT_LIMIT = 8
export const LOCATION_QUERY_CACHE_TTL_MS = 10 * 60 * 1000

function finiteNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

export const DEFAULT_MAP_CENTER = {
  latitude: finiteNumber(process.env.NEXT_PUBLIC_MAP_DEFAULT_LATITUDE, 23.588, -90, 90),
  longitude: finiteNumber(process.env.NEXT_PUBLIC_MAP_DEFAULT_LONGITUDE, 58.3829, -180, 180),
  zoom: finiteNumber(process.env.NEXT_PUBLIC_MAP_DEFAULT_ZOOM, 11, 1, 19),
}

export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim() || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

export const MAP_TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION?.trim() || "&copy; OpenStreetMap contributors"
