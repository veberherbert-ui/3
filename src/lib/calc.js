/* Все расчёты приложения: тоннаж, рекорды, одноповторный максимум,
   состав тела и энергозатраты. Чистые функции — без состояния и без DOM. */

import { BW_SHARE, BW_STATIC } from "../data/exercises.js";

export const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const r1 = (x) => Math.round(x * 10) / 10;

export const ytLink = (n) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(
    n.replace(/\(.*?\)/g, "").trim() + " техника выполнения"
  )}`;

/* ============ железо на снаряде ============ */

/* Двойной блок: что висит на стеке и что тянет рука — разные числа.

   На кроссовере и подобных тренажёрах трос идёт через подвижный блок,
   и стек поднимается на половину хода рукояти. Плата за это — сила:
   на рукояти оказывается половина того, что висит на стеке. Повесил 10 —
   тянешь 5.

   Раньше это приходилось делить в уме перед вводом, и в дневник попадало
   уже поделённое: 5. Плохо тем, что в зале-то надо повесить 10, а в записи
   этого числа нет — в следующий раз вспоминай сам.

   Теперь пишется то, что стоит на стеке, а признак «блок» на упражнении
   говорит приложению поделить. Считается по железу, показывается тоже
   по железу — то есть ровно так, как выглядел дневник раньше. Число со
   стека остаётся в поле ввода: по нему и выставлять снаряд.

   Признак хранится в самой записи, а не берётся из базы: один и тот же
   кроссовер в одном зале с двойным блоком, в другом с одинарным. Это
   знает человек, а не приложение. */
export const ironKg = (ex, w) => {
  const v = +w || 0;
  return ex?.block ? v / 2 : v;
};

/* ============ объём работы ============ */

/**
 * Тоннаж упражнения в кг. Одностороннее и парное считаются вдвое.
 *
 * Упражнения со своим весом входят в тоннаж по доле поднимаемого веса тела
 * (см. BW_SHARE) — но только если вес тела известен: без замера подтягивания
 * по-прежнему дают ноль, потому что умножать не на что.
 *
 * @param {object} ex упражнение из записи
 * @param {number} [bodyKg] вес тела на дату тренировки
 */
export const exTonnage = (ex, bodyKg = 0) => {
  /* Одностороннее удваивается, потому что записывается один подход из двух.
     Парное (две гантели) — потому что в поле веса стоит одна гантель. */
  const mult = (ex.uni ? 2 : 1) * (ex.pair ? 2 : 1);
  const own = ex.bodyweight ? bwKg(ex.name, bodyKg) || 0 : 0;
  /* Для упражнения со своим весом в поле веса лежит утяжеление — блин на поясе
     или гантель между стоп. К своему весу оно прибавляется, а не заменяет его. */
  return Math.round(ex.sets.reduce((s, x) => s + (+x.reps || 0) * (own + ironKg(ex, x.weight)), 0)) * mult;
};

export const workoutTonnage = (w, bodyKg = 0) =>
  w.exercises.reduce((s, ex) => s + exTonnage(ex, bodyKg), 0);

/** Своя часть веса в упражнении со своим весом, кг на повторение. */
export const bwKg = (name, bodyKg) => {
  const share = BW_SHARE[name];
  return share && bodyKg ? Math.round(bodyKg * share) : null;
};

/** Наибольшее утяжеление в упражнении, кг. */
export const addedKg = (ex) => (ex.sets.length ? Math.max(...ex.sets.map((s) => ironKg(ex, s.weight))) : 0);

/**
 * Рабочий вес упражнения — то, по чему видно прогресс.
 * Своим весом это утяжеление: подтягивания растут не повторениями без конца,
 * а блином на поясе. Без утяжеления прогресса по весу нет — null.
 */
export const topWeight = (ex) => {
  if (!ex.sets.length) return null;
  const m = addedKg(ex);
  return ex.bodyweight ? m || null : m;
};

/** Полная нагрузка на одно повторение: свой вес плюс железо, пара — за две. */
export const perRepKg = (ex, bodyKg = 0) => {
  const own = ex.bodyweight ? bwKg(ex.name, bodyKg) || 0 : 0;
  const total = own + addedKg(ex) * (ex.pair ? 2 : 1);
  return total || null;
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
    const w = ironKg(ex, s.weight),
      r = +s.reps;
    /* Выше двенадцати повторений формулы разъезжаются: пятнадцать по
       восемьдесят дают больше, чем шесть по сто, — то есть рабочий подход
       обгоняет тяжёлый. Считаем только там, где им ещё можно верить. */
    if (!w || !r || r > 12) return;
    const v = (epley(w, r) + brzycki(w, r)) / 2;
    if (v > best) best = v;
  });
  return best ? r1(best) : null;
}

/* Верх диапазона выбит во всех подходах — пора добавлять вес.
   Своим весом это тоже работает: двенадцать подтягиваний в каждом подходе —
   повод надеть пояс. Кроме статики, где в повторениях лежат секунды. */
export const readyToAdd = (ex) =>
  !BW_STATIC.has(ex.name) && ex.sets.length >= 2 && ex.sets.every((s) => +s.reps >= 12);

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

/** Вес тела на дату: ближайший по времени замер, а не последний. */
export function weightNear(metrics, date) {
  const withWeight = (metrics || []).filter((m) => +m.weight > 0);
  if (!withWeight.length) return null;
  const dist = (m) => Math.abs(Date.parse(m.date) - Date.parse(date));
  let best = withWeight[0];
  for (const m of withWeight) if (dist(m) < dist(best)) best = m;
  return { kg: +best.weight, date: best.date };
}

/**
 * Основной обмен, ккал в сутки. По сухой массе (Кетч-Макардл), если она
 * известна, иначе по Миффлину — Сан Жеору. Нужен и во вкладке «Тело»,
 * и на графиках, поэтому живёт здесь, а не в компоненте.
 */
export function bmrOf({ lbm, bodyKg, height, age, sex }) {
  if (lbm) return Math.round(370 + 21.6 * lbm);
  if (bodyKg && height && age) {
    const base = 10 * bodyKg + 6.25 * +height - 5 * +age;
    return Math.round(sex === "f" ? base - 161 : base + 5);
  }
  return null;
}

export const bmiOf = (w, h) => (w && h ? r1(w / Math.pow(h / 100, 2)) : null);

/** Сухая масса тела: всё, кроме жира. */
export const lbmOf = (w, bf) => (w && bf != null ? r1(w * (1 - bf / 100)) : null);

/** Индекс безжировой массы, нормализованный по росту. */
export const ffmiOf = (lbm, h) => (lbm && h ? r1(lbm / Math.pow(h / 100, 2) + 6.1 * (1.8 - h / 100)) : null);
