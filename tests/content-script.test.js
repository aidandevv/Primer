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
