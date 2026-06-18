const FIELDS = ["anthropicApiKey", "tavilyApiKey", "obsidianApiKey", "obsidianPort", "vaultFolderScope", "defaultMode"];

async function load() {
  const stored = await chrome.storage.local.get(FIELDS);
  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (stored[field] !== undefined) el.value = stored[field];
  }
}

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = {};
  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (field === "obsidianPort") {
      const port = Number(el.value);
      values[field] = Number.isInteger(port) && port > 0 ? port : 27123;
    } else {
      values[field] = el.value;
    }
  }
  await chrome.storage.local.set(values);
  const status = document.getElementById("status");
  status.textContent = "Saved.";
  setTimeout(() => (status.textContent = ""), 2000);
});

load();
