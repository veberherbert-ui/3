import { useEffect } from "react";

/* Размер текста и величина кнопок.

   Единый «средний» размер не устраивает никого: тому, кто привык
   к плотному интерфейсу, он крупноват, а тому, кто плохо видит, всё равно
   мелок. Поэтому размер — настройка, а не решение за пользователя.

   Работает это через две переменные в корне документа: --text-scale
   умножает базовый размер шрифта, --tap задаёт минимальную сторону кнопки.
   Всё остальное выражено в rem и подтягивается само. */

export const TEXT_SIZES = [
  { id: "normal", label: "Обычный", hint: "как было" },
  { id: "large", label: "Крупный", hint: "+15%" },
  { id: "xlarge", label: "Очень крупный", hint: "+30%" },
];

/** Применяет настройки к документу. Вызывать один раз на верхнем уровне. */
export function useAppearance(profile) {
  const text = profile?.textSize || "normal";
  const bigTaps = !!profile?.bigTaps;

  useEffect(() => {
    const el = document.documentElement;
    if (text === "normal") el.removeAttribute("data-text");
    else el.setAttribute("data-text", text);
  }, [text]);

  useEffect(() => {
    const el = document.documentElement;
    if (bigTaps) el.setAttribute("data-tap", "large");
    else el.removeAttribute("data-tap");
  }, [bigTaps]);
}
