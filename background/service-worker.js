import { searchVault, createOrOverwriteNote, appendUnderHeading, patchFrontmatterField, ObsidianError } from "../lib/obsidian-client.js";
import { requestResearchReport, requestDraftVariants, AnthropicError } from "../lib/anthropic-client.js";
import { searchTavily, buildTavilyQuery, TavilyError } from "../lib/tavily-client.js";
import { buildResearchPrompt, buildDraftPrompt } from "../lib/prompt-builder.js";
import { buildFrontmatter, buildResearchLogEntry, buildDraftAppendix, notePathFor } from "../lib/note-template.js";
import { isCacheFresh } from "../lib/session-cache.js";

const sessionCache = new Map();

async function getSettings() {
  return chrome.storage.local.get([
    "anthropicApiKey",
    "tavilyApiKey",
    "obsidianApiKey",
    "obsidianPort",
    "vaultFolderScope",
  ]);
}

function send(tabId, message) {
  chrome.tabs.sendMessage(tabId, message);
}

function contactName(scrape) {
  return scrape.name ?? scrape.participantName ?? "Unknown";
}

async function handleResearchRequest({ mode, scrape }, tabId) {
  const settings = await getSettings();
  const { anthropicApiKey, tavilyApiKey, obsidianApiKey, obsidianPort, vaultFolderScope } = settings;

  if (!anthropicApiKey) {
    send(tabId, { type: "ERROR", stage: "config", message: "Set your Anthropic API key in the Primer options page.", dependency: "anthropic" });
    return;
  }
  if (!obsidianApiKey || !obsidianPort) {
    send(tabId, { type: "ERROR", stage: "config", message: "Set your Obsidian API key and port in the Primer options page.", dependency: "obsidian" });
    return;
  }

  const cacheKey = scrape.url;
  const cached = sessionCache.get(cacheKey);
  if (isCacheFresh(cached)) {
    send(tabId, { type: "RESEARCH_RESULT", report: cached.report, savedTo: cached.savedTo, cached: true });
    return;
  }

  send(tabId, { type: "STATUS", stage: "searching_vault" });
  let vaultContext = [];
  try {
    const name = contactName(scrape);
    let results = await searchVault({ port: obsidianPort, apiKey: obsidianApiKey, query: name });
    if ((!results || results.length === 0) && scrape.company) {
      results = await searchVault({ port: obsidianPort, apiKey: obsidianApiKey, query: scrape.company });
    }
    vaultContext = results ?? [];
  } catch (err) {
    if (err instanceof ObsidianError) {
      send(tabId, { type: "ERROR", stage: "searching_vault", message: err.message, dependency: "obsidian" });
      return;
    }
    throw err;
  }

  let searchContext = null;
  if (mode === "deep") {
    send(tabId, { type: "STATUS", stage: "searching_web" });
    try {
      const query = buildTavilyQuery({ company: scrape.company, name: contactName(scrape) });
      searchContext = await searchTavily({ apiKey: tavilyApiKey, query });
    } catch {
      searchContext = null; // proceed with quick-mode-equivalent grounding per Section 6.3
    }
  }

  send(tabId, { type: "STATUS", stage: "calling_claude" });
  const { system, user } = buildResearchPrompt({ scrape, vaultContext, searchContext });
  let report;
  try {
    report = await requestResearchReport({ apiKey: anthropicApiKey, system, user });
  } catch (err) {
    const message = err instanceof AnthropicError ? err.message : "Unexpected error calling Anthropic.";
    send(tabId, { type: "ERROR", stage: "calling_claude", message, dependency: "anthropic" });
    return;
  }
  if (mode === "deep" && searchContext === null) {
    report.grounding_notes = `${report.grounding_notes} Web search step failed; proceeded with quick-mode-equivalent grounding.`.trim();
  }

  send(tabId, { type: "STATUS", stage: "writing_vault" });
  const name = contactName(scrape);
  const path = notePathFor(vaultFolderScope, name);
  const today = new Date().toISOString().slice(0, 10);
  const entry = buildResearchLogEntry({ date: today, report });
  const existing = vaultContext.find((n) => n.path === path);

  try {
    if (!existing) {
      const frontmatter = buildFrontmatter({
        name,
        headline: scrape.headline ?? null,
        company: scrape.company ?? null,
        role: scrape.role ?? null,
        linkedinUrl: scrape.url,
        firstContactDate: today,
        lastResearchDate: today,
      });
      await createOrOverwriteNote({ port: obsidianPort, apiKey: obsidianApiKey, path, content: `${frontmatter}\n## Research Log\n\n${entry}\n` });
    } else {
      await appendUnderHeading({ port: obsidianPort, apiKey: obsidianApiKey, path, heading: "Research Log", content: `\n${entry}\n` });
      await patchFrontmatterField({ port: obsidianPort, apiKey: obsidianApiKey, path, field: "last_research_date", value: today });
    }
  } catch (err) {
    if (err instanceof ObsidianError) {
      send(tabId, { type: "ERROR", stage: "writing_vault", message: err.message, dependency: "obsidian" });
      return;
    }
    throw err;
  }

  sessionCache.set(cacheKey, { report, savedTo: path, timestamp: Date.now() });
  send(tabId, { type: "RESEARCH_RESULT", report, savedTo: path });
}

async function handleDraftRequest({ scrape, priorReport }, tabId) {
  const settings = await getSettings();
  const { anthropicApiKey, obsidianApiKey, obsidianPort, vaultFolderScope } = settings;

  if (!anthropicApiKey) {
    send(tabId, { type: "ERROR", stage: "config", message: "Set your Anthropic API key in the Primer options page.", dependency: "anthropic" });
    return;
  }

  send(tabId, { type: "STATUS", stage: "calling_claude" });
  const { system, user } = buildDraftPrompt({ scrape, priorReport });
  let variants;
  try {
    variants = await requestDraftVariants({ apiKey: anthropicApiKey, system, user });
  } catch (err) {
    const message = err instanceof AnthropicError ? err.message : "Unexpected error calling Anthropic.";
    send(tabId, { type: "ERROR", stage: "calling_claude", message, dependency: "anthropic" });
    return;
  }

  send(tabId, { type: "STATUS", stage: "writing_vault" });
  const path = notePathFor(vaultFolderScope, contactName(scrape));
  const today = new Date().toISOString().slice(0, 10);
  try {
    const appendix = buildDraftAppendix({ date: today, variants });
    await appendUnderHeading({ port: obsidianPort, apiKey: obsidianApiKey, path, heading: "Research Log", content: `\n${appendix}\n` });
  } catch {
    // Drafts still render even if the vault append fails — the panel's value
    // is the copyable text, and a missed log entry isn't worth blocking on.
  }

  send(tabId, { type: "DRAFT_RESULT", variants });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;
  if (message.type === "RESEARCH_REQUEST") {
    handleResearchRequest(message, tabId);
  } else if (message.type === "DRAFT_REQUEST") {
    handleDraftRequest(message, tabId);
  }
});
