const SEARCH_ENGINES = {
  google: {
    name: "Google",
    uploadPageUrl: "https://images.google.com/"
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
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) {
    throw new Error("无法打开 Google 图片页。");
  }

  await waitForTabReady(tab.id);

  const injections = await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: true },
    func: attachImageToGoogleLens,
    args: [dataUrl, fileName || "image.png"]
  });

  if (!injections?.some((injection) => injection.result?.ok)) {
    throw new Error(
      "已在后台打开 Google 图片页，但没有找到可自动上传的入口。请切到该页面手动粘贴或上传图片。"
    );
  }

  await chrome.tabs.update(tab.id, { active: true });
}

async function waitForTabReady(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab?.status === "complete") {
    return;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Google 图片页加载超时。"));
    }, 15000);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function attachImageToGoogleLens(dataUrl, fileName) {
  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
  const dataUrlToFile = (sourceDataUrl, sourceFileName) => {
    const [metadata, base64Data] = sourceDataUrl.split(",");
    const mimeMatch = metadata.match(/^data:(.*?);base64$/);
    const mimeType = mimeMatch?.[1] || "image/png";
    const bytes = atob(base64Data);
    const buffer = new Uint8Array(bytes.length);

    for (let index = 0; index < bytes.length; index += 1) {
      buffer[index] = bytes.charCodeAt(index);
    }

    return new File([buffer], sourceFileName, { type: mimeType });
  };
  const file = dataUrlToFile(dataUrl, fileName);

  const buttonTextMatches = (element) => {
    const text = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return [
      "search by image",
      "google lens",
      "upload",
      "以图搜索",
      "按图片搜索",
      "上传"
    ].some((keyword) => text.includes(keyword));
  };

  const clickImageSearchEntry = () => {
    const candidates = [
      ...document.querySelectorAll("button, a, div[role='button'], span[role='button']")
    ];
    const target = candidates.find(buttonTextMatches);
    if (target) {
      target.click();
      return true;
    }
    return false;
  };

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const input = document.querySelector("input[type='file']");
    if (input) {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }

    clickImageSearchEntry();
    await sleep(300);
  }

  return { ok: false };
}
