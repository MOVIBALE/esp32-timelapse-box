import { createReadStream, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

export function startStaticSmokeServer({ root, host = "127.0.0.1", port = 0 } = {}) {
  const appRoot = resolve(root || process.cwd());
  const server = http.createServer((request, response) => {
    serveStaticRequest({ appRoot, request, response });
  });

  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(port, host, () => {
      server.off("error", rejectStart);
      const address = server.address();
      resolveStart({
        url: `http://${host}:${address.port}/`,
        close: () => new Promise((resolveClose, rejectClose) => {
          server.close((error) => {
            if (error) rejectClose(error);
            else resolveClose();
          });
        })
      });
    });
  });
}

function serveStaticRequest({ appRoot, request, response }) {
  const url = new URL(request.url || "/", "http://127.0.0.1/");
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  const normalized = normalize(relativePath);

  if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  const filePath = resolve(join(appRoot, normalized));
  if (!filePath.startsWith(`${appRoot}${sep}`) && filePath !== appRoot) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  let stats;
  try {
    stats = statSync(filePath);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  if (!stats.isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not Found");
    return;
  }

  response.writeHead(200, {
    "content-length": stats.size,
    "content-type": CONTENT_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}
