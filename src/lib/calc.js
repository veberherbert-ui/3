/* Все расчёты приложения: тоннаж, рекорды, одноповторный максимум,
   состав тела и энергозатраты. Чистые функции — без состояния и без DOM. */

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const r1 = (x) => Math.round(x * 10) / 10;

export const ytLink = (n) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    n.replace(/\(.*?\)/g, "").trim() + " техника выполнения"
  )}`;

/* ============ объём работы ============ */

/** Тоннаж упражнения в кг. Своим весом не считается, одностороннее — вдвое. */
export const exTonnage = (ex) =>
  ex.bodyweight ? 0 : ex.sets.reduce((s, x) => s + (+x.reps || 0) * (+x.weight || 0), 0) * (ex.uni ? 2 : 1);

export const workoutTonnage = (w) => w.exercises.reduce((s, ex) => s + exTonnage(ex), 0);

/** Максимальный вес в упражнении. null — если своим весом или подходов нет. */
export const topWeight = (ex) => {
  if (ex.bodyweight || !ex.sets.length) return null;
  return Math.max(...ex.sets.map((s) => +s.weight || 0));
};

export const topReps = (ex) => (ex.sets.length ? Math.max(...ex.sets.map((s) => +s.reps || 0)) : 0);

export const totalReps = (ex) => ex.sets.reduce((s, x) => s + (+x.reps || 0), 0) * (ex.uni ? 2 : 1);

/* ============ одноповторный максимум ============ */

export const epley = (w, r) => w * (1 + r / 30);
export const brzycki = (w, r) => (r >= 37 ? w : (w * 36) / (37 - r));

/** Оценка 1ПМ по лучшему подходу — среднее двух формул. Подходы длиннее 15 повторов игнорируются. */
export function est1RM(ex) {
  if (ex.bodyweight) return null;
  let best = 0;
  ex.sets.forEach((s) => {
    const w = +s.weight,
      r = +s.reps;
    if (!w || !r || r > 15) return;
    const v = (epley(w, r) + brzycki(w, r)) / 2;
    if (v > best) best = v;
  });
  return best ? r1(best) : null;
}

/** Верх диапазона выбит во всех подходах — пора добавлять вес. */
export const readyToAdd = (ex) =>
  !ex.bodyweight && ex.sets.length >= 2 && ex.sets.every((s) => +s.reps >= 12);

/* ============ состав тела ============ */

/** Процент жира по обхватам, формула ВМФ США. Нужны рост, талия и шея (у женщин ещё бёдра). */
export function bodyFatNavy(m, profile) {
  const h = +profile.height,
    waist = +m?.waist,
    neck = +m?.neck,
    hips = +m?.hips;
  if (!h || !waist || !neck) return null;
  if (profile.sex === "f") {
    if (!hips) return null;
    const v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(h)) - 450;
    return v > 3 && v < 65 ? r1(v) : null;
  }
  const v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(h)) - 450;
  return v > 2 && v < 60 ? r1(v) : null;
}

export const bmiOf = (w, h) => (w && h ? r1(w / Math.pow(h / 100, 2)) : null);

/** Сухая масса тела: всё, кроме жира. */
export const lbmOf = (w, bf) => (w && bf != null ? r1(w * (1 - bf / 100)) : null);

/** Индекс безжировой массы, нормализованный по росту. */
export const ffmiOf = (lbm, h) => (lbm && h ? r1(lbm / Math.pow(h / 100, 2) + 6.1 * (1.8 - h / 100)) : null);
