/* Все даты в приложении — локальные, а не UTC.
   toISOString() отдаёт UTC, из-за чего тренировка, записанная в Москве
   после полуночи, попадала во вчерашний день. */

const pad = (n) => String(n).padStart(2, "0");

export const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => localISO(new Date());

/** Дата на n дней назад от сегодняшнего дня, в формате YYYY-MM-DD */
export const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
};

export const fmtDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
