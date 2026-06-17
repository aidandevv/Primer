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
