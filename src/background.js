const SEARCH_ENGINES = {
  google: {
    name: "Google",
    uploadPageUrl: "src/search.html"
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SEARCH_IMAGE") {
    searchImage(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Image search failed."
        });
      });
    return true;
  }

  if (message?.type === "CAPTURE_VISIBLE_TAB") {
    captureVisibleTab()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Screenshot failed."
        });
      });
    return true;
  }

  return false;
});

async function searchImage(message) {
  const engine = SEARCH_ENGINES[message.engineId || "google"];
  if (!engine) {
    throw new Error("Unsupported search engine.");
  }

  await openUploadPageAndAttachImage(engine.uploadPageUrl, message.dataUrl, message.fileName);
  return { ok: true, message: `${engine.name} image search opened.` };
}

async function captureVisibleTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.windowId) {
    throw new Error("No active tab is available.");
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
    format: "png"
  });

  return { ok: true, dataUrl, fileName: "screenshot.png" };
}

async function openUploadPageAndAttachImage(url, dataUrl, fileName) {
  const searchId = crypto.randomUUID();
  await chrome.storage.session.set({
    [searchId]: {
      dataUrl,
      fileName: fileName || "image.png",
      createdAt: Date.now()
    }
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL(`${url}?id=${encodeURIComponent(searchId)}`),
    active: true
  });
}
