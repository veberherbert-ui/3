/* Код для наведения камерой.

   Отдельным куском, как и графики: библиотека кодирования нужна ровно
   на одном экране, который открывают раз в жизни, — тащить её в первый
   запуск незачем.

   Рисуем сами, а не картинкой: одним прямоугольником на каждый тёмный
   модуль. Так код получается любого размера без замыливания. */

import React, { useMemo } from "react";
import { encode } from "uqr";

/* Поле вокруг кода — часть самого кода, а не отступ оформления: без него
   камера не находит границу. По стандарту четыре модуля.

   И единственное место в приложении, где тёмное на светлом: камеры ищут
   именно такой контраст, а половина сканеров попроще инвертированный код
   не берёт вовсе. Причина тут не оформительская. */
export default function QrCode({ text, size = 232 }) {
  const m = useMemo(() => {
    try {
      return encode(text, { ecc: "M", border: 4 });
    } catch {
      return null;
    }
  }, [text]);

  if (!m) return null;

  const path = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.data[y][x]) path.push(`M${x} ${y}h1v1h-1z`);
    }
  }

  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${m.size} ${m.size}`}
      role="img" aria-label="Код со ссылкой на приложение — наведи камеру"
      style={{ display: "block", borderRadius: 12, background: "#EDEAE3" }}>
      <path d={path.join("")} fill="#15171B" shapeRendering="crispEdges" />
    </svg>
  );
}
