/**
 * Small in-memory limiter for the anonymous events endpoint: at most `limit`
 * events per key per window. Memory is per server instance, so it slows down
 * floods from one address rather than giving an exact global limit.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>()
  return function allow(key: string, now = Date.now()): boolean {
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)
    if (recent.length >= limit) {
      hits.set(key, recent)
      return false
    }
    recent.push(now)
    hits.delete(key)
    hits.set(key, recent)
    // Forget the oldest addresses first when the map grows.
    while (hits.size > maxKeys) hits.delete(hits.keys().next().value as string)
    return true
  }
}
