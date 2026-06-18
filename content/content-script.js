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

let currentContext = "none";
let actionButton = null;
let lastScrape = null;
let lastReport = null;
let currentMode = "quick";

// Claude's output and error messages are external input rendered via
// innerHTML below; escape before interpolating so neither can inject markup.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    return `<div class="primer-panel-loading">${escapeHtml(STAGE_LABEL[state.stage] ?? "Working…")}</div>`;
  }
  if (state.state === "error") {
    return `<div class="primer-panel-error">
      <strong>Couldn't complete this (${escapeHtml(state.dependency)}):</strong>
      <p>${escapeHtml(state.message)}</p>
      <button data-action="close">Close</button>
    </div>`;
  }
  if (state.state === "report") {
    const r = state.report;
    const points = r.connection_points
      .map((cp) => `<li>${escapeHtml(cp.claim)} <span class="primer-basis">(${escapeHtml(cp.basis)})</span></li>`)
      .join("");
    const talking = r.talking_points.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
    const cachedNote = state.cached ? `<p class="primer-cached">Showing a cached result from earlier this session.</p>` : "";
    return `<div class="primer-panel-report">
      ${cachedNote}
      <p>${escapeHtml(r.summary)}</p>
      <ul class="primer-points">${points}</ul>
      <h4>Talking points</h4>
      <ul>${talking}</ul>
      <p class="primer-saved">Saved to vault: ${escapeHtml(state.savedTo)}</p>
      <button data-action="draft">Draft a message</button>
      <button data-action="close">Close</button>
    </div>`;
  }
  if (state.state === "draft") {
    const variants = state.variants
      .map(
        (v, i) =>
          `<div class="primer-variant"><strong>${escapeHtml(v.label)}</strong><pre>${escapeHtml(v.body)}</pre><button data-action="copy" data-index="${i}">Copy</button></div>`,
      )
      .join("");
    return `<div class="primer-panel-draft" data-variants='${escapeHtml(JSON.stringify(state.variants))}'>${variants}<button data-action="close">Close</button></div>`;
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

function checkContext() {
  const ctx = detectContextFromUrl(location.href);
  if (ctx !== currentContext) {
    currentContext = ctx;
    ensureActionButton(ctx);
  }
}

// Guarded so importing this module's pure functions under Node's test
// runner (tests/content-script.test.js) doesn't touch chrome/document/
// location, which only exist inside a real content-script context.
if (typeof chrome !== "undefined" && chrome.runtime) {
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

  checkContext();
  new MutationObserver(checkContext).observe(document.body, { childList: true, subtree: true });
  setInterval(checkContext, 1000);
}
