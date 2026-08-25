import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  LOCATION_QUERY_CACHE_TTL_MS,
  LOCATION_SEARCH_MIN_CHARACTERS,
  LOCATION_SEARCH_RESULT_LIMIT,
} from "@/lib/locations/config"
import type { LocationSuggestion } from "@/lib/locations/types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type CacheEntry = { expiresAt: number; data: LocationSuggestion[] }

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] }
  properties?: Record<string, string | number | undefined>
}

function isGoogleMapsUrl(input: string): boolean {
  if (!input) return false
  const trimmed = input.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  return (
    /maps\.app\.goo\.gl/i.test(trimmed) ||
    /goo\.gl\/maps/i.test(trimmed) ||
    /maps\.google\./i.test(trimmed) ||
    /google\.[a-z.]+\/maps/i.test(trimmed) ||
    /g\.co\/maps/i.test(trimmed)
  )
}

function extractCoordinatesFromUrl(url: string): { latitude: number; longitude: number } | null {
  if (!url) return null

  // 1. Match @lat,lng
  const atMatch = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url)
  if (atMatch) {
    const lat = Number(atMatch[1])
    const lon = Number(atMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon }
    }
  }

  // 2. Match ?q=lat,lng or ?ll=lat,lng or ?query=lat,lng
  const paramMatch = /[?&](?:q|ll|query)=(-?\d+\.\d+),(-?\d+\.\d+)/i.exec(url)
  if (paramMatch) {
    const lat = Number(paramMatch[1])
    const lon = Number(paramMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon }
    }
  }

  // 3. Match /place/lat,lng
  const placeMatch = /\/place\/(-?\d+\.\d+),(-?\d+\.\d+)/i.exec(url)
  if (placeMatch) {
    const lat = Number(placeMatch[1])
    const lon = Number(placeMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon }
    }
  }

  // 4. Match plain decimal coords in URL path/query
  const plainCoordMatch = /(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/.exec(url)
  if (plainCoordMatch) {
    const lat = Number(plainCoordMatch[1])
    const lon = Number(plainCoordMatch[2])
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { latitude: lat, longitude: lon }
    }
  }

  return null
}

async function resolveGoogleMapsUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(6_000),
    })
    return response.url || url
  } catch {
    return url
  }
}

const cache = new Map<string, CacheEntry>()
let requestQueue: Promise<unknown> = Promise.resolve()
let nextRequestAt = 0

function providerBaseUrl() {
  return (process.env.LOCATION_GEOCODING_BASE_URL ?? "https://photon.komoot.io").replace(/\/$/, "")
}

function clean(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function makeLabel(properties: PhotonFeature["properties"]) {
  const p = properties ?? {}
  const name = clean(p.name)
  const houseNumber = clean(p.housenumber)
  const street = clean(p.street)
  const district = clean(p.district) || clean(p.county)
  const city = clean(p.city) || clean(p.town) || clean(p.village) || clean(p.locality)
  const state = clean(p.state)
  const postcode = clean(p.postcode)
  const country = clean(p.country)

  const streetLine = [houseNumber, street].filter(Boolean).join(" ")
  const parts = [name, streetLine, district, city, state, postcode, country].filter(Boolean)
  return Array.from(new Set(parts)).join(", ") || "Selected location"
}

function normalize(features: PhotonFeature[] | undefined): LocationSuggestion[] {
  const results: LocationSuggestion[] = []
  for (const [index, feature] of (features ?? []).entries()) {
    const coordinates = feature.geometry?.coordinates
    if (!coordinates) continue
    const [longitude, latitude] = coordinates
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
    const p = feature.properties ?? {}
    const city = clean(p.city) || clean(p.town) || clean(p.village) || clean(p.locality)
    const district = clean(p.district) || clean(p.county)
    const area =
      clean(p.neighbourhood) ||
      clean(p.neighborhood) ||
      clean(p.suburb) ||
      clean(p.city_district) ||
      district ||
      clean(p.locality) ||
      city
    results.push({
      id: `${clean(p.osm_type) || "location"}-${clean(p.osm_id) || index}-${latitude}-${longitude}`,
      label: makeLabel(p),
      latitude: Number(latitude),
      longitude: Number(longitude),
      kind: clean(p.type) || clean(p.osm_value) || "location",
      country: clean(p.country) || undefined,
      state: clean(p.state) || undefined,
      city: city || undefined,
      district: district || undefined,
      area: area || undefined,
      street: clean(p.street) || undefined,
      postcode: clean(p.postcode) || undefined,
    })
  }
  return results
}

async function rateLimitedFetch(url: string, locale: string) {
  const task = requestQueue.then(async () => {
    const wait = Math.max(0, nextRequestAt - Date.now())
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    nextRequestAt = Date.now() + 500
    return fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": locale,
        "User-Agent": process.env.LOCATION_GEOCODING_USER_AGENT ?? "BuildSight/1.0",
      },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
  })
  requestQueue = task.then(() => undefined, () => undefined)
  return task
}

