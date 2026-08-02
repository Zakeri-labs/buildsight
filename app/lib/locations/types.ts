export type LocationSource = "manual" | "autocomplete" | "map" | "current-location"

export type ProjectLocationValue = {
  address: string
  latitude: number | null
  longitude: number | null
  verified: boolean
  source: LocationSource
}

export type LocationSuggestion = {
  id: string
  label: string
  latitude: number
  longitude: number
  kind: string
  country?: string
  state?: string
  city?: string
  district?: string
  street?: string
  postcode?: string
}

export const EMPTY_PROJECT_LOCATION: ProjectLocationValue = {
  address: "",
  latitude: null,
  longitude: null,
  verified: false,
  source: "manual",
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(
  value: T,
): value is T & { latitude: number; longitude: number } {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
}

export function coordinateLabel(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
}
