const statusElement = document.querySelector("#status");
const titleElement = document.querySelector("#title");
const form = document.querySelector("#searchForm");
const imageInput = document.querySelector("#imageInput");
const filenameInput = document.querySelector("#filenameInput");
const openEngineButton = document.querySelector("#openEngineButton");

const SEARCH_ENGINES = {
  google: {
    name: "Google",
    mode: "form",
    uploadUrl: "https://www.google.com/searchbyimage/upload?hl=zh-CN"
  },
  baidu: {
    name: "Baidu",
    mode: "clipboard",
    uploadUrl: "https://graph.baidu.com/pcpage/index?tpl_from=pc"
  },
  yandex: {
    name: "Yandex",
    mode: "clipboard",
    uploadUrl: "https://yandex.com/images/"
  },
  tineye: {
    name: "TinEye",
    mode: "clipboard",
    uploadUrl: "https://tineye.com/"
  },
  getty: {
    name: "Getty Images",
    mode: "clipboard",
    uploadUrl: "https://www.gettyimages.com/"
  }
};

startSearch();

async function startSearch() {
  const searchId = new URLSearchParams(location.search).get("id");
  if (!searchId) {
    setStatus("没有找到图片。请回到插件重新选择。");
    return;
  }

  const stored = await chrome.storage.session.get(searchId);
  const payload = stored[searchId];
  await chrome.storage.session.remove(searchId);

  if (!payload?.dataUrl) {
    setStatus("图片已过期。请回到插件重新选择。");
    return;
  }

  const engine = SEARCH_ENGINES[payload.engineId || "google"] || SEARCH_ENGINES.google;
  titleElement.textContent = `正在交给 ${engine.name}`;

  const file = dataUrlToFile(payload.dataUrl, payload.fileName || "image.png");
  if (engine.mode === "clipboard") {
    await openClipboardEngine(engine, file);
    return;
  }

  setStatus("正在上传图片...");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  imageInput.files = transfer.files;
  filenameInput.value = file.name;
  form.action = engine.uploadUrl;

  requestAnimationFrame(() => {
    form.submit();
  });
}

async function openClipboardEngine(engine, file) {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [file.type || "image/png"]: file
      })
    ]);
    setStatus("图片已复制。请在打开的页面粘贴或选择上传入口。");
  } catch (error) {
    setStatus("无法自动复制图片。请在打开的页面手动上传。");
  }

  openEngineButton.hidden = false;
  openEngineButton.textContent = `打开 ${engine.name}`;
  openEngineButton.addEventListener("click", () => {
    location.href = engine.uploadUrl;
  });

  setTimeout(() => {
    location.href = engine.uploadUrl;
  }, 700);
}

function dataUrlToFile(dataUrl, fileName) {
  const [metadata, base64Data] = dataUrl.split(",");
  const mimeMatch = metadata.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || "image/png";
  const bytes = atob(base64Data);
  const buffer = new Uint8Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    buffer[index] = bytes.charCodeAt(index);
  }

  return new File([buffer], fileName, { type: mimeType });
}

function setStatus(message) {
  statusElement.textContent = message;
}
