const SEARCH_ENGINES = {
  google: {
    name: "Google",
    mode: "page",
    uploadPageUrl: "https://images.google.com/imghp?hl=en"
  },
  baidu: {
    name: "Baidu",
    mode: "page",
    uploadPageUrl: "https://graph.baidu.com/pcpage/index?tpl_from=pc"
  },
  yandex: {
    name: "Yandex",
    mode: "page",
    uploadPageUrl: "https://yandex.com/images/"
  },
  tineye: {
    name: "TinEye",
    mode: "page",
    uploadPageUrl: "https://tineye.com/"
  },
  getty: {
    name: "Getty Images",
    mode: "page",
    uploadPageUrl: "https://www.gettyimages.com/"
  },
  pinterest: {
    name: "Pinterest",
    mode: "page",
    uploadPageUrl: "https://www.pinterest.com/"
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

  if (message?.type === "SEARCH_IMAGES") {
    searchImages(message)
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

  if (engine.mode === "page") {
    await openEnginePageAndAttachImage(engine, message.dataUrl, message.fileName);
  } else {
    await openUploadPageAndAttachImage(
      engine.uploadPageUrl,
      message.dataUrl,
      message.fileName,
      message.engineId || "google"
    );
  }

  return { ok: true, message: `${engine.name} image search opened.` };
}

async function searchImages(message) {
  const engineIds = normalizeEngineIds(message.engineIds);
  const results = await Promise.allSettled(
    engineIds.map((engineId) =>
      searchImage({
        engineId,
        dataUrl: message.dataUrl,
        fileName: message.fileName
      })
    )
  );
  const rejected = results.filter((result) => result.status === "rejected");

  if (rejected.length === results.length) {
    throw new Error("所有搜索引擎都启动失败。");
  }

  return {
    ok: true,
    launched: results.length - rejected.length,
    failed: rejected.length
  };
}

function normalizeEngineIds(engineIds) {
  const ids = Array.isArray(engineIds) ? engineIds : ["google"];
  const supported = ids.filter((engineId) => SEARCH_ENGINES[engineId]);
  return supported.length > 0 ? [...new Set(supported)] : ["google"];
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

  await searchImages({
    engineIds: message.engineIds || [message.engineId || "google"],
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

async function openEnginePageAndAttachImage(engine, dataUrl, fileName) {
  const tab = await chrome.tabs.create({
    url: engine.uploadPageUrl,
    active: true
  });

  if (!tab.id) {
    throw new Error(`无法打开 ${engine.name}。`);
  }

  await waitForTabReady(tab.id);

  const maximumAttempts = engine.name === "TinEye" ? 4 : 1;
  let attached = false;

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const injections = await injectImageIntoTab(
      tab.id,
      dataUrl,
      fileName || "image.png",
      engine.name
    );

    if (injections.some((item) => item.result?.ok)) {
      attached = true;
      break;
    }

    if (attempt < maximumAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (!attached) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: showManualUploadHint,
      args: [engine.name]
    });
  }
}

async function injectImageIntoTab(tabId, dataUrl, fileName, engineName) {
  const args = [dataUrl, fileName, engineName];

  try {
    return await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: attachImageToSearchPage,
      args
    });
  } catch (error) {
    try {
      return await chrome.scripting.executeScript({
        target: { tabId },
        func: attachImageToSearchPage,
        args
      });
    } catch (retryError) {
      return [];
    }
  }
}

async function waitForTabReady(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab?.status === "complete") {
    return;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("搜索页面加载超时。"));
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

async function attachImageToSearchPage(dataUrl, fileName, engineName) {
  const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
  const isGoogle = engineName === "Google";
  const initialFileInputs = new Set(document.querySelectorAll("input[type='file']"));
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
  const findFileInput = () => {
    const inputs = [...document.querySelectorAll("input[type='file']")];
    if (isGoogle) {
      const lensInputs = inputs.filter(
        (input) => input.closest("[role='dialog']") || !initialFileInputs.has(input)
      );
      return lensInputs.find((input) => (input.getAttribute("accept") || "").includes("image")) || lensInputs[0];
    }

    return (
      inputs.find((input) => {
        const accept = input.getAttribute("accept") || "";
        return accept.includes("image") || accept === "" || input.name?.toLowerCase().includes("image");
      }) || inputs[0]
    );
  };
  const file = dataUrlToFile(dataUrl, fileName);

  const clickCandidate = () => {
    if (isGoogle) {
      const target = document.querySelector(
        [
          "[aria-label='Search by image']",
          "[aria-label*='Search by image' i]",
          "[title='Search by image']",
          "[title*='Search by image' i]"
        ].join(",")
      );

      if (target) {
        target.click();
        return true;
      }

      return false;
    }

    const keywords = [
      "search by image",
      "image search",
      "visual search",
      "upload",
      "camera",
      "photo",
      "以图",
      "识图",
      "图片",
      "上传",
      "поиск по картинке",
      "картин"
    ];
    const selectors = [
      "button",
      "a",
      "label",
      "[role='button']",
      "[aria-label]",
      "[title]",
      "[class*='camera' i]",
      "[class*='upload' i]",
      "[class*='image' i]",
      "[class*='visual' i]",
      "[class*='lens' i]"
    ];
    const candidates = [...document.querySelectorAll(selectors.join(","))];

    const target = candidates.find((element) => {
      const text = [
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("class")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return keywords.some((keyword) => text.includes(keyword));
    });

    if (target) {
      target.click();
      return true;
    }

    return false;
  };

  for (let attempt = 0; attempt < 35; attempt += 1) {
    const input = findFileInput();
    if (input) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    }

    clickCandidate();
    await sleep(300);
  }

  return { ok: false, engineName };
}

function showManualUploadHint(engineName) {
  const existing = document.querySelector("[data-mis-upload-hint='true']");
  if (existing) {
    existing.remove();
  }

  const hint = document.createElement("div");
  hint.dataset.misUploadHint = "true";
  hint.textContent = `${engineName} 未找到可自动上传入口，请在本页手动上传图片。`;
  hint.style.cssText = [
    "position:fixed",
    "top:16px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "max-width:min(520px,calc(100vw - 32px))",
    "padding:10px 14px",
    "border-radius:8px",
    "background:#171717",
    "color:#fff",
    "font:13px system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "box-shadow:0 10px 30px rgba(0,0,0,.22)"
  ].join(";");

  document.documentElement.append(hint);
  setTimeout(() => hint.remove(), 7000);
}
