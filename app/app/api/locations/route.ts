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

type PhotonResponse = { features?: PhotonFeature[] }

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
    results.push({
      id: `${clean(p.osm_type) || "location"}-${clean(p.osm_id) || index}-${latitude}-${longitude}`,
      label: makeLabel(p),
      latitude: Number(latitude),
      longitude: Number(longitude),
      kind: clean(p.type) || clean(p.osm_value) || "location",
      country: clean(p.country) || undefined,
      state: clean(p.state) || undefined,
      city: clean(p.city) || clean(p.town) || clean(p.village) || undefined,
      district: clean(p.district) || clean(p.county) || undefined,
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

  if (!isReverse && query.length > 200) {
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
