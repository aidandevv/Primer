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
