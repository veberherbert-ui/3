import { EXDB, GROUPS, PUSH_M, PULL_M } from "../data/exercises.js";
import { exTonnage, workoutTonnage, topWeight, topReps, est1RM, r1 } from "./calc.js";
import { workoutEnergy } from "./energy.js";
import { daysAgo } from "./dates.js";

/* Что считать, чтобы вкладка «Графики» отвечала на вопросы, а не задавала их.

   Прежняя устроена наоборот: сначала выбери одно упражнение из ста одного,
   потом одну метрику из четырёх — и только тогда получишь линию. Четыреста
   возможных графиков и ни одного ответа на «как у меня дела».

   Здесь всё считается заранее, а показывается то, где что-то происходит:
   застой, просадка, забытая мышца, разница между двумя одинаковыми днями.
   Человеку остаётся смотреть, а не искать. */

/** Группа мышцы: «Грудь», «Спина» — для столбиков объёма. */
const GROUP_OF = {};
GROUPS.forEach((g) => g.muscles.forEach((m) => (GROUP_OF[m.name] = g.name)));
export const groupOfMuscle = (m) => GROUP_OF[m];

const setsOf = (w) => w.exercises.reduce((n, e) => n + e.sets.length, 0);

/**
 * Итоги за период и сравнение с предыдущим таким же.
 * Подходы, а не тоннаж: подход сравним между упражнениями, килограмм — нет.
 */
export function summary(workouts, days, bodyAt) {
  const from = daysAgo(days);
  const prevFrom = daysAgo(days * 2);
  const now = workouts.filter((w) => w.date >= from);
  const before = workouts.filter((w) => w.date >= prevFrom && w.date < from);

  const fold = (list) => {
    /* Среднюю длительность считаем только по тренировкам, где время
       записано: иначе одна забытая запись занижает среднее вдвое. */
    const timed = list.filter((w) => w.durationMin);
    return {
      workouts: list.length,
      sets: list.reduce((n, w) => n + setsOf(w), 0),
      tonnage: list.reduce((n, w) => n + workoutTonnage(w, bodyAt?.(w.date)), 0),
      avgMin: timed.length ? Math.round(timed.reduce((n, w) => n + w.durationMin, 0) / timed.length) : 0,
    };
  };
  return { now: fold(now), before: fold(before) };
}

/* Рабочий вес упражнения в одной тренировке. Своим весом без утяжеления
   прогресс идёт повторениями — тогда сравниваем их. */
const workValue = (ex) => {
  const w = topWeight(ex);
  return w != null ? { v: w, unit: "кг" } : { v: topReps(ex), unit: "повт" };
};

/**
 * Что растёт, что стоит, что просело и что заброшено.
 * Возвращает по упражнению: текущее значение, изменение за период,
 * давность и ряд для искры.
 */
export function movers(workouts, days, bodyAt) {
  const from = daysAgo(days);
  const byName = new Map();
  [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
    w.exercises.forEach((ex) => {
      if (!ex.sets.length) return;
      const { v, unit } = workValue(ex);
      if (!v) return;
      if (!byName.has(ex.name)) byName.set(ex.name, { name: ex.name, unit, points: [] });
      byName.get(ex.name).points.push({ date: w.date, v, tonnage: exTonnage(ex, bodyAt?.(w.date)), e1rm: est1RM(ex) });
    });
  });

  const today = daysAgo(0);
  const out = [];
  byName.forEach((e) => {
    const inRange = e.points.filter((p) => p.date >= from);
    const last = e.points[e.points.length - 1];
    const base = inRange.length > 1 ? inRange[0] : e.points.length > 1 ? e.points[e.points.length - 2] : null;
    const delta = base ? r1(last.v - base.v) : 0;
    const idle = Math.round((Date.parse(today) - Date.parse(last.date)) / 86400000);
    out.push({
      name: e.name,
      unit: e.unit,
      value: last.v,
      delta,
      idle,
      times: inRange.length,
      muscle: EXDB[e.name]?.m || "",
      points: e.points,
      state: e.points.length < 2 ? "once" : idle > 21 ? "idle" : delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    });
  });

  /* Сверху то, что требует решения: просадки, затем застой, затем забытое,
     и только потом рост — им любоваться можно и позже. Сделанное один раз
     идёт в самый конец: сравнивать не с чем. */
  const rank = { down: 0, flat: 1, idle: 2, up: 3, once: 4 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.idle - b.idle || b.times - a.times);
}

