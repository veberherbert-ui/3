import { EXDB, MOVES, moveOf, fitsGear } from "../data/exercises.js";

/* Подгонка готового сплита под инвентарь.

   Сплит — это про порядок движений, а не про конкретные снаряды: «жать
   горизонтально», «тянуть вертикально», «приседать». Название упражнения
   в готовом дне — лишь один из способов сделать движение, и если нужного
   снаряда нет, движение чаще всего остаётся выполнимым другим.

   Отсюда порядок поиска замены:
     1. то же движение и та же мышца — отжимания вместо жима лёжа;
     2. то же движение, мышца рядом — редко, но лучше, чем ничего;
     3. та же мышца другим движением — последняя попытка;
     4. ничего — упражнение выпадает, и об этом надо сказать вслух.

   Врать про результат нельзя. Бро-сплит на турнике — это не бро-сплит:
   он держится на изоляции, а изолировать среднюю дельту нечем. Поэтому
   считаем не только «сколько получилось», но и какие мышцы остались без
   нагрузки — по ним и выносится приговор. */

/** Сколько мышц можно потерять, прежде чем сплит перестаёт быть собой. */
const MUSCLES_LOST_OK = 1;

/** Доля выживших упражнений, ниже которой это уже другая программа. */
const KEEP_MIN = 0.75;

/** Порядок в списке сплитов: подходящие вперёд, неподходящие в конец. */
const RANK = { native: 0, adapted: 1, poor: 2 };

/**
 * Порядок в списке сплитов.
 *
 * Сперва пригодность: подходящее как есть, потом требующее замен, в конце
 * непригодное. Внутри — сколько из имеющегося пошло в дело: программа
 * с одного пола формально подходит и тому, у кого есть гантели, но
 * предлагать её первой странно — он сказал, чем располагает, и ждёт,
 * что это используют.
 */
export const byFit = (a, b) =>
  RANK[a.fit.verdict] - RANK[b.fit.verdict]
  || b.fit.uses - a.fit.uses
  || a.fit.swaps - b.fit.swaps;

/**
 * Похожие упражнения — те же, из которых собирается автозамена, только
 * показанные человеку, чтобы выбрал сам. Сначала то же движение на ту же
 * мышцу, потом остальное движение, потом просто та же мышца. Доступное
 * по инвентарю идёт первым: замена на снаряд, которого нет, — не замена.
 * @returns {{name:string, kind:"move"|"muscle", muscle:string, eq:string, fits:boolean}[]}
 */
export function similarTo(name, gear = [], limit = 12) {
  const info = EXDB[name];
  if (!info) return [];
  const seen = new Set([name]);
  const out = [];
  const push = (kind) => (n) => {
    if (seen.has(n) || !EXDB[n]) return;
    seen.add(n);
    out.push({ name: n, kind, muscle: EXDB[n].m, eq: EXDB[n].eq, fits: fitsGear(n, gear) });
  };
  const move = MOVES[moveOf(name)] || [];
  move.filter((n) => EXDB[n]?.m === info.m).forEach(push("move"));
  move.forEach(push("move"));
  Object.keys(EXDB).filter((n) => EXDB[n].m === info.m).forEach(push("muscle"));
  /* сортировка устойчивая, поэтому порядок внутри групп сохраняется */
  return out.sort((a, b) => Number(b.fits) - Number(a.fits)).slice(0, limit);
}

function replacement(name, gear, taken) {
  const info = EXDB[name];
  if (!info) return null;
  const free = (list) => list.filter((n) => n !== name && !taken.has(n) && fitsGear(n, gear));

  const sameMove = free(MOVES[moveOf(name)] || []);
  const exact = sameMove.filter((n) => EXDB[n].m === info.m);
  if (exact.length) return { name: exact[0], kind: "move" };
  if (sameMove.length) return { name: sameMove[0], kind: "near" };

  const sameMuscle = free(Object.keys(EXDB).filter((n) => EXDB[n].m === info.m));
  if (sameMuscle.length) return { name: sameMuscle[0], kind: "muscle" };
  return null;
}

/**
 * Подогнать один список упражнений.
 * @returns {{exercises:string[], swaps:{from:string,to:string,kind:string}[], lost:string[]}}
 */
export function adaptDay(names, gear) {
  if (!gear?.length) return { exercises: [...names], swaps: [], lost: [] };
  /* Уже подходящие занимают свои места первыми — чтобы замена не увела
     упражнение, которое и так стоит в этом дне ниже по списку. */
  const taken = new Set(names.filter((n) => fitsGear(n, gear)));
  const exercises = [];
  const swaps = [];
  const lost = [];

  names.forEach((n) => {
    if (fitsGear(n, gear)) {
      exercises.push(n);
      return;
    }
    const r = replacement(n, gear, taken);
    if (!r) {
      lost.push(n);
      return;
    }
    taken.add(r.name);
    exercises.push(r.name);
    swaps.push({ from: n, to: r.name, kind: r.kind });
  });

  return { exercises, swaps, lost };
}

/**
 * Подогнать весь сплит и оценить, что от него осталось.
 * @returns {{days:{name:string,ex:string[]}[], swaps:number, lost:string[],
 *   lostMuscles:string[], keep:number, uses:number, verdict:"native"|"adapted"|"poor"}}
 */
export function adaptPreset(preset, gear) {
  const days = [];
  let swaps = 0;
  const lost = [];

  preset.days.forEach((d) => {
    const r = adaptDay(d.ex, gear);
    days.push({ name: d.name, ex: r.exercises });
    swaps += r.swaps.length;
    lost.push(...r.lost);
  });

  const total = preset.days.reduce((n, d) => n + d.ex.length, 0);
  const keep = total ? (total - lost.length) / total : 1;
  const lostMuscles = [...new Set(lost.map((n) => EXDB[n]?.m).filter(Boolean))];

  /* Сколько снарядов из имеющихся сплит вообще пускает в дело. Программа
     с одного пола формально подходит и тому, у кого есть гантели, — но
     предлагать её первой человеку с гантелями странно: он сказал, чем
     располагает, и ждёт, что это используют. */
  const used = new Set(days.flatMap((d) => d.ex.map((n) => EXDB[n]?.eq).filter(Boolean)));
  const uses = gear?.length ? gear.filter((g) => used.has(g)).length : used.size;

  /* Приговор по потерянным мышцам, а не по проценту: девять замен без
     потерь — это тот же сплит другим снарядом, а две потерянные мышцы
     ломают его замысел, сколько бы упражнений ни уцелело. */
  const verdict =
    lostMuscles.length > MUSCLES_LOST_OK || keep < KEEP_MIN
      ? "poor"
      : swaps || lost.length
        ? "adapted"
        : "native";

  return { days, swaps, lost, lostMuscles, keep, uses, verdict };
}
