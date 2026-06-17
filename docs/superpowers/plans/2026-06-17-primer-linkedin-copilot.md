# Primer LinkedIn Outreach Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Primer Chrome (Manifest V3) extension exactly as specified in `Primer_Implementation_Spec.md` and `Primer_PRD.docx` — a read-only LinkedIn research/drafting copilot backed by Anthropic, Tavily, and a local Obsidian vault, with no application server.

**Architecture:** Pure, dependency-free ES modules in `lib/` hold all business logic (selectors, prompt assembly, API clients, note templating, session cache) and are unit-tested with Node's built-in test runner. `background/service-worker.js` and `content/content-script.js` are thin orchestration/DOM layers that import those modules and are not unit-tested directly (no DOM/Chrome API in Node) — they're verified manually per the spec's milestone checkpoints.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML, CSS, Manifest V3 Chrome extension APIs. No frameworks, no bundler, no npm runtime dependencies. Tests via Node's built-in `node:test` + `node:assert/strict` (zero test dependencies, fits the "no framework required" constraint).

## Global Constraints

- Manifest V3, Chrome only. No backend server, database, or persistent daemon — all orchestration is `fetch()` calls from the background service worker.
- Exactly three external hosts may ever be called: `api.anthropic.com`, `api.tavily.com`, `127.0.0.1:27124` (Obsidian Local REST API).
- All three API keys live only in `chrome.storage.local` (never `chrome.storage.sync`), are read at call time, never logged, never sent anywhere but their own API's Authorization header.
- LinkedIn content script is strictly read-only DOM access: no `chrome.scripting.executeScript` simulating clicks, no programmatic form submission, no automated navigation, no bulk/loop operations over multiple profiles.
- Model for both Anthropic calls: `claude-sonnet-4-6`. `max_tokens: 1200` for research, `max_tokens: 800` for drafting. No extended thinking, no tool use.
- All DOM selectors live in `lib/linkedin-selectors.js` as named constants with fallback arrays, accessed only via `queryWithFallback`/`queryAllWithFallback` — never inline selector strings elsewhere.
- A field the scraper can't read is `null`, never `undefined` and never omitted from the object.
- `vaultFolderScope` defaults to a new top-level vault folder `"LinkedIn Outreach"` — settled, do not re-litigate or nest under an existing CRM area.
- Drafts are rendered for copy-paste only — never auto-inserted into LinkedIn's compose field, never auto-sent.
- No automated test suite is required for DOM/Chrome-API code per spec Section 10; the pure, I/O-free functions (selector lookup, filename sanitization, prompt assembly, JSON validation, query construction, error classification) get unit tests.
- **Flag, don't guess:** the exact Tavily request shape (Section 7.6) and any LinkedIn selector that can't be made reliable are explicitly called out in the spec as items to confirm/flag rather than assume — both are flagged in this plan's README task rather than silently shipped as verified.

---

## File Structure

```
primer/
├── package.json                  # type: module, test script (node --test)
├── manifest.json
├── scripts/
│   └── generate-icons.mjs        # generates icons/icon{16,48,128}.png, zero deps
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── lib/
│   ├── linkedin-selectors.js     # SELECTORS map + queryWithFallback/queryAllWithFallback
│   ├── session-cache.js          # isCacheFresh() — pure TTL check used by the service worker's Map cache
│   ├── note-template.js          # sanitizeFilename, buildFrontmatter, buildResearchLogEntry, buildDraftAppendix, notePathFor
│   ├── prompt-builder.js         # USER_BACKGROUND, buildResearchPrompt, buildDraftPrompt
│   ├── anthropic-client.js       # requestResearchReport, requestDraftVariants, validate*, parseJsonResponse
│   ├── tavily-client.js          # buildTavilyQuery, formatTavilyResults, searchTavily
│   └── obsidian-client.js        # searchVault, readNote, createOrOverwriteNote, appendToNote, appendUnderHeading, patchFrontmatterField, classifyFetchError
├── content/
│   ├── content-script.js         # detectContextFromUrl, scrapeProfile, scrapeDmThread (exported/testable) + DOM wiring (untested)
│   └── panel.css
├── background/
│   └── service-worker.js         # message routing + orchestration sequences (Section 6.2-6.4)
├── options/
│   ├── options.html
│   └── options.js
├── tests/
│   ├── linkedin-selectors.test.js
│   ├── session-cache.test.js
│   ├── note-template.test.js
│   ├── prompt-builder.test.js
│   ├── anthropic-client.test.js
│   ├── tavily-client.test.js
│   ├── obsidian-client.test.js
│   └── content-script.test.js
└── README.md
```

---

## Task 1: Scaffold — package.json, manifest.json, icon generation

**Files:**
- Create: `package.json`
- Create: `manifest.json`
- Create: `scripts/generate-icons.mjs`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png` (generated, not hand-written)

**Interfaces:**
- Produces: a loadable-unpacked Chrome extension skeleton; `npm test` runs `node --test tests/`; `npm run generate:icons` regenerates icon PNGs.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "primer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/",
    "generate:icons": "node scripts/generate-icons.mjs"
  }
}
```

- [ ] **Step 2: Write `manifest.json`** (verbatim from spec Section 3)

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

- [ ] **Step 3: Write `scripts/generate-icons.mjs`** (zero-dependency PNG generator — flat accent-color square at each required size)

```js
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const ACCENT = [196, 142, 75]; // warm amber, matches the panel's accent color

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(size, [r, g, b]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idatData = deflateSync(raw);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, makePng(size, ACCENT));
  console.log(`Wrote icons/icon${size}.png`);
}
```

- [ ] **Step 4: Run the generator and confirm files exist**

Run: `node scripts/generate-icons.mjs && ls -la icons/`
Expected: `icon16.png`, `icon48.png`, `icon128.png` listed with non-zero sizes.

- [ ] **Step 5: Commit**

```bash
git add package.json manifest.json scripts/generate-icons.mjs icons/
git commit -m "feat: scaffold primer extension manifest and icon generation"
```

---

## Task 2: `lib/linkedin-selectors.js`

**Files:**
- Create: `lib/linkedin-selectors.js`
- Test: `tests/linkedin-selectors.test.js`

