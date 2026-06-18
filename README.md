# Primer

A local-first Chrome extension (Manifest V3) that researches LinkedIn contacts, surfaces points of connection, drafts outreach messages, and logs everything to an Obsidian vault. No application server — the background service worker talks directly to the Anthropic API, the Tavily API, and your local Obsidian Local REST API plugin.

See `Primer_PRD.docx` and `Primer_Implementation_Spec.md` for the full product and implementation specs this build follows.

## One-time setup

1. **Obsidian Local REST API plugin** — install and enable the community plugin, note its API key (Settings → Local REST API), and turn on **"Non-encrypted (HTTP) Server"**, noting its port (default `27123`).
2. **Use the HTTP port, not HTTPS** — Primer talks to Obsidian over plain HTTP on `127.0.0.1`, which Chrome treats as a secure context regardless of scheme. This avoids the plugin's self-signed HTTPS certificate entirely: clicking through a cert warning in a regular browser tab does not make the extension's service worker trust that cert, so HTTPS is unusable here in practice. If Obsidian is not running, the Local REST API plugin is disabled, or the HTTP server toggle is off, every `fetch()` from the extension to Obsidian will fail with a generic network error (a `TypeError`, not a clean HTTP status) — this is expected and is exactly what Milestone 6's "Obsidian unreachable" error state detects.
3. **Load the extension** — `chrome://extensions` → enable Developer mode → "Load unpacked" → select this directory.
4. **Open Primer's options page** (right-click the toolbar icon → Options, or via the extensions page) and enter your Anthropic API key, Tavily API key, Obsidian API key/port, and vault folder scope (`LinkedIn Outreach` by default — settled, see Implementation Spec Section 4).

## Running the tests

```bash
npm test
```

Runs Node's built-in test runner against every pure, I/O-free function in `lib/` and the scraping helpers in `content/content-script.js` — selector lookup, filename sanitization, prompt assembly, JSON validation, query construction, and error classification. Per Implementation Spec Section 10, there is no automated suite for the DOM/Chrome-API-dependent code (the service worker orchestration, the panel rendering, the options page) — that's verified manually using the checklist below.

## ⚠️ Items flagged per Implementation Spec Section 11 — do not treat as verified

1. **LinkedIn selectors (`lib/linkedin-selectors.js`)** are illustrative placeholders, not selectors confirmed against live LinkedIn markup. Verifying them requires opening real LinkedIn profile/DM pages in an authenticated browser session and inspecting the actual DOM — something only you (the account owner) can do, and the spec calls this out as the first task of Milestone 1. **Before relying on this extension for real outreach:** open a few real profiles and a real DM thread with DevTools open, compare the actual class names to `SELECTORS`, and update any that don't match. If a field still can't be read reliably after reasonable fallback attempts, that's the case the spec asks to flag rather than ship silently — note here which field and what you tried.

## Manual verification checklist (Implementation Spec Section 8)

These are the milestone checkpoints from the spec. Automated tests cover every pure function feeding into them; the steps below are what's left to confirm by hand since they require a live Chrome session, a live LinkedIn account, and your live API keys.

- [ ] **M0 — Scaffold:** loaded unpacked, toolbar icon visible, zero errors on the extension's card in `chrome://extensions`.
- [ ] **M1 — Selectors & scraping:** after updating selectors per the flag above, `console.log` the scrape object (content script's console, via the page's DevTools) on 3+ real profiles and 1+ real DM thread; every field populated or explicitly `null`, never `undefined`/missing.
- [ ] **M2 — Obsidian round-trip:** from the service worker's DevTools console (`chrome://extensions` → Primer → "Inspect views: service worker"), call `createOrOverwriteNote`, then `appendUnderHeading`, then `readNote` on a test path; confirm the appended content is present.
- [ ] **M3 — Research loop (quick):** click the action button on a real profile; confirm a rendered report with non-empty summary, ≥1 connection point, and a vault note created at the expected path.
- [ ] **M4 — Drafting:** after a successful research run, click "Draft a message"; confirm ≥2 labeled, copyable variants and that the vault note gained a dated drafts entry.
- [ ] **M5 — Deep research:** toggle deep mode (checkbox next to the floating action button) and re-run on the same profile; confirm ≥1 connection point with `basis: "search"`. Then deliberately set a bad Tavily key and confirm `grounding_notes` reports the search failure gracefully rather than failing the whole flow.
- [ ] **M6 — Options & error states:** misconfigure each of the three keys one at a time (wrong Anthropic key, wrong Tavily key, Obsidian unreachable, Obsidian cert untrusted, wrong Obsidian key) and confirm a distinct, correctly-worded error for each.
- [ ] **M7 — Polish:** a full quick-check → draft → vault-save run feels smooth, comfortably under the PRD's 15-second quick-check target.

## Hard constraints (do not relax)

- No backend server, database, or persistent daemon.
- LinkedIn-facing code is strictly read-only: no simulated clicks, no form submission, no automated navigation, no bulk operations.
- API keys live only in `chrome.storage.local`, entered via the options page, never hardcoded, never logged.
