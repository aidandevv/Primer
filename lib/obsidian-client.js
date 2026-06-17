// Distinguishes "plugin not running" (connection refused) from "cert not
// trusted yet" from "wrong key" per Primer_Implementation_Spec.md Section 7.1
// implementation note. Both connection-refused and untrusted-cert surface as
// a TypeError from fetch() with no usable detail — fetch() in a service
// worker cannot tell them apart, so both map to the same kind and the error
// message below names both possibilities for the user to check.
export class ObsidianError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind; // "unreachable_or_untrusted_cert" | "unauthorized" | "unknown"
  }
}

export function classifyFetchError(err, response) {
  if (response) {
    if (response.status === 401) return "unauthorized";
    return "unknown";
  }
  if (err instanceof TypeError) {
    return "unreachable_or_untrusted_cert";
  }
  return "unknown";
}

function baseUrl(port) {
  return `https://127.0.0.1:${port}`;
}

async function request({ port, apiKey, path, method, headers, body }) {
  let res;
  try {
    res = await fetch(`${baseUrl(port)}${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...headers },
      body,
    });
  } catch (err) {
    throw new ObsidianError(
      "Could not reach the Obsidian Local REST API. Confirm Obsidian is running, the Local REST API plugin is enabled, and you've trusted its certificate at https://127.0.0.1:27124/.",
      classifyFetchError(err, null),
    );
  }
  if (!res.ok) {
    const kind = classifyFetchError(null, res);
    const message =
      kind === "unauthorized"
        ? "Obsidian rejected the request: the API key is wrong."
        : `Obsidian API error: ${res.status}`;
    throw new ObsidianError(message, kind);
  }
  return res;
}

export async function searchVault({ port, apiKey, query }) {
  const res = await request({
    port,
    apiKey,
    path: "/search/",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

export async function readNote({ port, apiKey, path }) {
  const res = await request({ port, apiKey, path: `/vault/${path}`, method: "GET" });
  return res.text();
}

export async function createOrOverwriteNote({ port, apiKey, path, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PUT",
    headers: { "content-type": "text/markdown" },
    body: content,
  });
}

export async function appendToNote({ port, apiKey, path, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "POST",
    headers: { "content-type": "text/markdown" },
    body: content,
  });
}

export async function appendUnderHeading({ port, apiKey, path, heading, content }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PATCH",
    headers: {
      "content-type": "text/markdown",
      Operation: "append",
      "Target-Type": "heading",
      Target: heading,
    },
    body: content,
  });
}

export async function patchFrontmatterField({ port, apiKey, path, field, value }) {
  await request({
    port,
    apiKey,
    path: `/vault/${path}`,
    method: "PATCH",
    headers: {
      "content-type": "text/markdown",
      Operation: "replace",
      "Target-Type": "frontmatter",
      Target: field,
    },
    body: value,
  });
}
