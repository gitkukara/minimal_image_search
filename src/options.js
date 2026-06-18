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
  saveButton: document.querySelector("#saveButton"),
  selectAllButton: document.querySelector("#selectAllButton"),
  status: document.querySelector("#status")
};

let visibleEngineIds = ENGINES.map((engine) => engine.id);

elements.saveButton.addEventListener("click", saveSettings);
elements.selectAllButton.addEventListener("click", () => {
  visibleEngineIds = ENGINES.map((engine) => engine.id);
  render();
});

restoreSettings();

async function restoreSettings() {
  const stored = await chrome.storage.local.get("visibleEngineIds");
  if (Array.isArray(stored.visibleEngineIds) && stored.visibleEngineIds.length > 0) {
    visibleEngineIds = stored.visibleEngineIds.filter((id) => ENGINES.some((engine) => engine.id === id));
  }
  render();
}

function render() {
  elements.engineList.textContent = "";

  for (const engine of ENGINES) {
    const row = document.createElement("label");
    const checkbox = document.createElement("input");

    row.className = "engine-row";
    checkbox.type = "checkbox";
    checkbox.value = engine.id;
    checkbox.checked = visibleEngineIds.includes(engine.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        visibleEngineIds = [...new Set([...visibleEngineIds, engine.id])];
      } else {
        visibleEngineIds = visibleEngineIds.filter((id) => id !== engine.id);
      }
    });

    row.append(engine.name, checkbox);
    elements.engineList.append(row);
  }
}

async function saveSettings() {
  if (visibleEngineIds.length === 0) {
    elements.status.textContent = "至少保留一个搜索引擎。";
    return;
  }

  const stored = await chrome.storage.local.get("selectedEngineIds");
  const selectedEngineIds = Array.isArray(stored.selectedEngineIds)
    ? stored.selectedEngineIds.filter((id) => visibleEngineIds.includes(id))
    : [];

  await chrome.storage.local.set({
    visibleEngineIds,
    selectedEngineIds:
      selectedEngineIds.length > 0
        ? selectedEngineIds
        : visibleEngineIds.includes("google")
          ? ["google"]
          : [visibleEngineIds[0]]
  });

  elements.status.textContent = "已保存。";
}
