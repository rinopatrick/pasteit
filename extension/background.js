// PasteIt Browser Extension - Background Script
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "pasteit-selection",
    title: "Paste selection to PasteIt",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pasteit-selection" && info.selectionText) {
    chrome.storage.sync.get(["serverUrl", "apiKey"], (config) => {
      const server = config.serverUrl || "http://localhost:5174";
      const apiKey = config.apiKey || "";

      fetch(`${server}/api/pastes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
        },
        body: JSON.stringify({
          content: info.selectionText,
          language: "text",
          title: `Selection from ${tab?.title || "unknown"}`,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          const pasteUrl = `${server}/${data.id}`;
          chrome.tabs.create({ url: pasteUrl });
        })
        .catch((err) => {
          console.error("PasteIt: Failed to create paste", err);
        });
    });
  }
});
