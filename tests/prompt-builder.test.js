import { test } from "node:test";
import assert from "node:assert/strict";
import { buildResearchPrompt, buildDraftPrompt, USER_BACKGROUND } from "../lib/prompt-builder.js";

const profileScrape = {
  context: "profile",
  url: "https://www.linkedin.com/in/janedoe/",
  name: "Jane Doe",
  headline: "VP Eng at Acme",
  company: "Acme",
  role: "VP Eng",
  location: "SF",
  about: null,
  recentActivity: null,
};

test("buildResearchPrompt embeds the fixed background block and JSON-only instruction in system", () => {
  const { system } = buildResearchPrompt({ scrape: profileScrape, vaultContext: [], searchContext: null });
  assert.ok(system.includes(USER_BACKGROUND.trim()));
  assert.match(system, /ONLY a JSON object/);
});

test("buildResearchPrompt's user message includes scraped fields and notes a missing about section", () => {
  const { user } = buildResearchPrompt({ scrape: profileScrape, vaultContext: [], searchContext: null });
  assert.match(user, /Name: Jane Doe/);
  assert.match(user, /Company: Acme/);
  assert.match(user, /About: \(none\)/);
});

test("buildResearchPrompt includes vault context when present and says so when absent", () => {
  const withVault = buildResearchPrompt({
    scrape: profileScrape,
    vaultContext: [{ path: "LinkedIn Outreach/Jane Doe.md", excerpt: "Met at a CodeLab event." }],
    searchContext: null,
  });
  assert.match(withVault.user, /Met at a CodeLab event\./);

  const withoutVault = buildResearchPrompt({ scrape: profileScrape, vaultContext: [], searchContext: null });
  assert.match(withoutVault.user, /No prior vault notes found/);
});

test("buildResearchPrompt folds in search context only when provided", () => {
  const { user } = buildResearchPrompt({
    scrape: profileScrape,
    vaultContext: [],
    searchContext: [{ title: "Acme raises Series B", snippet: "Acme announced..." }],
  });
  assert.match(user, /Acme raises Series B/);
});

test("buildDraftPrompt's system asks for draft_variants only, and user includes the prior report", () => {
  const { system, user } = buildDraftPrompt({
    scrape: profileScrape,
    priorReport: { summary: "Jane leads eng at Acme.", talking_points: ["Ask about the Acme migration"] },
  });
  assert.match(system, /draft_variants/);
  assert.match(user, /Jane leads eng at Acme\./);
  assert.match(user, /Ask about the Acme migration/);
});
