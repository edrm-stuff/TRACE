// Tiny static server for previewing the built frontend (dist/) outside Wails.
// Used only for visual verification; the real app serves these files via WebView2.
const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "frontend", "dist");
const PORT = 5599;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

http
  .createServer((req, res) => {
    let p = req.url.split("?")[0];
    if (p === "/") p = "/index.html";
    const fp = path.join(DIST, p);
    fs.readFile(fp, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(fp)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log("preview serving dist/ on http://localhost:" + PORT));
