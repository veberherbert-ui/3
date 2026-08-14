/** @type {import('tailwindcss').Config} */

/* Шкала размеров в rem, а не в пикселях.

   Пиксели игнорируют и системную настройку крупного текста, и нашу
   собственную: сколько ни ставь «увеличить шрифт», 10px останутся 10px.
   Через rem всё приложение двигается одним корневым значением —
   см. --text-scale в src/index.css.

   Мельче 2xs (13px) в приложении не должно быть ничего: до правки
   75 надписей были в диапазоне 9–11px. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {},
    fontSize: {
      "2xs": ["0.8125rem", { lineHeight: "1.15rem" }], // 13px — минимум
      xs: ["0.875rem", { lineHeight: "1.25rem" }], // 14px
      sm: ["0.9375rem", { lineHeight: "1.4rem" }], // 15px
      base: ["1rem", { lineHeight: "1.5rem" }], // 16px
      lg: ["1.125rem", { lineHeight: "1.6rem" }], // 18px
      xl: ["1.375rem", { lineHeight: "1.8rem" }], // 22px
      "2xl": ["1.75rem", { lineHeight: "2.1rem" }], // 28px
      "3xl": ["2.125rem", { lineHeight: "2.4rem" }], // 34px
      "4xl": ["2.75rem", { lineHeight: "3rem" }], // 44px
    },
  },
  plugins: [],
};
