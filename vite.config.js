import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/* base — подпапка, из которой отдаётся приложение.
   GitHub Pages для репозитория veberherbert-ui/3 отдаёт его по адресу
   https://veberherbert-ui.github.io/3/ , поэтому по умолчанию "/3/".
   Для своего домена или локальной сборки: BASE_PATH=/ npm run build */
const base = process.env.BASE_PATH ?? "/3/";

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
