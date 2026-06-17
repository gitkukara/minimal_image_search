# Minimal Image Search

一款极简的 Chrome / Edge 浏览器插件，用于从插件按钮快速发起以图搜索。当前默认使用 Google，搜索入口支持上传图片、粘贴剪贴板图片、截取当前标签页可见区域。

## 使用方式

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启开发者模式。
3. 选择“加载已解压的扩展”。
4. 选择 `F:\image-search-extension`。
5. 点击工具栏里的插件图标，选择图片来源后开始搜索。

## 功能

- 上传本地图片。
- 读取剪贴板中的图片。
- 截取当前标签页可见区域。
- 默认使用 Google 以图搜索，三个入口会统一进入自动上传流程。
- 搜索引擎配置集中在 `src/background.js` 的 `SEARCH_ENGINES`，后续可继续添加其他引擎。

## 注意

如果已经加载过旧版本，请在扩展管理页点击“重新加载”。`0.1.2` 起不再注入 Google Images 首页，而是打开扩展自己的中转页，并用真实图片表单自动提交到 Google 搜索结果页。

## 文件结构

```text
F:\image-search-extension
├── manifest.json
├── README.md
└── src
    ├── background.js
    ├── popup.css
    ├── popup.html
    ├── popup.js
    ├── search.css
    ├── search.html
    └── search.js
```

## 后续扩展方向

- 添加 Bing Visual Search、Yandex Images 等搜索引擎。
- 增加截图区域选择，而不只是当前可见页面。
- 添加右键菜单，对网页图片直接发起搜索。
- 记住上一次使用的搜索引擎。
