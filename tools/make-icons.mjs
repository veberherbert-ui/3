/* Генерирует иконки приложения из одного SVG.
   Запуск: node tools/make-icons.mjs
   Пересобирать нужно только при смене логотипа. */

import { writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = "public";
const BG = "#15171B";
const RED = "#C1443A";
const CHALK = "#EDEAE3";

/** Штанга: гриф, два внутренних замка и по два блина с каждой стороны.
    padding — отступ от краёв в долях размера (для maskable нужен запас под обрезку). */
const barbell = (size, pad) => {
  const s = size;
  const inner = s * (1 - 2 * pad);
  const cx = s / 2;
  const cy = s / 2;
  const barH = inner * 0.1;
  const barW = inner;
  const plateOuterH = inner * 0.62;
  const plateInnerH = inner * 0.86;
  const plateW = inner * 0.12;
  const collarW = inner * 0.055;
  const gap = inner * 0.02;

  const x = (off) => cx + off;
  const rect = (cxp, w, h, fill, r) =>
    `<rect x="${(cxp - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${r.toFixed(1)}" fill="${fill}"/>`;

  const half = (dir) => {
    const outerX = dir * (barW / 2 - plateW / 2);
    const innerX = dir * (barW / 2 - plateW * 1.5 - gap);
    const collarX = dir * (barW / 2 - plateW * 2 - gap - collarW);
    return [
      rect(x(outerX), plateW, plateOuterH, RED, plateW * 0.28),
      rect(x(innerX), plateW, plateInnerH, RED, plateW * 0.28),
      rect(x(collarX), collarW, barH * 1.9, CHALK, collarW * 0.35),
    ].join("");
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" fill="${BG}"/>
  ${rect(cx, barW, barH, CHALK, barH / 2)}
  ${half(1)}${half(-1)}
</svg>`;
};

mkdirSync(`${OUT}/icons`, { recursive: true });

/* favicon — обычный SVG, браузеры масштабируют его сами */
writeFileSync(`${OUT}/favicon.svg`, barbell(512, 0.16));

const png = async (svg, file, size) => {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log("готово:", file);
};

await png(barbell(512, 0.16), `${OUT}/icons/icon-192.png`, 192);
await png(barbell(512, 0.16), `${OUT}/icons/icon-512.png`, 512);
/* maskable — система может обрезать до круга, поэтому запас по краям больше */
await png(barbell(512, 0.26), `${OUT}/icons/icon-maskable-512.png`, 512);
/* iOS не умеет прозрачность в иконке домашнего экрана, фон здесь обязателен */
await png(barbell(512, 0.16), `${OUT}/icons/apple-touch-icon.png`, 180);
