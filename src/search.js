const statusElement = document.querySelector("#status");
const form = document.querySelector("#searchForm");
const imageInput = document.querySelector("#imageInput");
const filenameInput = document.querySelector("#filenameInput");

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

  setStatus("正在上传图片...");

  const file = dataUrlToFile(payload.dataUrl, payload.fileName || "image.png");
  const transfer = new DataTransfer();
  transfer.items.add(file);
  imageInput.files = transfer.files;
  filenameInput.value = file.name;

  requestAnimationFrame(() => {
    form.submit();
  });
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
