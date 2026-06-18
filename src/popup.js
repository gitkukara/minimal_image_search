const ENGINES = [
  { id: "google", name: "Google" },
  { id: "baidu", name: "百度" },
  { id: "yandex", name: "Yandex" },
  { id: "tineye", name: "TinEye" },
  { id: "getty", name: "Getty" },
  { id: "pinterest", name: "Pinterest" }
];

const elements = {
  engineList: document.querySelector("#engineList"),
  fileInput: document.querySelector("#fileInput"),
  pasteButton: document.querySelector("#pasteButton"),
  screenshotButton: document.querySelector("#screenshotButton"),
  selectAllButton: document.querySelector("#selectAllButton"),
  settingsButton: document.querySelector("#settingsButton"),
  status: document.querySelector("#status"),
  uploadButton: document.querySelector("#uploadButton")
};

const extensionApi = getExtensionApi();

let visibleEngineIds = ENGINES.map((engine) => engine.id);
let selectedEngineIds = ["google"];

elements.uploadButton.addEventListener("click", () => elements.fileInput.click());
elements.pasteButton.addEventListener("click", pasteFromClipboard);
elements.screenshotButton.addEventListener("click", selectScreenshotArea);
elements.selectAllButton.addEventListener("click", selectAllVisibleEngines);
elements.settingsButton.addEventListener("click", () => extensionApi.runtime.openOptionsPage());

elements.fileInput.addEventListener("change", async () => {
  const [file] = elements.fileInput.files;
  elements.fileInput.value = "";
  if (file) {
    await useFile(file);
  }
});

restoreEngineState();

async function restoreEngineState() {
  const stored = await extensionApi.storage.local.get(["visibleEngineIds", "selectedEngineIds"]);
  visibleEngineIds = normalizeVisibleEngines(stored.visibleEngineIds);
  selectedEngineIds = normalizeSelectedEngines(stored.selectedEngineIds, visibleEngineIds);
  renderEngineList();
}

function normalizeVisibleEngines(value) {
  const ids = Array.isArray(value) ? value.filter((id) => ENGINES.some((engine) => engine.id === id)) : [];
  return ids.length > 0 ? ids : ENGINES.map((engine) => engine.id);
}

function normalizeSelectedEngines(value, visibleIds) {
  const ids = Array.isArray(value) ? value.filter((id) => visibleIds.includes(id)) : [];
  if (ids.length > 0) {
    return ids;
  }

  return visibleIds.includes("google") ? ["google"] : [visibleIds[0]];
}

function renderEngineList() {
  elements.engineList.textContent = "";

  for (const engine of ENGINES.filter((item) => visibleEngineIds.includes(item.id))) {
    const chip = document.createElement("label");
    const checkbox = document.createElement("input");
    const selected = selectedEngineIds.includes(engine.id);

    chip.className = `engine-chip${selected ? " is-selected" : ""}`;
    checkbox.type = "checkbox";
    checkbox.checked = selected;
    checkbox.value = engine.id;
    chip.append(checkbox, engine.name);

    checkbox.addEventListener("change", () => toggleEngine(engine.id, checkbox.checked));
    elements.engineList.append(chip);
  }

  elements.selectAllButton.textContent =
    selectedEngineIds.length === visibleEngineIds.length ? "取消全选" : "全选";
}

async function toggleEngine(engineId, checked) {
  if (checked) {
    selectedEngineIds = [...new Set([...selectedEngineIds, engineId])];
  } else if (selectedEngineIds.length > 1) {
    selectedEngineIds = selectedEngineIds.filter((id) => id !== engineId);
  }

  await saveSelectedEngines();
  renderEngineList();
}

async function selectAllVisibleEngines() {
  selectedEngineIds =
    selectedEngineIds.length === visibleEngineIds.length
      ? visibleEngineIds.includes("google")
        ? ["google"]
        : [visibleEngineIds[0]]
      : [...visibleEngineIds];
  await saveSelectedEngines();
  renderEngineList();
}

function saveSelectedEngines() {
  return extensionApi.storage.local.set({ selectedEngineIds });
}

async function useFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件。");
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  await searchWithSelectedEngines(dataUrl, file.name || "image.png");
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

  const response = await extensionApi.runtime.sendMessage({
    type: "SELECT_SCREENSHOT_AREA",
    engineIds: selectedEngineIds
  });

  if (!response?.ok) {
    setStatus(response?.error || "截图取消或失败。");
    return;
  }

  setStatus(`已提交到 ${selectedEngineIds.length} 个搜索引擎。`);
}

async function searchWithSelectedEngines(dataUrl, fileName) {
  setStatus(`正在打开 ${selectedEngineIds.length} 个搜索引擎...`);

  const response = await extensionApi.runtime.sendMessage({
    type: "SEARCH_IMAGES",
    engineIds: selectedEngineIds,
    dataUrl,
    fileName
  });

  if (!response?.ok) {
    setStatus(response?.error || "搜索失败。");
    return;
  }

  setStatus(`已提交到 ${selectedEngineIds.length} 个搜索引擎。`);
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

function getExtensionApi() {
  if (globalThis.chrome?.runtime?.id && globalThis.chrome?.storage?.local) {
    return globalThis.chrome;
  }

  return createPreviewApi();
}

function createPreviewApi() {
  const storageKey = "minimalImageSearchPreviewState";
  document.documentElement.dataset.preview = "true";

  return {
    runtime: {
      openOptionsPage() {
        setStatus("预览模式：设置页只在扩展中打开。");
      },
      async sendMessage(message) {
        console.info("Preview extension message", message);
        return { ok: true, preview: true };
      }
    },
    storage: {
      local: {
        async get(keys) {
          const state = readPreviewState();
          if (!Array.isArray(keys)) {
            return state;
          }

          return Object.fromEntries(keys.map((key) => [key, state[key]]));
        },
        async set(values) {
          localStorage.setItem(storageKey, JSON.stringify({ ...readPreviewState(), ...values }));
        }
      }
    }
  };

  function readPreviewState() {
    try {
      return JSON.parse(localStorage.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  }
}
