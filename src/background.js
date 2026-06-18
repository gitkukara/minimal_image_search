const SEARCH_ENGINES = {
  google: {
    name: "Google",
    uploadPageUrl: "src/search.html"
  },
  baidu: {
    name: "Baidu",
    uploadPageUrl: "src/search.html"
  },
  yandex: {
    name: "Yandex",
    uploadPageUrl: "src/search.html"
  },
  tineye: {
    name: "TinEye",
    uploadPageUrl: "src/search.html"
  },
  getty: {
    name: "Getty Images",
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

  if (message?.type === "SELECT_SCREENSHOT_AREA") {
    selectScreenshotArea(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Screenshot selection failed."
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

  await openUploadPageAndAttachImage(
    engine.uploadPageUrl,
    message.dataUrl,
    message.fileName,
    message.engineId || "google"
  );
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

async function selectScreenshotArea(message) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id || !activeTab.windowId) {
    throw new Error("没有可截图的当前标签页。");
  }

  const [selection] = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: runScreenshotSelector
  });

  const rect = selection?.result;
  if (!rect || rect.cancelled) {
    throw new Error("截图已取消。");
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(activeTab.windowId, {
    format: "png"
  });
  const croppedDataUrl = await cropImageDataUrl(dataUrl, rect);

  await searchImage({
    engineId: message.engineId,
    dataUrl: croppedDataUrl,
    fileName: "screenshot-selection.png"
  });

  return { ok: true };
}

async function openUploadPageAndAttachImage(url, dataUrl, fileName, engineId) {
  const searchId = crypto.randomUUID();
  await chrome.storage.session.set({
    [searchId]: {
      dataUrl,
      engineId,
      fileName: fileName || "image.png",
      createdAt: Date.now()
    }
  });

  await chrome.tabs.create({
    url: chrome.runtime.getURL(`${url}?id=${encodeURIComponent(searchId)}`),
    active: true
  });
}

async function cropImageDataUrl(dataUrl, rect) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = rect.devicePixelRatio || 1;
  const sourceX = Math.max(0, Math.round(rect.x * scale));
  const sourceY = Math.max(0, Math.round(rect.y * scale));
  const sourceWidth = Math.min(bitmap.width - sourceX, Math.round(rect.width * scale));
  const sourceHeight = Math.min(bitmap.height - sourceY, Math.round(rect.height * scale));
  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d");

  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  const croppedBlob = await canvas.convertToBlob({ type: "image/png" });
  return blobToDataUrl(croppedBlob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function runScreenshotSelector() {
  return new Promise((resolve) => {
    const previous = document.querySelector("[data-mis-selector-overlay='true']");
    if (previous) {
      previous.remove();
    }

    const overlay = document.createElement("div");
    const shade = document.createElement("div");
    const box = document.createElement("div");
    const hint = document.createElement("div");
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let dragging = false;
    let resolved = false;

    overlay.dataset.misSelectorOverlay = "true";
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "cursor:crosshair",
      "user-select:none"
    ].join(";");
    shade.style.cssText = [
      "position:absolute",
      "inset:0",
      "background:rgba(17,17,17,.34)"
    ].join(";");
    box.style.cssText = [
      "position:absolute",
      "display:none",
      "border:2px solid #ffffff",
      "background:rgba(61,114,201,.12)",
      "box-shadow:0 0 0 9999px rgba(17,17,17,.34),0 10px 30px rgba(0,0,0,.24)"
    ].join(";");
    hint.textContent = "拖拽选择截图区域，Esc 取消";
    hint.style.cssText = [
      "position:absolute",
      "top:20px",
      "left:50%",
      "transform:translateX(-50%)",
      "padding:9px 13px",
      "border-radius:8px",
      "background:#ffffff",
      "color:#171717",
      "font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "box-shadow:0 8px 24px rgba(0,0,0,.18)",
      "pointer-events:none"
    ].join(";");

    overlay.append(shade, box, hint);
    document.documentElement.append(overlay);

    const cleanup = () => {
      overlay.remove();
      window.removeEventListener("keydown", onKeyDown, true);
    };

    const finish = (result) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      resolve(result);
    };

    const drawBox = () => {
      const left = Math.min(startX, currentX);
      const top = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      box.style.display = "block";
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish({ cancelled: true });
      }
    };

    overlay.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      currentX = event.clientX;
      currentY = event.clientY;
      overlay.setPointerCapture(event.pointerId);
      drawBox();
    });

    overlay.addEventListener("pointermove", (event) => {
      if (!dragging) {
        return;
      }
      currentX = event.clientX;
      currentY = event.clientY;
      drawBox();
    });

    overlay.addEventListener("pointerup", (event) => {
      if (!dragging) {
        return;
      }
      dragging = false;
      currentX = event.clientX;
      currentY = event.clientY;

      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const width = Math.abs(currentX - startX);
      const height = Math.abs(currentY - startY);

      if (width < 8 || height < 8) {
        finish({ cancelled: true });
        return;
      }

      finish({
        x,
        y,
        width,
        height,
        devicePixelRatio: window.devicePixelRatio || 1
      });
    });

    window.addEventListener("keydown", onKeyDown, true);
  });
}