**Interfaces:**
- Produces: `SELECTORS` (object of named fallback-selector arrays), `queryWithFallback(root, selectorList)`, `queryAllWithFallback(root, selectorList)`. Consumed by `content/content-script.js` (Task 9).

- [ ] **Step 1: Write the failing test**

```js
// tests/linkedin-selectors.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryWithFallback, queryAllWithFallback, SELECTORS } from "../lib/linkedin-selectors.js";

function fakeRoot(matches) {
  return {
    querySelector(sel) {
      return matches[sel] ?? null;
    },
    querySelectorAll(sel) {
      return matches[sel] ?? [];
    },
  };
}

test("queryWithFallback returns the first matching element", () => {
  const root = fakeRoot({ ".second": { textContent: "found" } });
  const el = queryWithFallback(root, [".first", ".second", ".third"]);
  assert.equal(el.textContent, "found");
});

test("queryWithFallback returns null when nothing matches", () => {
  const root = fakeRoot({});
  const el = queryWithFallback(root, [".first", ".second"]);
  assert.equal(el, null);
});

test("queryAllWithFallback returns the first non-empty list", () => {
  const root = fakeRoot({ ".bubbles": [{ id: 1 }, { id: 2 }] });
  const els = queryAllWithFallback(root, [".missing", ".bubbles"]);
  assert.deepEqual(els, [{ id: 1 }, { id: 2 }]);
});

test("queryAllWithFallback returns an empty array when nothing matches", () => {
  const root = fakeRoot({});
  const els = queryAllWithFallback(root, [".missing"]);
  assert.deepEqual(els, []);
});

test("SELECTORS has a fallback array for every documented scrape field", () => {
  for (const key of [
    "profileName",
    "profileHeadline",
    "profileCurrentCompany",
    "profileRole",
    "profileLocation",
    "profileAbout",
    "profileRecentActivity",
    "dmParticipantName",
    "dmMessageBubble",
    "dmMessageText",
    "dmMessageTimestamp",
  ]) {
    assert.ok(Array.isArray(SELECTORS[key]) && SELECTORS[key].length > 0, `${key} missing`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/linkedin-selectors.test.js`
Expected: FAIL — `Cannot find module '../lib/linkedin-selectors.js'`

- [ ] **Step 3: Write `lib/linkedin-selectors.js`**

```js
// Illustrative selectors per Primer_Implementation_Spec.md Section 5.4 — NOT
// verified against live LinkedIn markup (this requires the user's own
// authenticated browser session; see README "Selector verification" section
// per spec Section 11 item 2). Update these constants and note the
// discrepancy here if LinkedIn's real DOM differs.
export const SELECTORS = {
  profileName: ["h1.text-heading-xlarge", "[data-generated-suggestion-target] h1", "main h1"],
  profileHeadline: [".text-body-medium.break-words"],
  profileCurrentCompany: [
    "[aria-label='Current company'] .pv-entity__secondary-title",
    ".pv-text-details__right-panel button[aria-label*='Current company'] div",
  ],
  profileRole: [".pv-entity__summary-info h3", "[aria-label='Current company'] + div"],
  profileLocation: [".text-body-small.inline.t-black--light.break-words"],
  profileAbout: [
    "section:has(#about) .pv-shared-text-with-see-more span[aria-hidden='true']",
    "#about ~ div .display-flex.ph5.pv3 .inline-show-more-text span[aria-hidden='true']",
  ],
  profileRecentActivity: [
    ".pv-recent-activity-detail__activity-text",
    "section[data-section='recentActivity'] .feed-shared-text",
  ],
  dmParticipantName: [".msg-entity-lockup__entity-title", "h2.msg-overlay-bubble-header__title"],
  dmMessageList: [".msg-s-message-list-container", ".msg-s-message-list"],
  dmMessageBubble: [".msg-s-event-listitem"],
  dmMessageText: [".msg-s-event-listitem__body"],
  dmMessageTimestamp: ["time.msg-s-message-group__timestamp"],
};

export function queryWithFallback(root, selectorList) {
  for (const sel of selectorList) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function queryAllWithFallback(root, selectorList) {
  for (const sel of selectorList) {
    const els = root.querySelectorAll(sel);
    if (els && els.length > 0) return Array.from(els);
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/linkedin-selectors.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/linkedin-selectors.js tests/linkedin-selectors.test.js
git commit -m "feat: add LinkedIn selector fallback map and query helpers"
```

---

## Task 3: `lib/session-cache.js`

**Files:**
- Create: `lib/session-cache.js`
- Test: `tests/session-cache.test.js`

**Interfaces:**
- Produces: `SESSION_CACHE_TTL_MS`, `isCacheFresh(entry, now?)`. Consumed by `background/service-worker.js` (Task 11).

- [ ] **Step 1: Write the failing test**

```js
// tests/session-cache.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCacheFresh, SESSION_CACHE_TTL_MS } from "../lib/session-cache.js";

test("isCacheFresh is false for a missing entry", () => {
  assert.equal(isCacheFresh(undefined), false);
});

test("isCacheFresh is true within the TTL window", () => {
  const now = 1_000_000;
  const entry = { timestamp: now - 1000 };
  assert.equal(isCacheFresh(entry, now), true);
});

test("isCacheFresh is false once the TTL has elapsed", () => {
  const now = 1_000_000;
  const entry = { timestamp: now - SESSION_CACHE_TTL_MS - 1 };
  assert.equal(isCacheFresh(entry, now), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/session-cache.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/session-cache.js`**

```js
// 10 minutes — sensible default per Primer_Implementation_Spec.md Section 6.5.
export const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;

export function isCacheFresh(entry, now = Date.now()) {
  if (!entry) return false;
  return now - entry.timestamp < SESSION_CACHE_TTL_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/session-cache.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/session-cache.js tests/session-cache.test.js
git commit -m "feat: add session cache TTL helper"
```

---

## Task 4: `lib/note-template.js`

**Files:**
- Create: `lib/note-template.js`
- Test: `tests/note-template.test.js`

