// PasteIt Browser Extension - Popup Script
const contentEl = document.getElementById("content");
const languageEl = document.getElementById("language");
const pasteBtn = document.getElementById("paste");
const resultEl = document.getElementById("result");
const linkEl = document.getElementById("link");
const serverUrlEl = document.getElementById("serverUrl");
const apiKeyEl = document.getElementById("apiKey");
const saveConfigBtn = document.getElementById("saveConfig");

// Load config
chrome.storage.sync.get(["serverUrl", "apiKey"], (config) => {
  serverUrlEl.value = config.serverUrl || "http://localhost:5174";
  apiKeyEl.value = config.apiKey || "";
});

// Save config
saveConfigBtn.addEventListener("click", () => {
  chrome.storage.sync.set({
    serverUrl: serverUrlEl.value.replace(/\/$/, ""),
    apiKey: apiKeyEl.value,
  });
  saveConfigBtn.textContent = "Saved!";
  setTimeout(() => { saveConfigBtn.textContent = "Save Config"; }, 1500);
});

// Get selection from current tab
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.id) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getSelection" }, (response) => {
      if (response?.selection) {
        contentEl.value = response.selection;
      }
    });
  }
});

// Create paste
pasteBtn.addEventListener("click", async () => {
  const content = contentEl.value.trim();
  if (!content) return;

  const server = serverUrlEl.value.replace(/\/$/, "") || "http://localhost:5174";
  const apiKey = apiKeyEl.value;

  pasteBtn.textContent = "Creating...";
  pasteBtn.disabled = true;
  resultEl.style.display = "none";

  try {
    const res = await fetch(`${server}/api/pastes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify({
        content,
        language: languageEl.value,
      }),
    });

    if (!res.ok) throw new Error("Failed to create paste");

    const data = await res.json();
    const url = `${server}/${data.id}`;

    linkEl.href = url;
    linkEl.textContent = url;
    resultEl.className = "result";
    resultEl.style.display = "block";
    linkEl.select();
  } catch (err) {
    resultEl.className = "result error";
    resultEl.style.display = "block";
    linkEl.textContent = `Error: ${err.message}`;
    linkEl.href = "#";
  } finally {
    pasteBtn.textContent = "Create Paste";
    pasteBtn.disabled = false;
  }
});
