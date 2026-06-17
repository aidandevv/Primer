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
