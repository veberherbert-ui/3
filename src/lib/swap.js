import { EXDB, GROUPS, PUSH_M, PULL_M } from "../data/exercises.js";
import { worstRisk, risksFor, PREFERRED_SWAPS } from "../data/conditions.js";

/* Подбор замены упражнению, которое не подходит по состоянию здоровья.

   Замены не прописаны руками для каждой пары «упражнение + травма» — их
   слишком много, и такой список невозможно поддерживать. Вместо этого ищем
   среди упражнений на ту же мышцу те, что безопаснее выбранного.

   К другим мышцам той же группы обращаемся только если на целевую мышцу
   безопасных вариантов почти не осталось: предлагать сгибания на бицепс
   вместо французского жима — плохой совет, даже если они безопасны. */

const MIN_SAME_MUSCLE = 2;

/** Жимовое движение, тяговое или ни то ни другое — нужно, чтобы не подсунуть
    заднюю дельту вместо жима на переднюю. */
const kind = (muscle) => (PUSH_M.has(muscle) ? "push" : PULL_M.has(muscle) ? "pull" : "other");

function relatives(exName) {
  const info = EXDB[exName];
  if (!info) return { sameMuscle: [], sameGroup: [] };
  const sameMuscle = [];
  const sameGroup = [];
  GROUPS.forEach((g) => {
    if (g.name !== info.g) return;
    g.muscles.forEach((m) => {
      m.list.forEach((n) => {
        if (n === exName) return;
        (m.name === info.m ? sameMuscle : sameGroup).push(n);
      });
    });
  });
  return { sameMuscle, sameGroup };
}

/** Насколько замена похожа на оригинал: чем меньше, тем ближе. */
function distance(exName, candidate) {
  const a = EXDB[exName];
  const b = EXDB[candidate];
  if (!a || !b) return 99;
  let d = 0;
  if (kind(a.m) !== kind(b.m)) d += 6;
  if (a.eq !== b.eq) d += 2;
  if (a.uni !== b.uni) d += 1;
  return d;
}

const rank = (exName, condIds) => (n) => ({
  name: n,
  risk: worstRisk(n, condIds),
  muscle: EXDB[n].m,
  eq: EXDB[n].eq,
  d: distance(exName, n),
});

const byRiskThenCloseness = (a, b) => a.risk - b.risk || a.d - b.d || a.name.localeCompare(b.name);

/**
 * Более безопасные замены упражнению.
 * @param {string} exName исходное упражнение
 * @param {string[]} condIds выбранные состояния
 * @param {number} limit сколько вариантов вернуть
 * @returns {{name:string, risk:number, muscle:string, eq:string, sameMuscle:boolean}[]}
 */
export function saferAlternatives(exName, condIds, limit = 5) {
  const own = worstRisk(exName, condIds);
  if (!own) return [];

  const info = EXDB[exName];
  const { sameMuscle, sameGroup } = relatives(exName);
  const safer = (list) => list.map(rank(exName, condIds)).filter((c) => c.risk < own).sort(byRiskThenCloseness);

  const out = [];
  const taken = new Set();
  const push = (c) => {
    if (taken.has(c.name)) return;
    taken.add(c.name);
    out.push({ name: c.name, risk: c.risk, muscle: c.muscle, eq: c.eq, sameMuscle: c.muscle === info?.m });
  };

  /* сначала общеизвестные замены — но только те, что действительно безопаснее */
  (PREFERRED_SWAPS[exName] || [])
    .filter((n) => EXDB[n] && worstRisk(n, condIds) < own)
    .map(rank(exName, condIds))
    .forEach(push);

  safer(sameMuscle).forEach(push);

  /* на целевую мышцу почти нечего предложить — расширяем поиск на группу */
  if (out.length < MIN_SAME_MUSCLE) safer(sameGroup).forEach(push);

  return out.slice(0, limit);
}

/** Сводка по тренировочному дню: сколько упражнений требуют внимания. */
export function dayWarnings(exercises, condIds) {
  if (!condIds?.length) return { avoid: 0, care: 0 };
  let avoid = 0;
  let care = 0;
  exercises.forEach((n) => {
    const r = worstRisk(n, condIds);
    if (r === 2) avoid++;
    else if (r === 1) care++;
  });
  return { avoid, care };
}

export { worstRisk, risksFor };
