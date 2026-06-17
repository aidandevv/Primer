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
