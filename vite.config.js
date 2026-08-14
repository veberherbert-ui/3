import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* base — путь, по которому отдаётся приложение.
   По умолчанию корень: так работают Cloudflare Pages, Netlify, Vercel
   и локальный просмотр.
   GitHub Pages отдаёт репозиторий из подпапки с его именем, поэтому там
   сборка запускается с BASE_PATH=/3/ — это прописано в .github/workflows. */
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Железный дневник",
        short_name: "Дневник",
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
