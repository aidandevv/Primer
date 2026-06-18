const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export class AnthropicError extends Error {}

export function parseJsonResponse(text) {
  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

export function validateResearchReport(parsed) {
  if (typeof parsed !== "object" || parsed === null) return false;
  if (typeof parsed.summary !== "string") return false;
  if (!Array.isArray(parsed.connection_points)) return false;
  for (const cp of parsed.connection_points) {
    if (typeof cp.claim !== "string") return false;
    if (!["vault", "scraped", "search", "inferred"].includes(cp.basis)) return false;
  }
  if (!Array.isArray(parsed.talking_points)) return false;
  if (typeof parsed.grounding_notes !== "string") return false;
  return true;
}

export function validateDraftVariants(parsed) {
  if (typeof parsed !== "object" || parsed === null) return false;
  if (!Array.isArray(parsed.draft_variants)) return false;
  for (const v of parsed.draft_variants) {
    if (typeof v.label !== "string") return false;
    if (typeof v.body !== "string") return false;
  }
  return true;
}

async function callAnthropic({ apiKey, system, user, maxTokens }) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) {
    if (res.status === 401) throw new AnthropicError("Invalid Anthropic API key.");
    throw new AnthropicError(`Anthropic API error: ${res.status}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

const RETRY_REMINDER =
  "\n\nIMPORTANT: your previous response was not valid JSON matching the required shape. Respond with ONLY the JSON object, nothing else.";

export async function requestResearchReport({ apiKey, system, user }) {
  let text = await callAnthropic({ apiKey, system, user, maxTokens: 1200 });
  let parsed = parseJsonResponse(text);
  if (!parsed || !validateResearchReport(parsed)) {
    text = await callAnthropic({ apiKey, system: system + RETRY_REMINDER, user, maxTokens: 1200 });
    parsed = parseJsonResponse(text);
    if (!parsed || !validateResearchReport(parsed)) {
      throw new AnthropicError("Could not parse a valid research report from Claude's response.");
    }
  }
  return parsed;
}

export async function requestDraftVariants({ apiKey, system, user }) {
  let text = await callAnthropic({ apiKey, system, user, maxTokens: 800 });
  let parsed = parseJsonResponse(text);
  if (!parsed || !validateDraftVariants(parsed)) {
    text = await callAnthropic({ apiKey, system: system + RETRY_REMINDER, user, maxTokens: 800 });
    parsed = parseJsonResponse(text);
    if (!parsed || !validateDraftVariants(parsed)) {
      throw new AnthropicError("Could not parse valid draft variants from Claude's response.");
    }
  }
  return parsed.draft_variants;
}
