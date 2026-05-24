// PasteIt Browser Extension - Content Script
// This script runs on all pages and provides the selection-to-paste functionality

console.log("PasteIt extension loaded");

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    const selection = window.getSelection()?.toString() || "";
    sendResponse({ selection });
  }
  return true;
});
