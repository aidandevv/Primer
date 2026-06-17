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