/** Подходы по неделям и группам мышц — распределение нагрузки одним взглядом. */
export function weeklyVolume(workouts, weeks = 8) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = daysAgo((i + 1) * 7 - 1);
    const to = daysAgo(i * 7 - 1);
    const list = workouts.filter((w) => w.date >= from && w.date < to);
    const byGroup = {};
    let total = 0;
    list.forEach((w) => w.exercises.forEach((ex) => {
      const g = groupOfMuscle(EXDB[ex.name]?.m);
      if (!g) return;
      byGroup[g] = (byGroup[g] || 0) + ex.sets.length;
      total += ex.sets.length;
    }));
    out.push({ from, to, byGroup, total, workouts: list.length });
  }
  return out;
}

/** Подходы по мышцам за неделю плюс баланс жимов и тяг. */
export function muscleWeek(workouts) {
  const cur = daysAgo(7);
  const prev = daysAgo(14);
  const acc = {};
  let push = 0, pull = 0;
  workouts.forEach((w) => {
    const slot = w.date >= cur ? "now" : w.date >= prev ? "before" : null;
    if (!slot) return;
    w.exercises.forEach((ex) => {
      const m = EXDB[ex.name]?.m;
      if (!m) return;
      acc[m] = acc[m] || { now: 0, before: 0 };
      acc[m][slot] += ex.sets.length;
      if (slot === "now") {
        if (PUSH_M.has(m)) push += ex.sets.length;
        if (PULL_M.has(m)) pull += ex.sets.length;
      }
    });
  });
  const rows = Object.entries(acc).map(([m, v]) => ({ m, ...v })).sort((a, b) => b.now - a.now);
  return { rows, push, pull };
}

/**
 * Разница между двумя тренировками одного дня.
 * Не график: сравниваются разнородные величины, и важнее всего строки
 * «не делал» и «новое», которых на графике вообще не видно.
 */
export function compare(a, b, { metrics, bmr, restOverrides, bodyAt } = {}) {
  const rows = [];
  const names = [...new Set([...a.exercises.map((e) => e.name), ...b.exercises.map((e) => e.name)])];
  names.forEach((n) => {
    const ea = a.exercises.find((e) => e.name === n);
    const eb = b.exercises.find((e) => e.name === n);
    const line = (ex) => (ex ? ex.sets.map((s) => (ex.bodyweight ? (+s.weight ? `${s.reps}+${s.weight}` : `${s.reps}`) : `${s.reps}×${s.weight}`)).join(" · ") : null);
    rows.push({
      name: n,
      was: line(ea),
      now: line(eb),
      kind: !ea ? "new" : !eb ? "gone" : "both",
      dw: ea && eb ? r1(workValue(eb).v - workValue(ea).v) : 0,
      dr: ea && eb ? eb.sets.reduce((n2, s) => n2 + (+s.reps || 0), 0) - ea.sets.reduce((n2, s) => n2 + (+s.reps || 0), 0) : 0,
      unit: (eb || ea) ? workValue(eb || ea).unit : "кг",
    });
  });

  const stat = (w) => {
    const e = workoutEnergy(w, { metrics, bmr, restOverrides });
    return {
      tonnage: workoutTonnage(w, bodyAt?.(w.date)),
      sets: setsOf(w),
      minutes: w.durationMin || null,
      kcal: e?.net || null,
      body: e?.bodyKg || null,
      load: e ? e.workMin : null,
    };
  };
  return { rows, a: stat(a), b: stat(b) };
}
