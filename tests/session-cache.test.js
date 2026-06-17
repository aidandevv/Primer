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
