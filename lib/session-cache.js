// 10 minutes — sensible default per Primer_Implementation_Spec.md Section 6.5.
export const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;

export function isCacheFresh(entry, now = Date.now()) {
  if (!entry) return false;
  return now - entry.timestamp < SESSION_CACHE_TTL_MS;
}
