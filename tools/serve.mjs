/* Раздача сборки с настоящими заголовками.

   vite preview заголовки из _headers не отдаёт, а именно они и решают,
   заработает ли приложение под политикой содержимого. Политика, которую
   никто не проверял, — худший вариант из возможных: она либо не защищает,
   либо молча ломает что-то, что заметят уже пользователи.

   Поэтому проверки гоняются через этот сервер: он читает dist/_headers
   и отдаёт ровно то же, что отдаст Cloudflare.

   Запуск: node tools/serve.mjs [порт] */

import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const ROOT = "dist";
const PORT = +(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

/* Разбор _headers в том же виде, в каком его понимает Cloudflare:
   строка без отступа — образец пути, строки с отступом — заголовки. */
function parseHeaders() {
  const file = join(ROOT, "_headers");
  if (!existsSync(file)) return [];
  const rules = [];
  let cur = null;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      cur = { pattern: raw.trim(), headers: [] };
      rules.push(cur);
    } else if (cur) {
      const i = raw.indexOf(":");
      if (i > 0) cur.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const rules = parseHeaders();
const matches = (pattern, path) =>
  pattern.endsWith("*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  /* нормализуем, чтобы «..» не выводили за пределы папки */
  let file = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("нет такого файла");
    return;
  }
  const head = { "Content-Type": TYPES[extname(file)] || "application/octet-stream" };
  for (const r of rules) if (matches(r.pattern, path)) for (const [k, v] of r.headers) head[k] = v;
  res.writeHead(200, head);
  res.end(readFileSync(file));
}).listen(PORT, "127.0.0.1", () => console.log(`раздаю ${ROOT} на http://127.0.0.1:${PORT}/ с заголовками из _headers`));
