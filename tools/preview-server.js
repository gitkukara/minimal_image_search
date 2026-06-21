const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number(process.argv[2]) || 49152;
const root = path.resolve(__dirname, "..");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const requestedPath = path.normalize(path.join(root, decodeURIComponent(requestUrl.pathname)));

  if (!requestedPath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const filePath = resolveFilePath(requestedPath);
  if (!filePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(path.extname(filePath)) || "application/octet-stream"
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Preview: http://${host}:${port}/src/popup.html`);
});

function resolveFilePath(requestedPath) {
  if (!fs.existsSync(requestedPath)) {
    return null;
  }

  const stats = fs.statSync(requestedPath);
  if (stats.isDirectory()) {
    const indexPath = path.join(requestedPath, "index.html");
    return fs.existsSync(indexPath) ? indexPath : null;
  }

  return stats.isFile() ? requestedPath : null;
}