function getCached(key: string) {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt < Date.now()) {
    if (entry) cache.delete(key)
    return null
  }
  return entry.data
}

function setCached(key: string, data: LocationSuggestion[]) {
  if (cache.size > 250) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { expiresAt: Date.now() + LOCATION_QUERY_CACHE_TTL_MS, data })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = request.nextUrl.searchParams
  const query = (params.get("q") ?? "").trim()
  const latitudeParam = params.get("lat")
  const longitudeParam = params.get("lon")
  const hasLatitude = latitudeParam != null
  const hasLongitude = longitudeParam != null
  const latitude = hasLatitude && latitudeParam?.trim() ? Number(latitudeParam) : Number.NaN
  const longitude = hasLongitude && longitudeParam?.trim() ? Number(longitudeParam) : Number.NaN
  const locale = params.get("lang") === "ar" ? "ar" : "en"

  if (hasLatitude !== hasLongitude) {
    return NextResponse.json({ error: "Latitude and longitude must be provided together." }, { status: 400 })
  }

  const isReverse = hasLatitude && hasLongitude
  if (isReverse && (!Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 })
  }

  if (!isReverse && isGoogleMapsUrl(query)) {
    let coords = extractCoordinatesFromUrl(query)

    if (!coords) {
      const expandedUrl = await resolveGoogleMapsUrl(query)
      coords = extractCoordinatesFromUrl(expandedUrl)
    }

    if (!coords) {
      return NextResponse.json(
        { error: "Unable to detect location from this Google Maps link. Please enter the address manually." },
        { status: 400 },
      )
    }

    const reverseKey = `reverse:${locale}:${coords.latitude.toFixed(5)}:${coords.longitude.toFixed(5)}`
    const cachedReverse = getCached(reverseKey)
    if (cachedReverse) return NextResponse.json({ results: cachedReverse })

    const base = providerBaseUrl()
    const reverseUrl = `${base}/reverse?lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}&lang=${locale}`

    try {
      const response = await rateLimitedFetch(reverseUrl, locale)
      if (!response.ok) {
        return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 503 })
      }
      const body = (await response.json()) as PhotonResponse
      const results = normalize(body.features)
      if (results.length === 0) {
        results.push({
          id: `maps-url-${coords.latitude}-${coords.longitude}`,
          label: `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`,
          latitude: coords.latitude,
          longitude: coords.longitude,
          kind: "location",
        })
      }
      setCached(reverseKey, results)
      return NextResponse.json({ results })
    } catch {
      return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 503 })
    }
  }

  if (!isReverse && query.length > 500) {
    return NextResponse.json({ error: "Location query is too long." }, { status: 400 })
  }

  if (!isReverse && query.length < LOCATION_SEARCH_MIN_CHARACTERS) {
    return NextResponse.json({ results: [] })
  }

  if (isReverse && (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 })
  }

  const key = isReverse
    ? `reverse:${locale}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`
    : `search:${locale}:${query.toLocaleLowerCase()}`
  const cached = getCached(key)
  if (cached) return NextResponse.json({ results: cached })

  const base = providerBaseUrl()
  const url = isReverse
    ? `${base}/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&lang=${locale}`
    : `${base}/api/?q=${encodeURIComponent(query)}&limit=${LOCATION_SEARCH_RESULT_LIMIT}&lang=${locale}`

  try {
    const response = await rateLimitedFetch(url, locale)
    if (!response.ok) {
      return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 503 })
    }
    const body = (await response.json()) as PhotonResponse
    const results = normalize(body.features)
    setCached(key, results)
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable." }, { status: 503 })
  }
}
