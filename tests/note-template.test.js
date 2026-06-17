import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeFilename,
  buildFrontmatter,
  buildResearchLogEntry,
  buildDraftAppendix,
  notePathFor,
} from "../lib/note-template.js";

test("sanitizeFilename strips filesystem-invalid characters and collapses whitespace", () => {
  assert.equal(sanitizeFilename('Jane "JD" Doe: VP/Eng?'), "Jane JD Doe VPEng");
  assert.equal(sanitizeFilename("  Multiple   Spaces  "), "Multiple Spaces");
});

test("buildFrontmatter renders all required fields with the fixed tag set", () => {
  const fm = buildFrontmatter({
    name: "Jane Doe",
    headline: "VP Eng",
    company: "Acme",
    role: "VP Eng",
    linkedinUrl: "https://www.linkedin.com/in/janedoe/",
    firstContactDate: "2026-06-17",
    lastResearchDate: "2026-06-17",
  });
  assert.match(fm, /^---\n/);
  assert.match(fm, /name: Jane Doe/);
  assert.match(fm, /linkedin_url: https:\/\/www\.linkedin\.com\/in\/janedoe\//);
  assert.match(fm, /tags: \[crm, outreach\]/);
  assert.match(fm, /\n---\n/);
});

test("buildFrontmatter renders empty string for null fields, never the literal 'null'", () => {
  const fm = buildFrontmatter({ name: "Jane Doe", headline: null, company: null, role: null, linkedinUrl: "u", firstContactDate: "d", lastResearchDate: "d" });
  assert.doesNotMatch(fm, /null/);
  assert.match(fm, /headline: \n/);
});

test("buildResearchLogEntry renders summary, connection points with basis, and talking points", () => {
  const entry = buildResearchLogEntry({
    date: "2026-06-17",
    report: {
      summary: "Jane leads engineering at Acme.",
      connection_points: [{ claim: "Both attended UC Davis", basis: "vault" }],
      talking_points: ["Ask about the Acme platform migration"],
      grounding_notes: "",
    },
  });
  assert.match(entry, /^### 2026-06-17/);
  assert.match(entry, /Jane leads engineering at Acme\./);
  assert.match(entry, /- Both attended UC Davis _\(source: vault\)_/);
  assert.match(entry, /- Ask about the Acme platform migration/);
});

test("buildDraftAppendix renders each variant under its label", () => {
  const appendix = buildDraftAppendix({
    date: "2026-06-17",
    variants: [{ label: "direct", body: "Hi Jane, ..." }, { label: "warm", body: "Hey Jane! ..." }],
  });
  assert.match(appendix, /^### Drafts — 2026-06-17/);
  assert.match(appendix, /\*\*direct:\*\*\nHi Jane, \.\.\./);
  assert.match(appendix, /\*\*warm:\*\*\nHey Jane! \.\.\./);
});

test("notePathFor joins the vault folder scope and sanitized name", () => {
  assert.equal(notePathFor("LinkedIn Outreach", 'Jane "JD" Doe'), "LinkedIn Outreach/Jane JD Doe.md");
});
