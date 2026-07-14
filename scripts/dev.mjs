import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { watch } from "fs";
import { resolve, extname, join } from "path";
import builtins from "builtin-modules";
import esbuild from "esbuild";

const PORT = 3333;
const ROOT = process.cwd();

// ── MIME types ──────────────────────────────────────────────
const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

// ── SSE clients ─────────────────────────────────────────────
const clients = new Set();

function broadcast(event, data) {
  for (const res of clients) {
    try {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } else {
        clients.delete(res);
      }
    } catch {
      clients.delete(res);
    }
  }
}

// ── esbuild watch ───────────────────────────────────────────
const ctx = await esbuild.context({
  entryPoints: [join(ROOT, "src/main.ts")],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: "inline",
  treeShaking: true,
  outfile: join(ROOT, "main.js"),
});

await ctx.watch();
console.log("[esbuild] watching src/**/*.ts");

// ── File watcher (CSS + HTML) ──────────────────────────────
import { existsSync } from "fs";
const watchTargets = ["styles.css"];
for (const file of watchTargets) {
  const abs = join(ROOT, file);
  if (!existsSync(abs)) {
    console.log(`[watch] skipping ${file} (not found)`);
    continue;
  }
  watch(abs, () => {
    console.log(`[watch] ${file} changed`);
    broadcast("reload", { file });
  });
}
console.log("[watch] monitoring styles.css");

// ── HTTP server ─────────────────────────────────────────────
const server = createServer(async (req, res) => {
  // SSE endpoint
  if (req.url === "/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("event: connected\ndata: {}\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // Serve files
  let url = req.url === "/" ? "/main.js" : req.url;
  const filePath = resolve(ROOT, url.slice(1));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("403 Forbidden");
    return;
  }

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) {
      res.writeHead(302, { Location: url + "/index.html" });
      res.end();
      return;
    }
    const data = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║       Nexus Dashboard — Dev Server          ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  http://localhost:${PORT}                      ║`);
  console.log("║                                              ║");
  console.log("║  Edit any file → browser auto-refreshes      ║");
  console.log("║  Ctrl+C to stop                              ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
});

process.on("SIGINT", async () => {
  await ctx.dispose();
  server.close();
  process.exit(0);
});
