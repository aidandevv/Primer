# Primer

### LinkedIn Outreach Copilot — Implementation Specification

This document is written for direct handoff to an agentic coding tool (Claude Code or equivalent). It assumes the companion PRD as background context but does not require the agent to read it: every decision needed to start writing code is restated here in concrete, unambiguous form — exact file paths, exact API contracts, exact manifest configuration, and an explicit build order with stop-and-verify checkpoints.

| Field | Value |
|---|---|
| Companion document | `Primer_PRD.docx` (v0.1) |
| Target runtime | Chrome, Manifest V3 |
| Languages | JavaScript (ES modules), HTML, CSS — no framework required |
| External dependencies | Anthropic API, Tavily API, Obsidian Local REST API plugin (already installed by user) |
| Repo name (suggested) | `primer` |
| Date | June 17, 2026 |

---

## Table of Contents

1. [Instructions for the Coding Agent](#1-instructions-for-the-coding-agent)
2. [Architecture Constraints (Binding)](#2-architecture-constraints-binding)
3. [manifest.json (Exact Specification)](#3-manifestjson-exact-specification)
4. [Storage Schema](#4-storage-schema)
5. [Content Script Specification](#5-content-script-specification)
6. [Background Service Worker Specification](#6-background-service-worker-specification)
7. [External API Contracts](#7-external-api-contracts)
8. [Build Sequence & Verification Checkpoints](#8-build-sequence--verification-checkpoints)
9. [LinkedIn Safety Constraints (Hard Requirements)](#9-linkedin-safety-constraints-hard-requirements)
10. [Testing Notes](#10-testing-notes)
11. [Items to Flag Back to the User, Not Decide Unilaterally](#11-items-to-flag-back-to-the-user-not-decide-unilaterally)

---

## 1. Instructions for the Coding Agent

Read this section first, in full, before writing any code.

### 1.1 Operating Principles

- Build in the milestone order given in Section 8. Do not skip ahead to later milestones even if they look easy — each milestone has an explicit verification step, and later milestones assume earlier ones are verified working, not just written.
- Do not introduce a backend server, database, or persistent daemon at any point. If a task seems to require one, stop and flag it rather than building it — the no-server constraint in Section 2 is a hard architectural requirement, not a preference.
- Do not implement anything that auto-sends a LinkedIn message, auto-submits a connection request, or auto-navigates between LinkedIn pages. All LinkedIn-side actions remain manual and human-clicked. See Section 9.
- Never hardcode an API key anywhere in source. All three keys (Anthropic, Tavily, Obsidian) are entered by the user via the options page and read from `chrome.storage.local` at call time.
- When a LinkedIn DOM selector is needed, write it defensively with at least one fallback selector and a named constant, not an inline string — see Section 5.4 for the required pattern.
- If LinkedIn's actual DOM structure encountered during implementation differs from the illustrative selectors in this document (likely, since LinkedIn's markup changes and obfuscates class names), update the selector constants and note the discrepancy in a code comment. The illustrative selectors here are structural guidance, not verified-current values.

### 1.2 What "Done" Means for Each Milestone

Each milestone in Section 8 has an explicit verification step. A milestone is not complete until that verification step passes, demonstrated either by a console log of the expected shape, a manual test the agent describes performing, or both. Do not mark a milestone complete based on the code compiling or running without errors alone.

---

## 2. Architecture Constraints (Binding)

These constraints come directly from the PRD and are restated here because they shape nearly every file in this build.

| Constraint | Implication for code |
|---|---|
| No application server | All orchestration happens in the background service worker via `fetch()`. No Express/Flask/Node server process is started. |
| Three external dependencies only | Anthropic API, Tavily API, Obsidian Local REST API. No other network calls except these three hosts. |
| BYOK, local storage only | Keys live in `chrome.storage.local`. Never logged, never sent anywhere except their own API's Authorization header. |
| Read-only on LinkedIn | Content script only reads the DOM. No simulated clicks, no form submission, no programmatic navigation. |
| Vault is system of record | No second persistent store. An in-memory session cache (cleared on browser restart) is allowed for avoiding duplicate research within one session — see Section 6.5. |

### 2.1 Component Map

```
primer/
├── manifest.json
├── background/
│   └── service-worker.js        # orchestrates fetch() calls, message routing
├── content/
│   ├── content-script.js        # page detection + DOM scraping
│   └── panel.css                # injected results panel styling
├── lib/
│   ├── linkedin-selectors.js    # DOM selectors, isolated for easy patching
│   ├── anthropic-client.js      # Anthropic API wrapper
│   ├── tavily-client.js         # Tavily API wrapper
│   ├── obsidian-client.js       # Obsidian Local REST API wrapper
│   ├── prompt-builder.js        # assembles the system + user prompt
│   └── note-template.js         # frontmatter + markdown note construction
├── options/
│   ├── options.html             # API key entry, vault folder scope, default mode
│   └── options.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## 3. manifest.json (Exact Specification)

Use the configuration below as the starting point. Permissions are scoped as narrowly as the feature set allows — do not add `host_permissions` beyond what's listed without a corresponding new feature that needs it.

```json
{
  "manifest_version": 3,
  "name": "Primer",
  "version": "0.1.0",
  "description": "LinkedIn outreach research and drafting copilot, backed by your own Obsidian vault.",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_title": "Research this person"
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://www.linkedin.com/*"],
      "js": ["content/content-script.js"],
      "css": ["content/panel.css"],
      "run_at": "document_idle"
    }
  ],
  "options_page": "options/options.html",
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://api.anthropic.com/*",
    "https://api.tavily.com/*",
    "https://127.0.0.1:27124/*"
  ]
}
```

**Note on the Obsidian host permission:** the Local REST API plugin serves HTTPS on `127.0.0.1:27124` with a self-signed certificate. The user must visit `https://127.0.0.1:27124/` once in a regular Chrome tab and accept the certificate warning before the extension's `fetch()` calls to that host will succeed — self-signed certs are not auto-trusted by `fetch()` from a service worker. Document this as a one-time setup step in the README and surface a clear error in the options page if the certificate hasn't been trusted yet (the fetch will throw a `TypeError` with a network error, not a clean HTTP error code).

---

## 4. Storage Schema

Single `chrome.storage.local` namespace. No sync storage — keys should never leave the machine, and `chrome.storage.sync` would replicate them to the user's Google account.

```js
// chrome.storage.local shape
{
  "anthropicApiKey": "sk-ant-...",
  "tavilyApiKey": "tvly-...",
  "obsidianApiKey": "<64-char hex from Obsidian plugin settings>",
  "obsidianPort": 27124,
  "vaultFolderScope": "LinkedIn Outreach",  // new top-level vault folder, confirmed by user (not nested under existing CRM area)
  "defaultMode": "quick",                    // "quick" | "deep"
  "sessionCache": {}                         // see Section 6.5 — ephemeral, cleared on browser restart
}
```

**Decision (settled, do not re-litigate):** `vaultFolderScope` defaults to a new top-level vault folder named "LinkedIn Outreach," separate from any existing PARA areas. This was an open question in the PRD and has been resolved by the user — the agent should not nest this under an existing CRM/outreach folder or ask about it again.

---

## 5. Content Script Specification

### 5.1 Responsibilities

- Detect current page context on load and on LinkedIn's internal SPA navigation (LinkedIn is a single-page app — standard navigation events won't fire on internal route changes; use a `MutationObserver` on a stable container element, or poll `location.href` on an interval, to detect context changes).
- Inject the floating action button when context is profile or DM-thread; remove it otherwise.
- On click, scrape the relevant DOM into a structured object and send it to the background worker via `chrome.runtime.sendMessage`.
- Render the results panel (loading → report → confirmation → error states) based on messages received back from the background worker.

### 5.2 Page Context Detection

Three contexts, detected by URL pattern first and confirmed by DOM presence second (URL alone is not reliable on an SPA where the DOM may lag the URL change by a render cycle):

| Context | URL pattern | Confirming DOM check |
|---|---|---|
| Profile | `/in/{slug}/` | A top-card heading element containing the profile name is present |
| DM thread | `/messaging/thread/{id}/` | A message-list container with at least one message bubble is present |
| Neither | anything else | n/a — hide the action button |

### 5.3 Scrape Output Shape

This is the exact object the content script must produce and send to the background worker. The background worker and prompt builder are written against this shape — do not change field names without updating both.

```js
// Profile context
{
  "context": "profile",
  "url": "https://www.linkedin.com/in/...",
  "name": "string",
  "headline": "string | null",
  "company": "string | null",
  "role": "string | null",
  "location": "string | null",
  "about": "string | null",
  "recentActivity": "string | null"   // text of most recent visible post, if any
}

// DM thread context
{
  "context": "dm",
  "url": "https://www.linkedin.com/messaging/thread/...",
  "participantName": "string",
  "messages": [
    { "sender": "them" | "me", "text": "string", "timestamp": "string | null" }
  ]
}
```

### 5.4 Selector Strategy (Required Pattern)

All selectors live in `lib/linkedin-selectors.js` as named constants with arrays of fallback selectors, never as inline strings in the scraping logic. This is the required shape:

```js
// lib/linkedin-selectors.js
export const SELECTORS = {
  profileName: [
    "h1.text-heading-xlarge",         // illustrative — verify against live DOM
    "[data-generated-suggestion-target] h1",
  ],
  profileHeadline: [
    ".text-body-medium.break-words",
  ],
  // ...one entry per field, each an array of fallback selectors in priority order
};

export function queryWithFallback(root, selectorList) {
  for (const sel of selectorList) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;   // caller must treat null as "field unreadable", not throw
}
```

The illustrative selector strings above are structural placeholders, not verified-current LinkedIn class names. The agent's first implementation task in Milestone 1 (Section 8) is to open real LinkedIn pages, inspect the actual DOM, and populate this file with selectors confirmed against live markup.

### 5.5 Failure Handling (F1.3 from the PRD)

When `queryWithFallback` returns `null` for a field, the scrape object should include that field as `null` rather than omitting it or throwing. The results panel must then render a visible "couldn't read this field" indicator for any null field rather than silently passing it through to the prompt as if it were absent — this distinction matters because the prompt builder should know the difference between "this person has no headline" and "we failed to read the headline."

---

## 6. Background Service Worker Specification

### 6.1 Message Protocol (Content Script ↔ Background Worker)

Manifest V3 service workers terminate when idle and must not rely on module-scope variables to persist state across calls — use `chrome.storage.local` for anything that needs to survive a worker restart. Communication uses `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` with the message shapes below.

```js
// Content script -> background worker
{
  "type": "RESEARCH_REQUEST",
  "mode": "quick" | "deep",
  "scrape": { /* shape from Section 5.3 */ }
}

{
  "type": "DRAFT_REQUEST",
  "scrape": { /* shape from Section 5.3 */ },
  "priorReport": { /* the ResearchReport from a prior RESEARCH_REQUEST in this session */ }
}

// Background worker -> content script (sent at each stage; content script
// re-renders the panel on each message)
{ "type": "STATUS", "stage": "loading" | "searching_vault" | "calling_claude" | "writing_vault" }
{ "type": "RESEARCH_RESULT", "report": { /* see Section 7.2 ResearchReport schema */ }, "savedTo": "LinkedIn Outreach/Jane Doe.md" }
{ "type": "DRAFT_RESULT", "variants": [ { "label": "string", "body": "string" } ] }
{ "type": "ERROR", "stage": "string", "message": "string", "dependency": "anthropic" | "tavily" | "obsidian" }
```

### 6.2 Orchestration Sequence (RESEARCH_REQUEST, mode=quick)

1. Read `anthropicApiKey`, `obsidianApiKey`, `obsidianPort`, `vaultFolderScope` from `chrome.storage.local`. If any required key is missing, immediately send an `ERROR` message (dependency-specific) and stop.
2. Send `STATUS searching_vault`. Call `obsidian-client.js`'s search function with the scraped name (and company as a secondary term if the name search returns nothing — see Section 7.1).
3. Send `STATUS calling_claude`. Call `prompt-builder.js` to assemble the full prompt from scrape + vault context + the fixed background block (Section 7.3). Call `anthropic-client.js`.
4. Parse the JSON response against the `ResearchReport` schema (Section 7.2). If parsing fails, retry once with a stricter system-prompt reminder to return JSON only; if it fails twice, send `ERROR` with `dependency: "anthropic"`.
5. Send `STATUS writing_vault`. Call `note-template.js` to build frontmatter + body, then `obsidian-client.js` to create-or-append the note (Section 7.4 for the exact create-vs-append logic).
6. Send `RESEARCH_RESULT` with the parsed report and the note path written.

### 6.3 Orchestration Sequence (RESEARCH_REQUEST, mode=deep)

Identical to quick mode, with one inserted step: after vault search and before the Anthropic call, fire a Tavily query. There's nothing else to parallelize against at that point, but structure the call as its own async/awaited step so a future deep-research enhancement can add more parallel lookups without restructuring. Fold the Tavily results into the prompt per Section 7.3. If the Tavily call fails, do not abort the whole flow — proceed with quick-mode-equivalent grounding and note in `grounding_notes` that the web search step failed.

### 6.4 Orchestration Sequence (DRAFT_REQUEST)

Takes the scrape and a `priorReport` (the already-generated `ResearchReport` from the same session, passed back from the content script's panel state) and asks Claude for message variants. No new vault search or Tavily call — drafting reuses context already gathered to avoid duplicate API calls. Writes the chosen/generated draft variants back to the same vault note as an appended section (not a separate note).

### 6.5 Session Cache

To satisfy "don't re-research the same profile twice in one session" without persistent storage: keep a `Map` in the service worker keyed by profile/thread URL, holding the last `ResearchReport` and a timestamp. Because the service worker can be evicted by Chrome at any time, this cache is explicitly best-effort — do not build any logic that assumes it survives. On a cache hit within a reasonable window (10 minutes is a sensible default), skip the vault search and Anthropic call entirely and return the cached `RESEARCH_RESULT` immediately, clearly labeled in the panel as a cached result with an option to force a fresh run.

---

## 7. External API Contracts

### 7.1 Obsidian Local REST API

Base URL: `https://127.0.0.1:{port}/` (port from settings, default `27124`). All requests except the bare root require `Authorization: Bearer {obsidianApiKey}`. The endpoints this tool needs:

| Operation | Method & path | Notes |
|---|---|---|
| Search vault | `POST /search/` with a JSON or JsonLogic body | Use simple text search on the contact's name first; if zero results, retry on company name |
| Read a note | `GET /vault/{path}` | Path is relative to vault root, e.g. `LinkedIn Outreach/Jane Doe.md` |
| Create or overwrite a note | `PUT /vault/{path}` | Use for first-time contact notes (F5.1) |
| Append to a note | `POST /vault/{path}` | Appends content to the end of the file if it exists |
| Append under a specific heading | `PATCH /vault/{path}` with headers `Operation: append`, `Target-Type: heading`, `Target: {heading name}` | Use this for adding a dated research entry under a "Research Log" heading without disturbing the rest of the note (F5.2) |

**Implementation note:** because the certificate is self-signed, `fetch()` calls from the service worker will fail with a generic network error until the user has manually trusted the certificate in their OS/browser (see Section 3). Wrap every `obsidian-client.js` call in a try/catch that distinguishes "connection refused" (plugin not running) from "certificate/TLS error" (not yet trusted) from "401" (wrong key) and surfaces the correct one of the three in the `ERROR` message's dependency-specific text, per F6 in the PRD and the error-state requirement in Section 6.2 of the PRD.

### 7.2 ResearchReport Schema (Anthropic Response)

Request the Anthropic API with a system prompt that demands JSON-only output, no markdown fences, no preamble. Parse directly against this shape:

```json
{
  "summary": "string",
  "connection_points": [
    { "claim": "string", "basis": "vault" | "scraped" | "search" | "inferred" }
  ],
  "talking_points": ["string", "..."],
  "grounding_notes": "string"
}
```

```json
// When responding to a DRAFT_REQUEST, the additional field:
{
  "draft_variants": [
    { "label": "string", "body": "string" }
  ]
}
```

Model: use `claude-sonnet-4-6` for both research and drafting calls in v0.1. Set `max_tokens` to 1200 for research (the report is short) and 800 for drafting (two short variants). Do not enable extended thinking or tool use for these calls — this is a single-shot structured-output task, not a multi-step agentic one.

### 7.3 Prompt Assembly (prompt-builder.js)

The system prompt has two parts: a fixed background block describing the user, and the JSON-output instruction. The fixed block should be stored as its own exported constant (not inline in the function) so it's trivial to edit later, and per the PRD's F5.4, should ideally be loaded from a vault note rather than hardcoded — v0.1 may hardcode it as a constant and defer the live vault-load of the template to a fast-follow, but the constant must be isolated in its own file/export for that reason.

```js
// lib/prompt-builder.js (shape, not exhaustive)
const USER_BACKGROUND = `
You are helping Aidan DeVaney, a CS student at UC Davis and President of
CodeLab, pursuing APM/PM roles particularly in defense and government
technology. His background includes Reddit, Deloitte, Solidigm, and Chevron.
`;

const OUTPUT_INSTRUCTION = `
Respond with ONLY a JSON object matching this exact shape, no markdown
fences, no preamble: { "summary": ..., "connection_points": [...],
"talking_points": [...], "grounding_notes": ... }
`;

export function buildResearchPrompt({ scrape, vaultContext, searchContext }) {
  // Assemble: USER_BACKGROUND + scrape (formatted) + vaultContext (if any)
  // + searchContext (if deep mode) + OUTPUT_INSTRUCTION
  // Return { system: string, user: string }
}
```

### 7.4 Note Create-vs-Append Logic (note-template.js)

1. Search the vault for an existing note matching this contact (by `linkedin_url` in frontmatter, preferred, falling back to name match).
2. If no note exists: build frontmatter (Section 7.5) + an initial "Research Log" heading containing today's report, and `PUT` to create it at `{vaultFolderScope}/{sanitized name}.md`.
3. If a note exists: `PATCH` with `Operation: append`, `Target-Type: heading`, `Target: Research Log` to add a new dated entry, and separately update the `last_research_date` frontmatter field (a second `PATCH` with `Target-Type: frontmatter`).
4. Sanitize the filename: strip characters invalid in the user's filesystem (`/ \ : * ? " < > |`) and collapse whitespace.

### 7.5 Frontmatter Schema

```markdown
---
name: 
headline: 
company: 
role: 
linkedin_url: 
first_contact_date: 
last_research_date: 
tags: [crm, outreach]
---

## Research Log

### {date}
{summary}

**Connection points:**
- {claim} _(source: {basis})_

**Talking points:**
- {point}
```

### 7.6 Tavily API

POST to the Tavily search endpoint with the API key in the request body (not a header — confirm against current Tavily docs at implementation time, as this varies by provider and may have changed). Query construction: prefer `"{company} news"` when a company is known; fall back to `"{person name} {company}"` when company is unknown or when the person-level query is more likely to surface something specific. Take the top 3–4 results and pass title + a trimmed snippet (not full page content) into the prompt to control token usage.

---

## 8. Build Sequence & Verification Checkpoints

Follow this order. Each milestone ends with a verification step that must be demonstrated before moving on.

### Milestone 0 — Scaffold

- Create the file structure from Section 2.1, the manifest from Section 3, and placeholder icon files.
- Load the extension unpacked in Chrome (`chrome://extensions`, Developer mode, Load unpacked) and confirm it appears with no manifest errors.
- **Verification:** the extension's action icon appears in the toolbar; `chrome://extensions` shows zero errors on the card.

### Milestone 1 — Selectors & Scraping

- Open real LinkedIn profile and DM pages in Chrome DevTools, inspect actual DOM structure, and populate `lib/linkedin-selectors.js` with confirmed selectors (Section 5.4).
- Implement page context detection (Section 5.2) and the scrape functions producing the exact shapes in Section 5.3.
- **Verification:** `console.log` the scrape object on 3 different real profiles and 1 real DM thread; confirm every expected field is populated or explicitly `null`, never `undefined` or missing.

### Milestone 2 — Obsidian Round-Trip

- Implement `lib/obsidian-client.js` against the contracts in Section 7.1.
- Confirm the user has installed the Local REST API plugin and trusted the self-signed cert (Section 3 note) before testing.
- **Verification:** from the extension's background worker (test via the service worker's DevTools console, accessible from `chrome://extensions` → "Inspect views: service worker"), successfully create a test note, then successfully append to that same note, then read it back and confirm the appended content is present.

### Milestone 3 — Research Loop (Quick-Check)

- Implement `prompt-builder.js`, `anthropic-client.js`, and the orchestration sequence in Section 6.2.
- Wire `RESEARCH_REQUEST` end-to-end: content script sends the message, background worker runs the full sequence, content script renders `STATUS` updates and the final `RESEARCH_RESULT`.
- **Verification:** on a real profile, clicking the action button produces a rendered report with non-empty summary, at least one connection point, and confirmation that a vault note was created at the expected path.

### Milestone 4 — Drafting

- Implement `DRAFT_REQUEST` handling per Section 6.4 and the `draft_variants` extension to the response schema.
- Render variants in the panel with copy-to-clipboard, not auto-paste into LinkedIn's compose field (F4.3, hard requirement).
- **Verification:** after a successful research run, clicking "Draft a message" produces at least 2 labeled variants, and the vault note has been updated with the drafts under the research log entry.

### Milestone 5 — Deep Research

- Implement `tavily-client.js` and the `mode=deep` branch in Section 6.3.
- **Verification:** toggling deep-research mode and re-running on the same profile produces a report whose `connection_points` include at least one entry with `basis: "search"`, and `grounding_notes` reflects a Tavily failure gracefully if the key is temporarily invalid (test this by deliberately using a bad key once).

### Milestone 6 — Options Page & Error States

- Build `options.html` / `options.js` for entering all three keys, vault folder scope, and default mode, persisting to `chrome.storage.local`.
- Implement the distinct error states from Section 7.1's implementation note and the PRD's Section 6.2 (panel error state) — invalid Anthropic key, Tavily quota, Obsidian unreachable, Obsidian cert untrusted, Obsidian wrong key.
- **Verification:** deliberately misconfigure each of the three keys one at a time and confirm the panel shows a distinct, correctly-worded error for each case rather than a generic failure.

### Milestone 7 — Polish

- Visual pass on the results panel per the PRD's Section 6.3 design direction (restrained, accent-driven, not a default browser-extension look).
- **Verification:** a full end-to-end run (quick-check → draft → vault save) feels smooth enough for daily use, per the PRD's under-15-second quick-check target.

---

## 9. LinkedIn Safety Constraints (Hard Requirements)

These are not optional optimizations — violating them risks the user's LinkedIn account. Any code path that would do the following must not be written, even behind a flag or a future-phase comment:

- No `chrome.scripting.executeScript` calls that simulate clicks on LinkedIn's connect, send, or follow buttons.
- No programmatic form submission on any LinkedIn page.
- No automated navigation between LinkedIn pages triggered by the extension itself (the user navigates; the extension only reacts to wherever the user already is).
- No bulk operations — the tool acts on exactly one profile or one thread per user-initiated click, never a loop over multiple profiles.

---

## 10. Testing Notes

There is no automated test suite specified for v0.1 given the single-user, personal-tool scope and the heavy dependency on live external services and live LinkedIn DOM — traditional unit tests would mostly be testing mocks. Verification is manual, per the checkpoints in Section 8. If the agent wants to add lightweight unit tests, the best candidates are the pure functions with no I/O: the JSON-parsing/validation step in Section 6.2 step 4, the filename sanitization in Section 7.4 step 4, and the prompt assembly in Section 7.3 (snapshot-style assertions on the assembled string given fixed inputs).

---

## 11. Items to Flag Back to the User, Not Decide Unilaterally

If any of the following come up during implementation, stop and ask rather than guessing, since these were explicitly left open in the PRD:

1. The exact current request shape for the Tavily API, since Section 7.6 is written from general knowledge and should be confirmed against Tavily's current docs at implementation time rather than assumed.
2. Any LinkedIn selector that cannot be made to work reliably after reasonable fallback attempts — report which field and what was tried, rather than silently shipping a field that always returns null.
