// NOTE (flagged per Primer_Implementation_Spec.md Section 11 item 1): this
// request shape — POST with `api_key` in the JSON body — is written from
// general knowledge of Tavily's API and has not been confirmed against
// Tavily's current docs. Confirm before relying on this in production.
const TAVILY_API_URL = "https://api.tavily.com/search";

export class TavilyError extends Error {}

export function buildTavilyQuery({ company, name }) {
  if (company) return `${company} news`;
  if (name) return name;
  throw new TavilyError("Need at least a company or a name to build a Tavily query.");
}

export function formatTavilyResults(results, limit = 4) {
  return results.slice(0, limit).map((r) => ({
    title: r.title,
    snippet: (r.content ?? "").slice(0, 280),
  }));
}

export async function searchTavily({ apiKey, query }) {
  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 4 }),
  });
  if (!res.ok) {
    throw new TavilyError(`Tavily API error: ${res.status}`);
  }
  const data = await res.json();
  return formatTavilyResults(data.results ?? []);
}
