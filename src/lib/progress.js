import { EXDB, GROUPS, PUSH_M, PULL_M, moveOf, BW_STATIC } from "../data/exercises.js";
import { exTonnage, workoutTonnage, topWeight, topReps, est1RM, r1 } from "./calc.js";
import { workoutEnergy } from "./energy.js";
import { daysAgo } from "./dates.js";
import { allTags } from "../data/tags.js";

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
/* Чем мерить рост упражнения.

   Раньше это был верхний вес подхода — и он врал ровно там, где человек
   работает осмысленно. Снизил вес, чтобы прибавить в объёме: подходов
   стало больше, повторений больше, работы больше — а дневник пишет
   «просело». Тоннаж отвечает на тот же вопрос честнее, потому что видит
   и вес, и повторения, и число подходов сразу.

   Где тоннажа нет — планка, вис, всё, что меряется секундами, — остаются
   повторения: складывать секунды удержания в килограммы бессмысленно. */
const workValue = (ex, bodyKg) => {
  const t = exTonnage(ex, bodyKg);
  return t > 0 ? { v: Math.round(t), unit: "кг" } : { v: topReps(ex), unit: "повт" };
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
      const { v, unit } = workValue(ex, bodyAt?.(w.date));
      if (!v) return;
      if (!byName.has(ex.name)) byName.set(ex.name, { name: ex.name, unit, points: [] });
      byName.get(ex.name).points.push({ date: w.date, v, tonnage: exTonnage(ex, bodyAt?.(w.date)), e1rm: est1RM(ex), top: topWeight(ex) });
    });
  });

  const today = daysAgo(0);
  /* Когда движение делали в последний раз — любым его вариантом.
     «Подтягивания не делал три недели» звучит тревожно ровно до тех пор,
     пока не вспомнишь, что всё это время тянул верхний блок. */
  const moveLast = new Map();
  byName.forEach((e) => {
    const move = moveOf(e.name);
    const last = e.points[e.points.length - 1].date;
    if (!move) return;
    if (!moveLast.has(move) || moveLast.get(move) < last) moveLast.set(move, last);
  });

  const out = [];
  byName.forEach((e) => {
    const inRange = e.points.filter((p) => p.date >= from);
    const last = e.points[e.points.length - 1];
    const base = inRange.length > 1 ? inRange[0] : e.points.length > 1 ? e.points[e.points.length - 2] : null;
    const delta = base ? r1(last.v - base.v) : 0;
    const idle = Math.round((Date.parse(today) - Date.parse(last.date)) / 86400000);
    const move = moveOf(e.name) || "";
    const moveIdle = moveLast.has(move)
      ? Math.round((Date.parse(today) - Date.parse(moveLast.get(move))) / 86400000)
      : idle;
    out.push({
      name: e.name,
      unit: e.unit,
      value: last.v,
      delta,
      idle,
      move,
      /* Заброшено — только если заброшено само движение. Упражнение,
         которое просто заменили другим вариантом, поводом для тревоги
         не является. */
      moveIdle,
      times: inRange.length,
      muscle: EXDB[e.name]?.m || "",
      points: e.points,
      state: e.points.length < 2 ? "once" : moveIdle > 21 ? "idle" : delta > 0 ? "up" : delta < 0 ? "down" : "flat",
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
      dw: ea && eb ? r1((topWeight(eb) || 0) - (topWeight(ea) || 0)) : 0,
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

/* Что метки говорят об упражнении.

   Метки собирались, показывались в журнале и уходили в выгрузку — и всё.
   Между тем это единственные данные, где человек прямо говорит, как прошёл
   подход: тоннаж и повторения об этом молчат.

   Здесь они превращаются в три вывода. «Болело» — своя, личная история
   боли на конкретном упражнении, которая весит больше любой общей таблицы
   рисков. «Был запас» и «читинг» — прямой ответ на вопрос, добавлять ли
   вес: в одном случае человек сам сказал, что мог больше, в другом —
   что техника поехала. «Читинг» и «частичные» — повод не верить
   расчётному одноповторному максимуму: вес сдвинут корпусом или
   на половине амплитуды, и формула этого не видит. */

/** Сколько раз упражнение отмечалось меткой за последние дни. */
export function tagHistory(workouts, name, tag, days = 90) {
  const from = daysAgo(days);
  let times = 0;
  let last = null;
  (workouts || []).forEach((w) => {
    if (w.date < from) return;
    (w.exercises || []).forEach((ex) => {
      if (ex.name !== name || !allTags(ex).includes(tag)) return;
      times++;
      if (!last || w.date > last) last = w.date;
    });
  });
  return { times, last };
}

/** Повторяющаяся боль — не разовая жалоба, а причина искать замену. */
export const painFlag = (workouts, name) => {
  const h = tagHistory(workouts, name, "pain");
  return h.times >= 2 ? h : null;
};

/* Рабочие подходы — те, что составляют объём упражнения.

   Якорь — вес, который встречается чаще других; если явного нет, медиана.
   Рабочим считается подход в пределах десяти процентов от якоря: обычный
   шаг блинов на рабочих весах — три-восемь процентов, значит раскладка
   по подходам внутрь укладывается, а разовая проверка на тяжёлом или
   сброс на дроп-сете выпадают.

   Осталось меньше двух — берём все: без данных умничать не надо. */
const anchorWeight = (weights) => {
  const count = new Map();
  weights.forEach((w) => count.set(w, (count.get(w) || 0) + 1));
  const top = Math.max(...count.values());
  const often = [...count].filter(([, n]) => n === top).map(([w]) => w);
  if (top > 1 && often.length === 1) return often[0];
  const sorted = [...weights].sort((a, b) => a - b);
  const m = sorted.length / 2;
  return sorted.length % 2 ? sorted[Math.floor(m)] : (sorted[m - 1] + sorted[m]) / 2;
};

export function workingSets(ex) {
  const sets = (ex?.sets || []).filter((s) => +s.reps > 0);
  if (sets.length < 2) return sets;
  const weights = sets.map((s) => +s.weight || 0);
  const a = anchorWeight(weights);
  if (!a) return sets;
  const keep = sets.filter((s) => Math.abs((+s.weight || 0) - a) / a <= 0.1);
  return keep.length >= 2 ? keep : sets;
}

/**
 * Пора ли добавлять вес — и почему.
 *
 * Считается объём на рабочем весе, а не каждый подход по отдельности.
 * Правило «во всех подходах верх диапазона» ломается на живой тренировке:
 * подходы 12, 19, 8 его не проходят, хотя всего на этом весе сделано
 * тридцать девять повторений против тридцати шести нужных — восьмёрка тут
 * не предел, а долг за девятнадцать. Сумма отвечает на тот же вопрос
 * честнее: столько работы на этом весе мышца уже сделала.
 *
 * Нижняя граница на подход при этом остаётся — иначе один огромный подход
 * и два развалившихся выглядели бы выполненной целью.
 * @returns {null|{add:boolean, why:string}}
 */
const TOP_REPS = 12;
const EASY_REPS = 10;

const beatsRange = (reps, target) =>
  reps.length >= 2
  && reps.reduce((a, b) => a + b, 0) >= target * reps.length
  && Math.min(...reps) >= Math.ceil(target / 2);

export function weightAdvice(ex) {
  if (!ex || BW_STATIC.has(ex.name) || !ex.sets?.length) return null;
  const tags = allTags(ex);
  const reps = workingSets(ex).map((s) => +s.reps || 0);
  const dirty = tags.includes("cheat") || tags.includes("partial");

  if (dirty && beatsRange(reps, TOP_REPS)) {
    return { add: false, why: tags.includes("cheat")
      ? "верх диапазона выбит, но с читингом — сначала техника, потом вес"
      : "верх диапазона выбит на частичных — сначала полная амплитуда" };
  }
  if (dirty) return null;
  if (tags.includes("easy") && beatsRange(reps, EASY_REPS)) {
    return { add: true, why: "сам отметил, что был запас — пора добавлять" };
  }
  if (beatsRange(reps, TOP_REPS)) {
    return { add: true, why: "объём на рабочем весе выбран — пора добавлять" };
  }
  return null;
}

/** Верить ли расчётному максимуму: читинг и частичные его завышают. */
export const rmDoubtful = (ex) => {
  const t = allTags(ex);
  return t.includes("cheat") || t.includes("partial");
};
