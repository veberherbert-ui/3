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
 *   lostMuscles:string[], keep:number, verdict:"native"|"adapted"|"poor"}}
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

  /* Приговор по потерянным мышцам, а не по проценту: девять замен без
     потерь — это тот же сплит другим снарядом, а две потерянные мышцы
     ломают его замысел, сколько бы упражнений ни уцелело. */
  const verdict =
    lostMuscles.length > MUSCLES_LOST_OK || keep < KEEP_MIN
      ? "poor"
      : swaps || lost.length
        ? "adapted"
        : "native";

  return { days, swaps, lost, lostMuscles, keep, verdict };
}
