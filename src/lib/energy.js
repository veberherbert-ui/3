import { restFor } from "./rest.js";
import { weightNear } from "./calc.js";

/* Расход калорий за конкретную тренировку.

   Общий калькулятор «минуты × плотность» отвечал на вопрос, который никто
   не задаёт: сколько сожжёт абстрактная часовая тренировка. Полезен другой —
   сколько сожгла вот эта, во вторник. Всё нужное для ответа в записи уже
   есть: подходы, повторения, упражнения, часто и время с таймера.

   Считается по MET — во сколько раз движение затратнее лежания. Формула
   стандартная: ккал/мин = MET × 3,5 × вес(кг) / 200. Число приблизительное
   по своей природе: разброс между людьми одного веса доходит до трети.
   Поэтому здесь показывается не только итог, но и весь ход расчёта —
   видно, откуда взялась каждая цифра, и с чем спорить. */

/** Темп: около трёх секунд на повторение, но подход не бывает мгновенным. */
const WORK_MIN_SEC = 20;
const WORK_MAX_SEC = 90;
const SEC_PER_REP = 3;

export function setWorkSec(reps) {
  const r = +reps || 0;
  return Math.min(WORK_MAX_SEC, Math.max(WORK_MIN_SEC, Math.round(r * SEC_PER_REP)));
}

/* Время подхода: замеренное секундомером, если его включали, иначе оценка
   по темпу. Замер всегда точнее — три секунды на повторение это средняя
   температура, а подход в отказ с паузами идёт вдвое дольше.

   Одной рукой (или ногой) подход делается дважды, а повторения пишутся за
   одну сторону — как и в тоннаже. Оценку поэтому удваиваем: пятнадцать
   подъёмов на каждую икру это две минуты под нагрузкой, а не одна. Замер
   не трогаем: секундомер шёл через обе стороны и уже знает правду. */
export const secOfSet = (set, ex) =>
  +set.sec > 0 ? +set.sec : setWorkSec(set.reps) * (ex?.uni ? 2 : 1);

/** Сколько всего секунд под нагрузкой — сумма по всем подходам. */
export function workSecondsOf(workout) {
  let s = 0;
  for (const ex of workout.exercises || []) for (const set of ex.sets || []) s += secOfSet(set, ex);
  return s;
}

/** Доля подходов, время которых замерено секундомером, а не оценено. */
export function measuredShare(workout) {
  let all = 0, timed = 0;
  for (const ex of workout.exercises || []) for (const set of ex.sets || []) { all++; if (+set.sec > 0) timed++; }
  return all ? timed / all : 0;
}

/** Есть ли в тренировке оценённые подходы одной рукой — их время удвоено,
    и в разборе расчёта об этом стоит сказать, иначе цифра выглядит завышенной. */
export function hasUniEstimate(workout) {
  for (const ex of workout.exercises || [])
    if (ex.uni) for (const set of ex.sets || []) if (!(+set.sec > 0)) return true;
  return false;
}

export function setsCountOf(workout) {
  let n = 0;
  for (const ex of workout.exercises || []) n += (ex.sets || []).length;
  return n;
}

/**
 * Оценка длительности, когда таймер не отработал: подходы плюс отдых
 * между ними. После последнего подхода отдых не считается — он уже дома.
 */
export function estimateSeconds(workout, restOverrides) {
  let total = 0;
  const sets = [];
  for (const ex of workout.exercises || [])
    for (const set of ex.sets || []) sets.push({ name: ex.name, sec: secOfSet(set, ex) });
  sets.forEach((s, i) => {
    total += s.sec;
    if (i < sets.length - 1) total += restFor(s.name, restOverrides);
  });
  return total;
}

/* Плотность — доля времени под нагрузкой. Она же и есть та самая
   «интенсивность», которую раньше приходилось выбирать вручную: час с
   пятиминутными разговорами между подходами и час без передышки — разные
   тренировки, и запись это знает лучше, чем память.

   Значения MET по Компендиуму физической активности: силовая работа
   в спокойном темпе — 3,5, обычная — 5,0, плотная или с тяжёлой базой — 6,0. */
export const LEVELS = [
  { id: "light", label: "спокойно", met: 3.5, upTo: 0.18 },
  { id: "moderate", label: "обычно", met: 5.0, upTo: 0.3 },
  { id: "hard", label: "плотно", met: 6.0, upTo: Infinity },
];

export function levelFor(density) {
  return LEVELS.find((l) => density < l.upTo) || LEVELS[LEVELS.length - 1];
}

/**
 * Полный расчёт по одной тренировке.
 * @returns {null|{minutes:number, source:"timer"|"estimate"|"fixed", workMin:number, measured:number,
 *   uniEstimate:boolean, density:number, level:object, gross:number, rest:number, net:number,
 *   bodyKg:number, weightDate:string}}
 */
export function workoutEnergy(workout, { metrics, bmr, restOverrides } = {}) {
  if (!workout) return null;
  const w = weightNear(metrics, workout.date);
  if (!w) return null;

  const workSec = workSecondsOf(workout);
  const recorded = workout.durationMin ? workout.durationMin * 60 : 0;
  /* Записанное время короче времени под нагрузкой — физически невозможно:
     таймер не отработал, тренировку записали задним числом или сессию
     перезапустили. Такой цифре верить нельзя, считаем по подходам. */
  const source = !recorded ? "estimate" : recorded < workSec ? "fixed" : "timer";
  const seconds = source === "timer" ? recorded : estimateSeconds(workout, restOverrides);
  const minutes = Math.max(1, Math.round(seconds / 60));

  const density = Math.min(1, workSec / (minutes * 60));
  const level = levelFor(density);

  const gross = Math.round((level.met * 3.5 * w.kg / 200) * minutes);
  /* Вычитаем то, что тело сожгло бы за это же время лёжа: иначе расход
     тренировки складывается с суточной нормой дважды. */
  const rest = bmr ? Math.round((bmr / 1440) * minutes) : 0;

  return {
    minutes, source, workMin: Math.round(workSec / 60), measured: measuredShare(workout),
    uniEstimate: hasUniEstimate(workout), density, level,
    gross, rest, net: Math.max(0, gross - rest), bodyKg: w.kg, weightDate: w.date,
  };
}
