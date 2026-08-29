import { restFor } from "./rest.js";
import { hasSetTags } from "../data/tags.js";
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

/* Темп: подконтрольное повторение — это примерно две секунды вверх и две
   вниз. Раньше здесь стояло три секунды на всё повторение, и это оказалось
   заметно быстрее, чем люди в самом деле работают: тренировка из
   восемнадцати подходов давала двенадцать минут под нагрузкой вместо
   восемнадцати, а от этого зависит и плотность, и уровень МЕТ,
   и весь расход. */
const WORK_MIN_SEC = 20;
const WORK_MAX_SEC = 120;
const SEC_PER_REP = 4;

/* Метки говорят о подходе то, чего не видно по числу повторений.
   Но метка стоит на упражнении, а событие случается в подходах — и не во
   всех сразу. Поэтому они делятся на два рода.

   Свойство упражнения — техника, применённая ко всем подходам: пауза внизу
   растягивает каждое повторение, короткая амплитуда каждое укорачивает.

   Свойство отдельных подходов. «Отказ» приходится на поздние подходы:
   первые обычно рабочие, тяжело становится к концу. Точнее сказать нельзя,
   да и незачем — множитель мал, и любое правило даёт разницу в секунды.
   «Дроп-сет» по определению последний.

   Отдельная тонкость с дроп-сетом. Сброс веса чаще всего записывают
   отдельной строкой — так подсказывает и само приложение кнопкой
   «+ подход». Тогда повторения на сброшенном весе уже посчитаны, и
   множитель насчитал бы их второй раз. Распознаётся по тому, что последний
   подход легче предыдущего. */
const TAG_ALL = { pause: 1.4, partial: 0.8 };
const TAG_SET = { fail: 1.2, drop: 1.5 };

/* Растягивающие надбавки складываются с затуханием, а не берутся по
   максимуму: пауза внизу и вязкий отказ в конце — это два разных
   удлинения, и они действительно накладываются. Полная сумма при этом
   завышала бы, отсюда коэффициент. */
const blend = (list) => {
  const up = list.filter((x) => x > 1);
  const down = list.filter((x) => x < 1);
  const grow = up.length ? 1 + up.reduce((a, x) => a + (x - 1), 0) * 0.7 : 1;
  return grow * (down.length ? Math.min(...down) : 1);
};

export const tagFactor = (tags) => blend((tags || []).map((t) => TAG_ALL[t] ?? TAG_SET[t]).filter(Boolean));

/** Дроп-сет записан отдельной строкой: последний подход легче предыдущего. */
const dropLogged = (sets, i) =>
  i === sets.length - 1 && i > 0 && +sets[i].weight > 0 && +sets[i].weight < +sets[i - 1].weight;

/** Множитель для одного подхода.

    Если у подхода есть свои метки — берём их как есть, гадать не о чем.
    Если нет, запись старая: метки лежат на упражнении, и приходится
    угадывать, к какому подходу они относились. */
function setFactor(ex, i) {
  const sets = ex?.sets || [];
  if (hasSetTags(ex)) {
    const own = sets[i]?.tags || [];
    return blend(own.map((t) => TAG_ALL[t] ?? TAG_SET[t]).filter(Boolean));
  }
  const tags = ex?.tags || [];
  const all = tags.map((t) => TAG_ALL[t]).filter(Boolean);
  const mine = [];
  /* поздняя половина подходов: при четырёх — два последних, при одном — он */
  const failFrom = sets.length - Math.ceil(sets.length / 2);
  if (tags.includes("fail") && i >= failFrom) mine.push(TAG_SET.fail);
  if (tags.includes("drop") && i === sets.length - 1 && !dropLogged(sets, i)) mine.push(TAG_SET.drop);
  return blend([...all, ...mine]);
}

/** Базовая оценка подхода по темпу, без учёта того, в каком он по счёту. */
export function setWorkSec(reps, tags) {
  const r = +reps || 0;
  const base = Math.min(WORK_MAX_SEC, Math.max(WORK_MIN_SEC, Math.round(r * SEC_PER_REP)));
  return Math.round(base * tagFactor(tags));
}

/** Секунды по каждому подходу упражнения — с учётом того, где что случилось. */
export function setSecondsOf(ex) {
  const mult = ex?.uni ? 2 : 1;
  return (ex?.sets || []).map((set, i) => {
    const r = +set.reps || 0;
    const base = Math.min(WORK_MAX_SEC, Math.max(WORK_MIN_SEC, Math.round(r * SEC_PER_REP)));
    return Math.round(base * setFactor(ex, i)) * mult;
  });
}

/* Время подхода — оценка по темпу, и другого способа его узнать нет.

   Здесь стоял секундомер на каждый подход, и он казался честнее формулы.
   Оказалось наоборот. Секундомер идёт от кнопки до кнопки: лёг, взял
   гантели, сделал подход, положил, отдышался, нажал. Сколько из этого
   пришлось на саму работу, он не знает, и доля эта у каждого снаряда своя —
   в жиме ногами человек уже сидит в тренажёре, а за гантелями ещё идти.
   То есть точность он обещал, а давал завышенное число с неизвестной
   ошибкой, требуя за это нажатия на каждый подход.

   Оценка по темпу не притворяется замером и потому надёжнее: четыре
   секунды на повторение, а метки подхода поправляют её там, где темп
   заведомо другой. */

/** Одной рукой (или ногой) подход делается дважды, а повторения пишутся
    за одну сторону — как и в тоннаже. Пятнадцать подъёмов на каждую икру
    это две минуты работы, а не одна. */
export const secOfSet = (set, ex) => {
  const i = (ex?.sets || []).indexOf(set);
  return i >= 0 ? setSecondsOf(ex)[i] : setWorkSec(set.reps, ex?.tags) * (ex?.uni ? 2 : 1);
};

/** Сколько всего секунд под нагрузкой — сумма по всем подходам. */
export function workSecondsOf(workout) {
  let s = 0;
  for (const ex of workout.exercises || []) s += setSecondsOf(ex).reduce((a, b) => a + b, 0);
  return s;
}

/** Есть ли оценённые подходы с метками, растягивающими время. */
export function hasTagged(workout) {
  for (const ex of workout.exercises || []) {
    const bare = { ...ex, tags: [], sets: (ex.sets || []).map((s) => ({ ...s, tags: undefined })) };
    if (setSecondsOf(ex).some((sec, i) => sec !== setSecondsOf(bare)[i])) return true;
  }
  return false;
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
    setSecondsOf(ex).forEach((sec) => sets.push({ name: ex.name, sec }));
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
 * @returns {null|{minutes:number, source:"timer"|"estimate"|"fixed", workMin:number, workSec:number,
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
    minutes, source, workMin: Math.round(workSec / 60), workSec,
    uniEstimate: hasUniEstimate(workout), tagged: hasTagged(workout), density, level,
    gross, rest, net: Math.max(0, gross - rest), bodyKg: w.kg, weightDate: w.date,
  };
}
