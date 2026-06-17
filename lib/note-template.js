export function sanitizeFilename(name) {
  return name
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFrontmatter({ name, headline, company, role, linkedinUrl, firstContactDate, lastResearchDate }) {
  return [
    "---",
    `name: ${name ?? ""}`,
    `headline: ${headline ?? ""}`,
    `company: ${company ?? ""}`,
    `role: ${role ?? ""}`,
    `linkedin_url: ${linkedinUrl ?? ""}`,
    `first_contact_date: ${firstContactDate ?? ""}`,
    `last_research_date: ${lastResearchDate ?? ""}`,
    "tags: [crm, outreach]",
    "---",
    "",
  ].join("\n");
}

export function buildResearchLogEntry({ date, report }) {
  const lines = [`### ${date}`, report.summary, "", "**Connection points:**"];
  for (const cp of report.connection_points) {
    lines.push(`- ${cp.claim} _(source: ${cp.basis})_`);
  }
  lines.push("", "**Talking points:**");
  for (const tp of report.talking_points) {
    lines.push(`- ${tp}`);
  }
  if (report.grounding_notes) {
    lines.push("", `_Grounding notes: ${report.grounding_notes}_`);
  }
  return lines.join("\n");
}

export function buildDraftAppendix({ date, variants }) {
  const lines = [`### Drafts — ${date}`];
  for (const v of variants) {
    lines.push(`**${v.label}:**`, v.body, "");
  }
  return lines.join("\n").trimEnd();
}

export function notePathFor(vaultFolderScope, name) {
  return `${vaultFolderScope}/${sanitizeFilename(name)}.md`;
}
