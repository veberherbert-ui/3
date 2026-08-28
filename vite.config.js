import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* base — путь, по которому отдаётся приложение.
   По умолчанию корень: так работают Cloudflare Pages, Netlify, Vercel
   и локальный просмотр.
   GitHub Pages отдаёт репозиторий из подпапки с его именем, поэтому там
   сборка запускается с BASE_PATH=/3/ — это прописано в .github/workflows. */
const base = process.env.BASE_PATH || "/";

/* Метка версии, чтобы в настройках было видно, что именно установлено.
   Cloudflare Pages и GitHub Actions подставляют хеш коммита сами. */
const commit = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || "";
const buildId = commit ? commit.slice(0, 7) : "локальная";

export default defineConfig({
  base,
  build: {
    /* Явная нижняя планка вместо умолчания сборщика.

       Умолчание Vite отслеживает «широко доступные» браузеры и потому
       ползёт вверх само по себе: в сборку попадали операторы вида ??= и ||=,
       а это уже Safari 14. Телефон постарше не разбирал такой файл вообще —
       не ошибка в приложении, а белый экран без единой строчки в консоли,
       потому что до выполнения дело не доходило.

       Дневнику незачем требовать свежий телефон: ему нужны IndexedDB
       и служебный поток, а они есть с Safari 11. Держим планку низко
       и проверяем её при сборке. */
    target: ["es2018", "safari12", "chrome70", "firefox68", "edge79"],
  },
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Железный дневник",
        short_name: "Дневник",
        /* Постоянное имя приложения на телефоне. Без него телефон опознаёт
           установленное по start_url — и стоит однажды сменить адрес, как
           рядом появится второе такое же приложение с пустым журналом. */
        id: base,
        description: "Трекер силовых тренировок: журнал, прогресс, замеры тела",
        lang: "ru",
        theme_color: "#15171B",
        background_color: "#15171B",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        /* шрифты лежат локально, поэтому в офлайне доступно всё приложение целиком */
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
