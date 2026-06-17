// Fixed background block per Primer_Implementation_Spec.md Section 7.3.
// v0.1 hardcodes this constant; a fast-follow may load it live from a vault
// note instead (PRD F5.4) — kept isolated here for that reason.
export const USER_BACKGROUND = `
You are helping Aidan DeVaney, a CS student at UC Davis and President of
CodeLab, pursuing APM/PM roles particularly in defense and government
technology. His background includes Reddit, Deloitte, Solidigm, and Chevron.
`;

export const RESEARCH_OUTPUT_INSTRUCTION = `
Respond with ONLY a JSON object matching this exact shape, no markdown
fences, no preamble: { "summary": string, "connection_points":
[{"claim": string, "basis": "vault"|"scraped"|"search"|"inferred"}],
"talking_points": [string], "grounding_notes": string }
`;

export const DRAFT_OUTPUT_INSTRUCTION = `
Respond with ONLY a JSON object matching this exact shape, no markdown
fences, no preamble: { "draft_variants": [{"label": string, "body": string}] }
`;

function formatScrape(scrape) {
  if (scrape.context === "profile") {
    return [
      `Name: ${scrape.name ?? "(unreadable)"}`,
      `Headline: ${scrape.headline ?? "(none)"}`,
      `Company: ${scrape.company ?? "(none)"}`,
      `Role: ${scrape.role ?? "(none)"}`,
      `Location: ${scrape.location ?? "(none)"}`,
      `About: ${scrape.about ?? "(none)"}`,
      `Recent activity: ${scrape.recentActivity ?? "(none)"}`,
    ].join("\n");
  }
  const messages = scrape.messages.map((m) => `[${m.sender}] ${m.text}`).join("\n");
  return `Participant: ${scrape.participantName ?? "(unreadable)"}\nMessages:\n${messages}`;
}

function formatVaultContext(vaultContext) {
  if (!vaultContext || vaultContext.length === 0) {
    return "No prior vault notes found for this contact.";
  }
  return vaultContext.map((note) => `Note: ${note.path}\n${note.excerpt}`).join("\n\n");
}

function formatSearchContext(searchContext) {
  if (!searchContext || searchContext.length === 0) return "";
  return "\n\nWeb search results:\n" + searchContext.map((r) => `- ${r.title}: ${r.snippet}`).join("\n");
}

export function buildResearchPrompt({ scrape, vaultContext, searchContext }) {
  const user = [
    formatScrape(scrape),
    "",
    "Vault context:",
    formatVaultContext(vaultContext),
    formatSearchContext(searchContext),
  ].join("\n");
  return {
    system: `${USER_BACKGROUND.trim()}\n\n${RESEARCH_OUTPUT_INSTRUCTION.trim()}`,
    user,
  };
}

export function buildDraftPrompt({ scrape, priorReport }) {
  const user = [
    formatScrape(scrape),
    "",
    "Prior research report:",
    `Summary: ${priorReport.summary}`,
    `Talking points: ${priorReport.talking_points.join("; ")}`,
  ].join("\n");
  return {
    system: `${USER_BACKGROUND.trim()}\n\n${DRAFT_OUTPUT_INSTRUCTION.trim()}`,
    user,
  };
}
