const elements = {
  dropzone: document.querySelector("#dropzone"),
  defaultActionSelect: document.querySelector("#defaultActionSelect"),
  engineSelect: document.querySelector("#engineSelect"),
  fileInput: document.querySelector("#fileInput"),
  pasteButton: document.querySelector("#pasteButton"),
  previewImage: document.querySelector("#previewImage"),
  previewText: document.querySelector("#previewText"),
  screenshotButton: document.querySelector("#screenshotButton"),
  searchButton: document.querySelector("#searchButton"),
  status: document.querySelector("#status"),
  uploadButton: document.querySelector("#uploadButton")
};

let selectedImage = null;

elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.dropzone.addEventListener("click", (event) => {
  if (event.target === elements.defaultActionSelect) {
    return;
  }

  runDefaultAction();
});
elements.dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    runDefaultAction();
  }
});
elements.defaultActionSelect.addEventListener("click", (event) => event.stopPropagation());
elements.defaultActionSelect.addEventListener("change", () => {
  chrome.storage.local.set({ defaultDropzoneAction: elements.defaultActionSelect.value });
  updateDefaultActionText();
});

elements.fileInput.addEventListener("change", async () => {
  const [file] = elements.fileInput.files;
  if (file) {
    await useFile(file);
  }
});

elements.pasteButton.addEventListener("click", pasteFromClipboard);
elements.screenshotButton.addEventListener("click", selectScreenshotArea);
elements.searchButton.addEventListener("click", searchSelectedImage);

restoreDefaultAction();

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropzone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropzone.addEventListener(eventName, () => {
    elements.dropzone.classList.remove("is-dragging");
  });
}

elements.dropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
  if (!file) {
    setStatus("没有找到可用的图片。");
    return;
  }

  await useFile(file);
});

async function useFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件。");
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  useDataUrl(dataUrl, file.name || "image.png");
}

function useDataUrl(dataUrl, fileName) {
  selectedImage = { dataUrl, fileName };
  elements.previewImage.src = dataUrl;
  elements.dropzone.classList.add("has-image");
  elements.searchButton.disabled = false;
  setStatus("图片已就绪。");
}

async function pasteFromClipboard() {
  setStatus("正在读取剪贴板...");

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => type.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1] || "png";
        await useFile(new File([blob], `clipboard.${extension}`, { type: imageType }));
        return;
      }
    }

    setStatus("剪贴板里没有图片。");
  } catch (error) {
    setStatus("无法读取剪贴板，请确认浏览器已授予权限。");
  }
}

async function selectScreenshotArea() {
  setStatus("请在当前页面拖拽选择截图区域。");

  const response = await chrome.runtime.sendMessage({
    type: "SELECT_SCREENSHOT_AREA",
    engineId: elements.engineSelect.value
  });
  if (!response?.ok) {
    setStatus(response?.error || "截图取消或失败。");
    return;
  }

  setStatus("截图已提交搜索。");
}

async function searchSelectedImage() {
  if (!selectedImage) {
    return;
  }

  elements.searchButton.disabled = true;
  setStatus("正在打开搜索结果...");

  const response = await chrome.runtime.sendMessage({
    type: "SEARCH_IMAGE",
    engineId: elements.engineSelect.value,
    ...selectedImage
  });

  elements.searchButton.disabled = false;

  if (!response?.ok) {
    setStatus(response?.error || "搜索失败。");
    return;
  }

  setStatus("搜索结果已打开。");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function setStatus(message) {
  elements.status.textContent = message;
}

async function runDefaultAction() {
  const action = elements.defaultActionSelect.value;
  if (action === "paste") {
    await pasteFromClipboard();
    return;
  }

  if (action === "screenshot") {
    await selectScreenshotArea();
    return;
  }

  elements.fileInput.click();
}

async function restoreDefaultAction() {
  const stored = await chrome.storage.local.get("defaultDropzoneAction");
  if (stored.defaultDropzoneAction) {
    elements.defaultActionSelect.value = stored.defaultDropzoneAction;
  }

  updateDefaultActionText();
}

function updateDefaultActionText() {
  const labels = {
    upload: "点击大框上传图片",
    paste: "点击大框粘贴图片",
    screenshot: "点击大框选择截图区域"
  };

  if (!elements.dropzone.classList.contains("has-image")) {
    elements.previewText.textContent = labels[elements.defaultActionSelect.value] || labels.upload;
  }
}
