// Distinguishes "plugin not running" (connection refused) from "wrong key"
// per Primer_Implementation_Spec.md Section 7.1 implementation note.
// Connection-refused surfaces as a TypeError from fetch() with no usable
// detail. Primer talks to Obsidian over plain HTTP on 127.0.0.1 rather than
// the plugin's self-signed HTTPS port: Chrome treats loopback addresses as a
// secure context regardless of scheme, and a self-signed cert's trust
// exception (added by clicking through a tab's warning) does not propagate
// to the extension's service worker, which made HTTPS unusable in practice.
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
  return `http://127.0.0.1:${port}`;
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
      "Could not reach the Obsidian Local REST API. Confirm Obsidian is running, the Local REST API plugin is enabled, and its non-encrypted (HTTP) server is turned on, and that the port in Primer's options matches the plugin's HTTP port (default 27123).",
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
    path: `/search/simple/?query=${encodeURIComponent(query)}`,
    method: "POST",
  });
  const results = await res.json();
  return results.map((r) => ({ ...r, path: r.filename }));
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
