# Minimal Image Search

A minimal Chrome / Edge extension for searching the web by image. It supports local image upload, clipboard images, and selecting an area from the current page.

## Features

- Search by uploading a local image.
- Search from an image copied to the clipboard.
- Drag to select a screenshot area on the current page.
- Choose the default action for the main drop area.
- Uses Google image search by default.

## Install

1. Download or clone this repository.
2. Open the extensions page in Chrome or Edge.
3. Enable developer mode.
4. Choose **Load unpacked**.
5. Select the project folder that contains `manifest.json`.

## Use

1. Click the extension icon in the browser toolbar.
2. Choose an image source: upload, paste, or screenshot.
3. For screenshots, drag on the current page to select an area.
4. Click **Start search** when an image preview is ready.

The large drop area can be configured from its top-right menu. The selected default action is saved locally in the browser.

## Permissions

- `activeTab`: access the current tab when selecting a screenshot area.
- `clipboardRead`: read images from the clipboard after user action.
- `scripting`: show the screenshot selection overlay on the current page.
- `storage`: remember the main drop area's default action and pass image data between extension pages.
- `tabs`: open the search result page.

## Notes

This extension currently uses Google as the default image search engine.
