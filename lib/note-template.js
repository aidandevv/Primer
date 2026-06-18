export function sanitizeFilename(name) {
  return name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BASIS_VALUES = ["vault", "scraped", "search", "inferred"];

// Scraped LinkedIn text (name/headline/company/role) and the current page
// URL are externally-influenced strings. Quoted single-line YAML scalars
// (with embedded single quotes doubled per the YAML spec) are immune to
// colons, '#', '---', or embedded newlines being read as new frontmatter
// keys or document boundaries.
function yamlSafeScalar(value) {
  const s = String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return `'${s.replace(/'/g, "''")}'`;
}

// Claude's response is structured JSON but its string fields are free text
// and shouldn't be trusted to stay on one line or avoid markdown syntax.
function sanitizeInline(value) {
  return String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

// Multi-line free text (summary, grounding notes, draft bodies) is allowed
// to span lines, but a line that would otherwise be read as a heading or
// horizontal rule is backslash-escaped so it can't inject document
// structure into the note.
function sanitizeBlock(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => (/^\s*(#{1,6}\s|-{3,}\s*$|\*{3,}\s*$|_{3,}\s*$)/.test(line) ? `\\${line}` : line))
    .join("\n");
}

export function buildFrontmatter({ name, headline, company, role, linkedinUrl, firstContactDate, lastResearchDate }) {
  return [
    "---",
    `name: ${yamlSafeScalar(name)}`,
    `headline: ${yamlSafeScalar(headline)}`,
    `company: ${yamlSafeScalar(company)}`,
    `role: ${yamlSafeScalar(role)}`,
    `linkedin_url: ${yamlSafeScalar(linkedinUrl)}`,
    `first_contact_date: ${firstContactDate ?? ""}`,
    `last_research_date: ${lastResearchDate ?? ""}`,
    "tags: [crm, outreach]",
    "---",
    "",
  ].join("\n");
}

export function buildResearchLogEntry({ date, report }) {
  const lines = [`### ${date}`, sanitizeBlock(report.summary), "", "**Connection points:**"];
  for (const cp of report.connection_points) {
    const basis = BASIS_VALUES.includes(cp.basis) ? cp.basis : "inferred";
    lines.push(`- ${sanitizeInline(cp.claim)} _(source: ${basis})_`);
  }
  lines.push("", "**Talking points:**");
  for (const tp of report.talking_points) {
    lines.push(`- ${sanitizeInline(tp)}`);
  }
  if (report.grounding_notes) {
    lines.push("", `_Grounding notes: ${sanitizeInline(report.grounding_notes)}_`);
  }
  return lines.join("\n");
}

export function buildDraftAppendix({ date, variants }) {
  const lines = [`### Drafts — ${date}`];
  for (const v of variants) {
    lines.push(`**${sanitizeInline(v.label)}:**`, sanitizeBlock(v.body), "");
  }
  return lines.join("\n").trimEnd();
}

export function notePathFor(vaultFolderScope, name) {
  return `${vaultFolderScope}/${sanitizeFilename(name)}.md`;
}
