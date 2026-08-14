/* Палитра приложения. Тёмная тема с «меловым» текстом — читается в зале при любом свете. */
export const C = {
  bg: "#15171B",
  surface: "#1D2024",
  surfaceHi: "#262A2F",
  line: "#33373D",
  chalk: "#EDEAE3",
  dim: "#9C9A94",
  red: "#C1443A",
  blue: "#3E6B8A",
  mustard: "#C9A227",
  moss: "#4B7A51",
};

/** Цвет блина по весу — как в зале: тяжёлое красное, лёгкое зелёное. */
export const plateColor = (kg) =>
  kg >= 70 ? C.red : kg >= 45 ? C.blue : kg >= 25 ? C.mustard : kg >= 10 ? C.moss : C.dim;
