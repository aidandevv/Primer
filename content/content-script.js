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