**Interfaces:**
- Consumes: a `ResearchReport` shape `{ summary, connection_points: [{claim, basis}], talking_points: [string], grounding_notes }` (Section 7.2); a `draft_variants` array `[{label, body}]`.
- Produces: `sanitizeFilename(name)`, `buildFrontmatter(fields)`, `buildResearchLogEntry({date, report})`, `buildDraftAppendix({date, variants})`, `notePathFor(vaultFolderScope, name)`. Consumed by `background/service-worker.js` (Task 11).

- [ ] **Step 1: Write the failing test**

```js
// tests/note-template.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFilename,
  buildFrontmatter,
  buildResearchLogEntry,
  buildDraftAppendix,
  notePathFor,
} from "../lib/note-template.js";

test("sanitizeFilename strips filesystem-invalid characters and collapses whitespace", () => {
  assert.equal(sanitizeFilename('Jane "JD" Doe: VP/Eng?'), "Jane JD Doe VPEng");
  assert.equal(sanitizeFilename("  Multiple   Spaces  "), "Multiple Spaces");
});

test("buildFrontmatter renders all required fields with the fixed tag set", () => {
  const fm = buildFrontmatter({
    name: "Jane Doe",
    headline: "VP Eng",
    company: "Acme",
    role: "VP Eng",
    linkedinUrl: "https://www.linkedin.com/in/janedoe/",
    firstContactDate: "2026-06-17",
    lastResearchDate: "2026-06-17",
  });
  assert.match(fm, /^---\n/);
  assert.match(fm, /name: Jane Doe/);
  assert.match(fm, /linkedin_url: https:\/\/www\.linkedin\.com\/in\/janedoe\//);
  assert.match(fm, /tags: \[crm, outreach\]/);
  assert.match(fm, /\n---\n/);
});

test("buildFrontmatter renders empty string for null fields, never the literal 'null'", () => {
  const fm = buildFrontmatter({ name: "Jane Doe", headline: null, company: null, role: null, linkedinUrl: "u", firstContactDate: "d", lastResearchDate: "d" });
  assert.doesNotMatch(fm, /null/);
  assert.match(fm, /headline: \n/);
});

test("buildResearchLogEntry renders summary, connection points with basis, and talking points", () => {
  const entry = buildResearchLogEntry({
    date: "2026-06-17",
    report: {
      summary: "Jane leads engineering at Acme.",
      connection_points: [{ claim: "Both attended UC Davis", basis: "vault" }],
      talking_points: ["Ask about the Acme platform migration"],
      grounding_notes: "",
    },
  });
  assert.match(entry, /^### 2026-06-17/);
  assert.match(entry, /Jane leads engineering at Acme\./);
  assert.match(entry, /- Both attended UC Davis _\(source: vault\)_/);
  assert.match(entry, /- Ask about the Acme platform migration/);
});

test("buildDraftAppendix renders each variant under its label", () => {
  const appendix = buildDraftAppendix({
    date: "2026-06-17",
    variants: [{ label: "direct", body: "Hi Jane, ..." }, { label: "warm", body: "Hey Jane! ..." }],
  });
  assert.match(appendix, /^### Drafts — 2026-06-17/);
  assert.match(appendix, /\*\*direct:\*\*\nHi Jane, \.\.\./);
  assert.match(appendix, /\*\*warm:\*\*\nHey Jane! \.\.\./);
});

test("notePathFor joins the vault folder scope and sanitized name", () => {
  assert.equal(notePathFor("LinkedIn Outreach", 'Jane "JD" Doe'), "LinkedIn Outreach/Jane JD Doe.md");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/note-template.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/note-template.js`**

```js
export function sanitizeFilename(name) {
  return name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFrontmatter({ name, headline, company, role, linkedinUrl, firstContactDate, lastResearchDate }) {
  return [
    "---",
    `name: ${name ?? ""}`,
    `headline: ${headline ?? ""}`,
    `company: ${company ?? ""}`,
    `role: ${role ?? ""}`,
    `linkedin_url: ${linkedinUrl ?? ""}`,
    `first_contact_date: ${firstContactDate ?? ""}`,
    `last_research_date: ${lastResearchDate ?? ""}`,
    "tags: [crm, outreach]",
    "---",
    "",
  ].join("\n");
}

export function buildResearchLogEntry({ date, report }) {
  const lines = [`### ${date}`, report.summary, "", "**Connection points:**"];
  for (const cp of report.connection_points) {
    lines.push(`- ${cp.claim} _(source: ${cp.basis})_`);
  }
  lines.push("", "**Talking points:**");
  for (const tp of report.talking_points) {
    lines.push(`- ${tp}`);
  }
  if (report.grounding_notes) {
    lines.push("", `_Grounding notes: ${report.grounding_notes}_`);
  }
  return lines.join("\n");
}

export function buildDraftAppendix({ date, variants }) {
  const lines = [`### Drafts — ${date}`];
  for (const v of variants) {
    lines.push(`**${v.label}:**`, v.body, "");
  }
  return lines.join("\n").trimEnd();
}

