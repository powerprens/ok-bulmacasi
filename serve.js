// Basit statik dosya sunucusu (test için) — kullanım: node serve.js [port]
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = process.argv[2] || 8080;
const ROOT = __dirname;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/manifest+json; charset=utf-8",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("Bulunamadi"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT} hazır`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const net of list)
      if (net.family === "IPv4" && !net.internal)
        console.log(`telefondan (aynı Wi-Fi): http://${net.address}:${PORT}`);
});