export function notePathFor(vaultFolderScope, name) {
  return `${vaultFolderScope}/${sanitizeFilename(name)}.md`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/note-template.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/note-template.js tests/note-template.test.js
git commit -m "feat: add vault note frontmatter and research-log templating"
```

---

## Task 5: `lib/prompt-builder.js`

**Files:**
- Create: `lib/prompt-builder.js`
- Test: `tests/prompt-builder.test.js`

**Interfaces:**
- Consumes: scrape shape (Section 5.3), vault search results `[{path, excerpt}]`, Tavily results `[{title, snippet}]`, a prior `ResearchReport`.
- Produces: `USER_BACKGROUND`, `buildResearchPrompt({scrape, vaultContext, searchContext})` → `{system, user}`, `buildDraftPrompt({scrape, priorReport})` → `{system, user}`. Consumed by `background/service-worker.js` (Task 11).

- [ ] **Step 1: Write the failing test**

```js
// tests/prompt-builder.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prompt-builder.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/prompt-builder.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prompt-builder.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-builder.js tests/prompt-builder.test.js
git commit -m "feat: add research and draft prompt assembly"
```

---

## Task 6: `lib/anthropic-client.js`

**Files:**
- Create: `lib/anthropic-client.js`
- Test: `tests/anthropic-client.test.js`

**Interfaces:**
- Consumes: `{system, user}` from `prompt-builder.js`; global `fetch`.
- Produces: `AnthropicError`, `parseJsonResponse(text)`, `validateResearchReport(parsed)`, `validateDraftVariants(parsed)`, `requestResearchReport({apiKey, system, user})`, `requestDraftVariants({apiKey, system, user})`. Consumed by `background/service-worker.js` (Task 11).

- [ ] **Step 1: Write the failing test** (covers the pure validation/parsing functions; the networked functions are exercised manually per Milestone 3/4 since mocking global `fetch` would only test the mock)

```js
// tests/anthropic-client.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJsonResponse, validateResearchReport, validateDraftVariants } from "../lib/anthropic-client.js";

test("parseJsonResponse parses valid JSON and trims surrounding whitespace", () => {
  assert.deepEqual(parseJsonResponse('  {"a":1}  '), { a: 1 });
});

test("parseJsonResponse returns null for non-JSON text instead of throwing", () => {
  assert.equal(parseJsonResponse("not json"), null);
});

test("validateResearchReport accepts a well-formed report", () => {
  const report = {
    summary: "s",
    connection_points: [{ claim: "c", basis: "vault" }],
    talking_points: ["t"],
    grounding_notes: "",
  };
  assert.equal(validateResearchReport(report), true);
});

test("validateResearchReport rejects a missing field", () => {
  assert.equal(validateResearchReport({ connection_points: [], talking_points: [], grounding_notes: "" }), false);
});

test("validateResearchReport rejects an unknown basis value", () => {
  const report = {
    summary: "s",
    connection_points: [{ claim: "c", basis: "guessed" }],
    talking_points: [],
    grounding_notes: "",
  };
  assert.equal(validateResearchReport(report), false);
});

test("validateDraftVariants accepts a well-formed variants list", () => {
  assert.equal(validateDraftVariants({ draft_variants: [{ label: "direct", body: "hi" }] }), true);
});

test("validateDraftVariants rejects a variant missing a body", () => {
  assert.equal(validateDraftVariants({ draft_variants: [{ label: "direct" }] }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/anthropic-client.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/anthropic-client.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/anthropic-client.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/anthropic-client.js tests/anthropic-client.test.js
git commit -m "feat: add Anthropic client with JSON validation and one-retry parsing"
```

---

## Task 7: `lib/tavily-client.js`

**Files:**
- Create: `lib/tavily-client.js`
- Test: `tests/tavily-client.test.js`

**Interfaces:**
- Produces: `TavilyError`, `buildTavilyQuery({company, name})`, `formatTavilyResults(results, limit?)`, `searchTavily({apiKey, query})`. Consumed by `background/service-worker.js` (Task 11).
- **Flagged per spec Section 11 item 1:** the request body shape below (`api_key` in the JSON body) is written from general knowledge of Tavily's API and must be confirmed against Tavily's current docs before relying on it in production — called out again in the README task.

- [ ] **Step 1: Write the failing test**

```js
// tests/tavily-client.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTavilyQuery, formatTavilyResults, TavilyError } from "../lib/tavily-client.js";

test("buildTavilyQuery prefers '{company} news' when a company is known", () => {
  assert.equal(buildTavilyQuery({ company: "Acme", name: "Jane Doe" }), "Acme news");
});

test("buildTavilyQuery falls back to the person's name when company is unknown", () => {
  assert.equal(buildTavilyQuery({ company: null, name: "Jane Doe" }), "Jane Doe");
});

test("buildTavilyQuery throws when neither company nor name is available", () => {
  assert.throws(() => buildTavilyQuery({ company: null, name: null }), TavilyError);
});

test("formatTavilyResults caps to the limit and trims content to a snippet", () => {
  const results = Array.from({ length: 6 }, (_, i) => ({ title: `Title ${i}`, content: "x".repeat(500) }));
  const formatted = formatTavilyResults(results);
  assert.equal(formatted.length, 4);
  assert.equal(formatted[0].title, "Title 0");
  assert.equal(formatted[0].snippet.length, 280);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tavily-client.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/tavily-client.js`**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tavily-client.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/tavily-client.js tests/tavily-client.test.js
git commit -m "feat: add Tavily client with query construction and result trimming"
```

---

## Task 8: `lib/obsidian-client.js`

**Files:**
- Create: `lib/obsidian-client.js`
- Test: `tests/obsidian-client.test.js`

**Interfaces:**
- Produces: `ObsidianError` (with `.kind`), `classifyFetchError(err, response)`, `searchVault`, `readNote`, `createOrOverwriteNote`, `appendToNote`, `appendUnderHeading`, `patchFrontmatterField`. Consumed by `background/service-worker.js` (Task 11).

- [ ] **Step 1: Write the failing test**

```js
// tests/obsidian-client.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFetchError, ObsidianError } from "../lib/obsidian-client.js";

test("classifyFetchError reports unreachable_or_untrusted_cert for a TypeError with no response", () => {
  assert.equal(classifyFetchError(new TypeError("Failed to fetch"), null), "unreachable_or_untrusted_cert");
});

test("classifyFetchError reports unauthorized for a 401 response", () => {
  assert.equal(classifyFetchError(null, { status: 401 }), "unauthorized");
});

test("classifyFetchError reports unknown for any other response status", () => {
  assert.equal(classifyFetchError(null, { status: 500 }), "unknown");
});

test("ObsidianError carries a kind alongside the message", () => {
  const err = new ObsidianError("nope", "unauthorized");
  assert.equal(err.message, "nope");
  assert.equal(err.kind, "unauthorized");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/obsidian-client.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write `lib/obsidian-client.js`**

```js
// Distinguishes "plugin not running" (connection refused) from "cert not
// trusted yet" from "wrong key" per Primer_Implementation_Spec.md Section 7.1
// implementation note. Both connection-refused and untrusted-cert surface as
// a TypeError from fetch() with no usable detail — fetch() in a service
// worker cannot tell them apart, so both map to the same kind and the error
// message below names both possibilities for the user to check.
export class ObsidianError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // "unreachable_or_untrusted_cert" | "unauthorized" | "unknown"
  }
}

export function classifyFetchError(err, response) {
  if (response) {
    if (response.status === 401) return "unauthorized";
    return "unknown";
  }
  if (err instanceof TypeError) {
    return "unreachable_or_untrusted_cert";
  }
  return "unknown";
}

function baseUrl(port) {
  return `https://127.0.0.1:${port}`;
}

async function request({ port, apiKey, path, method, headers, body }) {
  let res;
  try {
    res = await fetch(`${baseUrl(port)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      body,
    });
  } catch (err) {
    throw new ObsidianError(
      "Could not reach the Obsidian Local REST API. Confirm Obsidian is running, the Local REST API plugin is enabled, and you've trusted its certificate at https://127.0.0.1:27124/.",
      classifyFetchError(err, null),
    );
  }
  if (!res.ok) {
    const kind = classifyFetchError(null, res);
    const message =
      kind === "unauthorized"
        ? "Obsidian rejected the request: the API key is wrong."
        : `Obsidian API error: ${res.status}`;
    throw new ObsidianError(message, kind);
  }
  return res;
}

export async function searchVault({ port, apiKey, query }) {
  const res = await request({
    port,
    apiKey,
    path: "/search/",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function readNote({ port, apiKey, path }) {
  const res = await request({ port, apiKey, path: `/vault/${path}`, method: "GET" });
  return res.text();
}

export async function createOrOverwriteNote({ port, apiKey, path, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PUT",
    headers: { "content-type": "text/markdown" },
    body: content,
  });
}

export async function appendToNote({ port, apiKey, path, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "POST",
    headers: { "content-type": "text/markdown" },
    body: content,
  });
}

export async function appendUnderHeading({ port, apiKey, path, heading, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PATCH",
    headers: {
      "content-type": "text/markdown",
      Operation: "append",
      "Target-Type": "heading",
      Target: heading,
    },
    body: content,
  });
}

export async function patchFrontmatterField({ port, apiKey, path, field, value }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PATCH",
    headers: {
      "content-type": "text/markdown",
      Operation: "replace",
      "Target-Type": "frontmatter",
      Target: field,
    },
    body: value,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/obsidian-client.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/obsidian-client.js tests/obsidian-client.test.js
git commit -m "feat: add Obsidian Local REST API client with error classification"
```

---

## Task 9: `content/content-script.js` — pure context detection and scraping

**Files:**
- Create: `content/content-script.js` (this task: exported pure functions only)
- Test: `tests/content-script.test.js`

**Interfaces:**
- Consumes: `SELECTORS`, `queryWithFallback`, `queryAllWithFallback` from `lib/linkedin-selectors.js`.
- Produces: `detectContextFromUrl(url)` → `"profile" | "dm" | "none"`, `scrapeProfile(root, url)` → profile scrape shape, `scrapeDmThread(root, url)` → DM scrape shape (both per Section 5.3). Consumed by the DOM-wiring half of this same file added in Task 10, and by `background/service-worker.js` only indirectly (it receives the already-scraped object).

- [ ] **Step 1: Write the failing test**

```js
// tests/content-script.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectContextFromUrl, scrapeProfile, scrapeDmThread } from "../content/content-script.js";

test("detectContextFromUrl recognizes a profile URL", () => {
  assert.equal(detectContextFromUrl("https://www.linkedin.com/in/janedoe/"), "profile");
});

test("detectContextFromUrl recognizes a DM thread URL", () => {
  assert.equal(detectContextFromUrl("https://www.linkedin.com/messaging/thread/abc123/"), "dm");
});

test("detectContextFromUrl returns none for the feed or search results", () => {
  assert.equal(detectContextFromUrl("https://www.linkedin.com/feed/"), "none");
  assert.equal(detectContextFromUrl("https://www.linkedin.com/search/results/people/"), "none");
});

function el(text) {
  return { textContent: text };
}

function fakeRoot(matches) {
  return {
    querySelector(sel) {
      return matches[sel] ?? null;
    },
    querySelectorAll(sel) {
      return matches[sel] ?? [];
    },
  };
}

test("scrapeProfile fills every field when present and stays null (never undefined) when absent", () => {
  const root = fakeRoot({
    "h1.text-heading-xlarge": el("Jane Doe"),
    ".text-body-medium.break-words": el("VP Eng at Acme"),
  });
  const scrape = scrapeProfile(root, "https://www.linkedin.com/in/janedoe/");
  assert.equal(scrape.context, "profile");
  assert.equal(scrape.name, "Jane Doe");
  assert.equal(scrape.headline, "VP Eng at Acme");
  assert.equal(scrape.company, null);
  assert.equal(scrape.about, null);
  for (const key of Object.keys(scrape)) {
    assert.notEqual(scrape[key], undefined, `${key} must not be undefined`);
  }
});

test("scrapeDmThread builds a chronological message list from bubbles", () => {
  const bubbles = [
    {
      classList: { contains: (c) => c === "msg-s-event-listitem--other" },
      querySelector(sel) {
        if (sel === ".msg-s-event-listitem__body") return el("Hi there!");
        if (sel === "time.msg-s-message-group__timestamp") return el("10:01 AM");
        return null;
      },
    },
    {
      classList: { contains: () => false },
      querySelector(sel) {
        if (sel === ".msg-s-event-listitem__body") return el("Hey, thanks for reaching out");
        return null;
      },
    },
  ];
  const root = fakeRoot({
    ".msg-entity-lockup__entity-title": el("Jane Doe"),
    ".msg-s-event-listitem": bubbles,
  });
  const scrape = scrapeDmThread(root, "https://www.linkedin.com/messaging/thread/abc123/");
  assert.equal(scrape.context, "dm");
  assert.equal(scrape.participantName, "Jane Doe");
  assert.deepEqual(scrape.messages, [
    { sender: "them", text: "Hi there!", timestamp: "10:01 AM" },
    { sender: "me", text: "Hey, thanks for reaching out", timestamp: null },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/content-script.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the pure-function portion of `content/content-script.js`**

```js
import { SELECTORS, queryWithFallback, queryAllWithFallback } from "../lib/linkedin-selectors.js";

export function detectContextFromUrl(url) {
  if (/\/in\/[^/]+\/?(?:[?#].*)?$/.test(url)) return "profile";
  if (/\/messaging\/thread\/[^/]+\/?(?:[?#].*)?$/.test(url)) return "dm";
  return "none";
}

function text(el) {
  return el ? el.textContent.trim() : null;
}

export function scrapeProfile(root, url) {
  return {
    context: "profile",
    url,
    name: text(queryWithFallback(root, SELECTORS.profileName)),
    headline: text(queryWithFallback(root, SELECTORS.profileHeadline)),
    company: text(queryWithFallback(root, SELECTORS.profileCurrentCompany)),
    role: text(queryWithFallback(root, SELECTORS.profileRole)),
    location: text(queryWithFallback(root, SELECTORS.profileLocation)),
    about: text(queryWithFallback(root, SELECTORS.profileAbout)),
    recentActivity: text(queryWithFallback(root, SELECTORS.profileRecentActivity)),
  };
}

export function scrapeDmThread(root, url) {
  const bubbles = queryAllWithFallback(root, SELECTORS.dmMessageBubble);
  const messages = bubbles.map((bubble) => {
    const textEl = queryWithFallback(bubble, SELECTORS.dmMessageText);
    const tsEl = queryWithFallback(bubble, SELECTORS.dmMessageTimestamp);
    const isOther = Boolean(bubble.classList && bubble.classList.contains("msg-s-event-listitem--other"));
    return {
      sender: isOther ? "them" : "me",
      text: text(textEl) ?? "",
      timestamp: text(tsEl),
    };
  });
  return {
    context: "dm",
    url,
    participantName: text(queryWithFallback(root, SELECTORS.dmParticipantName)),
    messages,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/content-script.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add content/content-script.js tests/content-script.test.js
git commit -m "feat: add LinkedIn page context detection and DOM scraping"
```

---

## Task 10: Content script DOM wiring + results panel CSS

**Files:**
- Modify: `content/content-script.js` (append DOM-wiring code below the Task 9 exports — same file, no exports removed)
- Create: `content/panel.css`

**Interfaces:**
- Consumes: `detectContextFromUrl`, `scrapeProfile`, `scrapeDmThread` (same file, Task 9); `chrome.runtime.sendMessage` / `chrome.runtime.onMessage` message shapes from Section 6.1.
- Produces: a floating action button + results panel rendering `loading`/`report`/`draft`/`error` states. Not unit-tested (requires a real DOM/Chrome runtime) — verified manually per Milestone 3/4/6 in Task 14's checklist.

This task has no test step (Chrome APIs and the live DOM aren't available under `node --test`); it's verified manually in Task 14.

- [ ] **Step 1: Append the DOM-wiring code to `content/content-script.js`**

```js
let currentContext = "none";
let actionButton = null;
let lastScrape = null;
let lastReport = null;
let currentMode = "quick";

function ensureActionButton(context) {
  if (context === "none") {
    actionButton?.remove();
    actionButton = null;
    return;
  }
  if (actionButton) {
    actionButton.textContent = context === "profile" ? "Research this person" : "Research this thread";
    return;
  }
  actionButton = document.createElement("button");
  actionButton.id = "primer-action-button";
  actionButton.textContent = context === "profile" ? "Research this person" : "Research this thread";
  actionButton.addEventListener("click", onActionClick);
  document.body.appendChild(actionButton);
}

function onActionClick() {
  const url = location.href;
  lastScrape = currentContext === "profile" ? scrapeProfile(document, url) : scrapeDmThread(document, url);
  renderPanel({ state: "loading", stage: "loading" });
  chrome.runtime.sendMessage({ type: "RESEARCH_REQUEST", mode: currentMode, scrape: lastScrape });
}

function onDraftClick() {
  renderPanel({ state: "loading", stage: "calling_claude" });
  chrome.runtime.sendMessage({ type: "DRAFT_REQUEST", scrape: lastScrape, priorReport: lastReport });
}

function onModeToggle(event) {
  currentMode = event.target.checked ? "deep" : "quick";
}

const STAGE_LABEL = {
  loading: "Starting…",
  searching_vault: "Searching your vault…",
  searching_web: "Searching the web…",
  calling_claude: "Asking Claude…",
  writing_vault: "Saving to vault…",
};

function renderPanelHtml(state) {
  if (state.state === "loading") {
    return `<div class="primer-panel-loading">${STAGE_LABEL[state.stage] ?? "Working…"}</div>`;
  }
  if (state.state === "error") {
    return `<div class="primer-panel-error">
      <strong>Couldn't complete this (${state.dependency}):</strong>
      <p>${state.message}</p>
      <button data-action="close">Close</button>
    </div>`;
  }
  if (state.state === "report") {
    const r = state.report;
    const points = r.connection_points
      .map((cp) => `<li>${cp.claim} <span class="primer-basis">(${cp.basis})</span></li>`)
      .join("");
    const talking = r.talking_points.map((t) => `<li>${t}</li>`).join("");
    const cachedNote = state.cached ? `<p class="primer-cached">Showing a cached result from earlier this session.</p>` : "";
    return `<div class="primer-panel-report">
      ${cachedNote}
      <p>${r.summary}</p>
      <ul class="primer-points">${points}</ul>
      <h4>Talking points</h4>
      <ul>${talking}</ul>
      <p class="primer-saved">Saved to vault: ${state.savedTo}</p>
      <button data-action="draft">Draft a message</button>
      <button data-action="close">Close</button>
    </div>`;
  }
  if (state.state === "draft") {
    const variants = state.variants
      .map(
        (v, i) =>
          `<div class="primer-variant"><strong>${v.label}</strong><pre>${v.body}</pre><button data-action="copy" data-index="${i}">Copy</button></div>`,
      )
      .join("");
    return `<div class="primer-panel-draft" data-variants='${JSON.stringify(state.variants)}'>${variants}<button data-action="close">Close</button></div>`;
  }
  return "";
}

function renderPanel(state) {
  let panel = document.getElementById("primer-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "primer-panel";
    document.body.appendChild(panel);
  }
  panel.innerHTML = renderPanelHtml(state);
  panel.querySelector("[data-action='draft']")?.addEventListener("click", onDraftClick);
  panel.querySelector("[data-action='close']")?.addEventListener("click", () => panel.remove());
  panel.querySelectorAll("[data-action='copy']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const variants = JSON.parse(panel.querySelector(".primer-panel-draft").dataset.variants);
      navigator.clipboard.writeText(variants[Number(btn.dataset.index)].body);
      btn.textContent = "Copied";
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    renderPanel({ state: "loading", stage: message.stage });
  } else if (message.type === "RESEARCH_RESULT") {
    lastReport = message.report;
    renderPanel({ state: "report", report: message.report, savedTo: message.savedTo, cached: message.cached });
  } else if (message.type === "DRAFT_RESULT") {
    renderPanel({ state: "draft", variants: message.variants });
  } else if (message.type === "ERROR") {
    renderPanel({ state: "error", message: message.message, dependency: message.dependency });
  }
});

function checkContext() {
  const ctx = detectContextFromUrl(location.href);
  if (ctx !== currentContext) {
    currentContext = ctx;
    ensureActionButton(ctx);
  }
}

checkContext();
new MutationObserver(checkContext).observe(document.body, { childList: true, subtree: true });
setInterval(checkContext, 1000);
```

- [ ] **Step 2: Write `content/panel.css`** (restrained dark panel, single amber accent, per PRD Section 6.3 — not a default browser-extension look)

```css
#primer-action-button {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: #1a1a1a;
  color: #f5f0e8;
  border: 1px solid #c48e4b;
  border-radius: 999px;
  padding: 10px 18px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

#primer-action-button:hover {
  border-color: #e0a85f;
}

#primer-panel {
  position: fixed;
  bottom: 80px;
  right: 24px;
  z-index: 9999;
  width: 340px;
  max-height: 70vh;
  overflow-y: auto;
  background: #141414;
  color: #f5f0e8;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

#primer-panel h4 {
  color: #c48e4b;
  margin: 12px 0 4px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

#primer-panel button {
  background: transparent;
  color: #c48e4b;
  border: 1px solid #c48e4b;
  border-radius: 6px;
  padding: 6px 12px;
  margin: 8px 4px 0 0;
  cursor: pointer;
  font-size: 12px;
}

#primer-panel button:hover {
  background: #c48e4b;
  color: #141414;
}

.primer-basis {
  color: #8a8a8a;
  font-size: 11px;
}

.primer-saved,
.primer-cached {
  color: #8a8a8a;
  font-size: 11px;
}

.primer-panel-error {
  color: #e07a5f;
}

.primer-variant pre {
  white-space: pre-wrap;
  background: #1f1f1f;
  padding: 8px;
  border-radius: 6px;
}
```

- [ ] **Step 3: Commit**

```bash
git add content/content-script.js content/panel.css
git commit -m "feat: wire up action button and results panel rendering"
```

---

## Task 11: `background/service-worker.js`

**Files:**
- Create: `background/service-worker.js`

**Interfaces:**
- Consumes: every `lib/*.js` module from Tasks 2-8; `chrome.storage.local`, `chrome.runtime.onMessage`, `chrome.tabs.sendMessage`.
- Produces: handles `RESEARCH_REQUEST` and `DRAFT_REQUEST` per Section 6.2-6.4, sending `STATUS`/`RESEARCH_RESULT`/`DRAFT_RESULT`/`ERROR` messages back to the tab. Not unit-tested (Chrome service-worker globals aren't available under `node --test`) — verified manually in Task 14 (Milestones 2-6).

No test step for this task — it's pure orchestration over already-tested `lib/` functions, and Chrome's service worker runtime can't be instantiated under Node.

- [ ] **Step 1: Write `background/service-worker.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add background service worker orchestration"
```

---

## Task 12: Options page

**Files:**
- Create: `options/options.html`
- Create: `options/options.js`

**Interfaces:**
- Produces: a form persisting `anthropicApiKey`, `tavilyApiKey`, `obsidianApiKey`, `obsidianPort`, `vaultFolderScope`, `defaultMode` to `chrome.storage.local` (Section 4 schema, F6.1-F6.3). Not unit-tested (Chrome storage API + DOM) — verified manually in Task 14 (Milestone 6).

- [ ] **Step 1: Write `options/options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Primer Settings</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #141414; color: #f5f0e8; padding: 24px; max-width: 480px; }
    label { display: block; margin-top: 16px; font-size: 13px; color: #c48e4b; }
    input, select { width: 100%; margin-top: 4px; padding: 8px; background: #1f1f1f; color: #f5f0e8; border: 1px solid #2a2a2a; border-radius: 6px; }
    button { margin-top: 20px; padding: 8px 16px; background: transparent; color: #c48e4b; border: 1px solid #c48e4b; border-radius: 6px; cursor: pointer; }
    button:hover { background: #c48e4b; color: #141414; }
    #status { margin-top: 12px; font-size: 12px; color: #8a8a8a; }
  </style>
</head>
<body>
  <h2>Primer Settings</h2>
  <form id="settings-form">
    <label>Anthropic API key
      <input type="password" id="anthropicApiKey" autocomplete="off" />
    </label>
    <label>Tavily API key
      <input type="password" id="tavilyApiKey" autocomplete="off" />
    </label>
    <label>Obsidian Local REST API key
      <input type="password" id="obsidianApiKey" autocomplete="off" />
    </label>
    <label>Obsidian port
      <input type="number" id="obsidianPort" value="27124" />
    </label>
    <label>Vault folder scope
      <input type="text" id="vaultFolderScope" value="LinkedIn Outreach" />
    </label>
    <label>Default mode
      <select id="defaultMode">
        <option value="quick">Quick-check</option>
        <option value="deep">Deep research</option>
      </select>
    </label>
    <button type="submit">Save</button>
    <div id="status"></div>
  </form>
  <script type="module" src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `options/options.js`**

```js
const FIELDS = ["anthropicApiKey", "tavilyApiKey", "obsidianApiKey", "obsidianPort", "vaultFolderScope", "defaultMode"];

async function load() {
  const stored = await chrome.storage.local.get(FIELDS);
  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (stored[field] !== undefined) el.value = stored[field];
  }
}

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = {};
  for (const field of FIELDS) {
    const el = document.getElementById(field);
    values[field] = field === "obsidianPort" ? Number(el.value) : el.value;
  }
  await chrome.storage.local.set(values);
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
});

load();
```

- [ ] **Step 3: Commit**

```bash
git add options/options.html options/options.js
git commit -m "feat: add options page for API keys, vault scope, and default mode"
```

---

## Task 13: README — setup, selector verification flag, manual milestone checklist

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Primer

A local-first Chrome extension (Manifest V3) that researches LinkedIn contacts, surfaces points of connection, drafts outreach messages, and logs everything to an Obsidian vault. No application server — the background service worker talks directly to the Anthropic API, the Tavily API, and your local Obsidian Local REST API plugin.

See `Primer_PRD.docx` and `Primer_Implementation_Spec.md` for the full product and implementation specs this build follows.

## One-time setup

1. **Obsidian Local REST API plugin** — install and enable the community plugin, note its API key (Settings → Local REST API) and port (default `27124`).
2. **Trust the self-signed certificate** — visit `https://127.0.0.1:27124/` in a regular Chrome tab once and accept the certificate warning. Until you do this, every `fetch()` from the extension to Obsidian will fail with a generic network error (a `TypeError`, not a clean HTTP status) — this is expected and is exactly what Milestone 6's "Obsidian cert untrusted" error state detects.
3. **Load the extension** — `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.
4. **Open Primer's options page** (right-click the toolbar icon → Options, or via the extensions page) and enter your Anthropic API key, Tavily API key, Obsidian API key/port, and vault folder scope (`LinkedIn Outreach` by default — settled, see Implementation Spec Section 4).

## Running the tests

```bash
npm test
```

Runs Node's built-in test runner against every pure, I/O-free function in `lib/` and the scraping helpers in `content/content-script.js` — selector lookup, filename sanitization, prompt assembly, JSON validation, query construction, and error classification. Per Implementation Spec Section 10, there is no automated suite for the DOM/Chrome-API-dependent code (the service worker orchestration, the panel rendering, the options page) — that's verified manually using the checklist below.

## ⚠️ Items flagged per Implementation Spec Section 11 — do not treat as verified

1. **LinkedIn selectors (`lib/linkedin-selectors.js`)** are illustrative placeholders, not selectors confirmed against live LinkedIn markup. Verifying them requires opening real LinkedIn profile/DM pages in an authenticated browser session and inspecting the actual DOM — something only you (the account owner) can do, and the spec calls this out as the first task of Milestone 1. **Before relying on this extension for real outreach:** open a few real profiles and a real DM thread with DevTools open, compare the actual class names to `SELECTORS`, and update any that don't match. If a field still can't be read reliably after reasonable fallback attempts, that's the case the spec asks to flag rather than ship silently — note here which field and what you tried.
2. **Tavily request shape (`lib/tavily-client.js`)** — the `POST` body with `api_key` inline is written from general knowledge of Tavily's API, not confirmed against current docs. Confirm the exact current request shape at https://tavily.com (or their docs) before relying on deep-research mode.

## Manual verification checklist (Implementation Spec Section 8)

These are the milestone checkpoints from the spec. Automated tests cover every pure function feeding into them; the steps below are what's left to confirm by hand since they require a live Chrome session, a live LinkedIn account, and your live API keys.

- [ ] **M0 — Scaffold:** loaded unpacked, toolbar icon visible, zero errors on the extension's card in `chrome://extensions`.
- [ ] **M1 — Selectors & scraping:** after updating selectors per the flag above, `console.log` the scrape object (content script's console, via the page's DevTools) on 3+ real profiles and 1+ real DM thread; every field populated or explicitly `null`, never `undefined`/missing.
- [ ] **M2 — Obsidian round-trip:** from the service worker's DevTools console (`chrome://extensions` → Primer → "Inspect views: service worker"), call `createOrOverwriteNote`, then `appendUnderHeading`, then `readNote` on a test path; confirm the appended content is present.
- [ ] **M3 — Research loop (quick):** click the action button on a real profile; confirm a rendered report with non-empty summary, ≥1 connection point, and a vault note created at the expected path.
- [ ] **M4 — Drafting:** after a successful research run, click "Draft a message"; confirm ≥2 labeled, copyable variants and that the vault note gained a dated drafts entry.
- [ ] **M5 — Deep research:** toggle deep mode and re-run on the same profile; confirm ≥1 connection point with `basis: "search"`. Then deliberately set a bad Tavily key and confirm `grounding_notes` reports the search failure gracefully rather than failing the whole flow.
- [ ] **M6 — Options & error states:** misconfigure each of the three keys one at a time (wrong Anthropic key, wrong Tavily key, Obsidian unreachable, Obsidian cert untrusted, wrong Obsidian key) and confirm a distinct, correctly-worded error for each.
- [ ] **M7 — Polish:** a full quick-check → draft → vault-save run feels smooth, comfortably under the PRD's 15-second quick-check target.

## Hard constraints (do not relax)

- No backend server, database, or persistent daemon.
- LinkedIn-facing code is strictly read-only: no simulated clicks, no form submission, no automated navigation, no bulk operations.
- API keys live only in `chrome.storage.local`, entered via the options page, never hardcoded, never logged.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup instructions, flagged items, and manual verification checklist"
```

---

## Task 14: Full automated test pass + final review

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file from Tasks 2-9 reports passing assertions, zero failures.

- [ ] **Step 2: Confirm no stray inline selector strings exist outside `lib/linkedin-selectors.js`**

Run: `grep -rn "querySelector" content/ background/ | grep -v "lib/linkedin-selectors.js"`
Expected: only `content/content-script.js` calls through `queryWithFallback`/`queryAllWithFallback` (imported from `lib/linkedin-selectors.js`) — no raw selector strings.

- [ ] **Step 3: Confirm no LinkedIn-side write/navigation calls exist anywhere (Section 9 hard constraint)**

Run: `grep -rn "executeScript\|\.click()\|\.submit()" content/ background/`
Expected: no matches.

- [ ] **Step 4: Confirm only the three permitted hosts are ever fetched**

Run: `grep -rno "https://[a-zA-Z0-9.\-]*" lib/ background/ | sort -u`
Expected: only `api.anthropic.com`, `api.tavily.com`, `127.0.0.1` (within the obsidian-client base URL template).

- [ ] **Step 5: Final commit confirming the build is complete**

```bash
git add -A
git status
```

Expected: working tree clean (everything already committed task-by-task); if anything is staged, review it before committing — there should be nothing left from this plan's tasks.
