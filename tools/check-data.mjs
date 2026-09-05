/* Проверка данных приложения перед сборкой.

   Тексты правятся руками — прямо на сайте GitHub или в редакторе. Опечатка
   в кавычке или потерянная запятая ломают сборку с невнятной ошибкой где-то
   в глубине сборщика. Этот скрипт проверяет данные первым и говорит
   человеческим языком, что именно не так и где.

   Запуск: npm run check */

import { readFileSync } from "node:fs";

const problems = [];
const fail = (where, what) => problems.push({ where, what });

let exercises, conditions, technique, calc, energy;
try {
  exercises = await import("../src/data/exercises.js");
  conditions = await import("../src/data/conditions.js");
  technique = await import("../src/data/technique.js");
  calc = await import("../src/lib/calc.js");
  energy = await import("../src/lib/energy.js");
} catch (e) {
  console.error("\n✗ Файл с данными не читается — скорее всего потеряна запятая или кавычка.\n");
  console.error(String(e.message).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}

const { DB_ROWS, EXDB, PRESETS, DEFAULT_DAYS, BW_SHARE, BW_STATIC, GEAR_PRESETS, MOVES, moveOf } = exercises;
const { CONDITIONS, RISKS, PREFERRED_SWAPS, HELPFUL } = conditions;
const { TECHNIQUE } = technique;

const known = new Set(Object.keys(EXDB));
const condIds = new Set(CONDITIONS.map((c) => c.id));

/* ---- база упражнений ---- */
const seen = new Set();
DB_ROWS.forEach((row, i) => {
  const [name, g, m, eq] = row;
  if (row.length < 6) fail(`база, строка ${i + 1}`, `у «${name}» не хватает полей — должно быть 7`);
  if (seen.has(name)) fail("база", `«${name}» встречается дважды`);
  seen.add(name);
  if (!g || !m || !eq) fail("база", `у «${name}» пустая группа, мышца или оборудование`);
});

/* ---- ссылки на упражнения ---- */
const checkRef = (name, where) => {
  if (!known.has(name)) fail(where, `упражнения «${name}» нет в базе — опечатка в названии?`);
};
Object.entries(PRESETS).forEach(([key, p]) =>
  p.days.forEach((d) => d.ex.forEach((n) => checkRef(n, `готовый сплит «${key}» → ${d.name}`)))
);
DEFAULT_DAYS.forEach((d) => d.exercises.forEach((n) => checkRef(n, `день по умолчанию «${d.name}»`)));
Object.keys(RISKS).forEach((n) => checkRef(n, "метки травм"));
Object.entries(PREFERRED_SWAPS).forEach(([from, list]) => {
  checkRef(from, "готовые замены");
  list.forEach((n) => checkRef(n, `готовые замены для «${from}»`));
});
Object.entries(HELPFUL).forEach(([cid, map]) => {
  if (!condIds.has(cid)) fail("полезные упражнения", `неизвестное состояние «${cid}»`);
  Object.keys(map).forEach((n) => checkRef(n, `полезные при «${cid}»`));
});

/* ---- состояния здоровья ---- */
CONDITIONS.forEach((c) => {
  ["name", "hint", "guide", "stop"].forEach((f) => {
    if (!c[f] || !String(c[f]).trim()) fail(`состояние «${c.id}»`, `не заполнено поле ${f}`);
  });
});
Object.entries(RISKS).forEach(([name, map]) =>
  Object.entries(map).forEach(([cid, val]) => {
    if (!condIds.has(cid)) fail(`метки травм у «${name}»`, `неизвестное состояние «${cid}»`);
    const level = val?.[0];
    if (level !== 1 && level !== 2) fail(`метки травм у «${name}»`, `степень должна быть 1 или 2, а не «${level}»`);
  })
);

/* ---- техника ---- */
known.forEach((n) => {
  const t = TECHNIQUE[n];
  if (!t) {
    fail("техника", `у «${n}» нет описания техники`);
    return;
  }
  ["setup", "exec", "breath"].forEach((f) => {
    if (!t[f] || !t[f].trim()) fail(`техника «${n}»`, `не заполнено поле ${f}`);
  });
  ["cues", "mistakes"].forEach((f) => {
    if (!Array.isArray(t[f]) || !t[f].length) fail(`техника «${n}»`, `${f} должен быть непустым списком`);
    else if (t[f].some((x) => !x || !String(x).trim())) fail(`техника «${n}»`, `в списке ${f} есть пустая строка`);
  });
});
Object.keys(TECHNIQUE).forEach((n) => checkRef(n, "техника"));

/* ---- движения ---- */
/* Упражнение без движения выпадает из группировки в списках и из подсказки
   «то же движение на другом снаряде» — молча и незаметно. */
Object.keys(EXDB).forEach((n) => {
  if (!moveOf(n)) fail("движения", `«${n}» не отнесено ни к одному движению — допиши его в MOVES`);
});
Object.entries(MOVES).forEach(([move, list]) => {
  list.forEach((n) => checkRef(n, `движение «${move}»`));
  const dup = list.filter((n, i) => list.indexOf(n) !== i);
  if (dup.length) fail(`движение «${move}»`, `повторяется: ${dup.join(", ")}`);
});

/* ---- упражнения со своим весом ---- */
/* Без доли веса тела такое упражнение молча даёт нулевой тоннаж — самая
   незаметная поломка из возможных: цифры есть, просто неправильные. */
Object.entries(EXDB).forEach(([name, info]) => {
  if (!info.bw) return;
  const share = BW_SHARE[name];
  if (share == null && !BW_STATIC.has(name))
    fail("свой вес", `у «${name}» нет доли веса тела — добавь в BW_SHARE или в BW_STATIC, если это статика`);
  if (share != null && (share <= 0.15 || share > 1))
    fail("свой вес", `доля веса тела у «${name}» — ${share}; ожидается от 0,2 до 1`);
});
Object.keys(BW_SHARE).forEach((name) => {
  if (!EXDB[name]) fail("свой вес", `«${name}» есть в BW_SHARE, но нет в базе — опечатка в названии?`);
  else if (!EXDB[name].bw) fail("свой вес", `«${name}» помечено долей веса тела, но выполняется не своим весом`);
});

/* ---- готовые сплиты и инвентарь ---- */
/* Каждому набору инвентаря должен подходить хотя бы один сплит как есть.
   Иначе человек без зала открывает список и видит одни зачёркнутые
   варианты — приложение честное, но бесполезное. */
{
  const { adaptPreset } = await import("../src/lib/fitplan.js");
  GEAR_PRESETS.forEach((pr) => {
    const gear = pr.id === "all" ? [] : pr.gear;
    const fits = Object.entries(PRESETS)
      .map(([k, p]) => [k, adaptPreset(p, gear)])
      .filter(([, f]) => f.verdict === "native");
    if (!fits.length)
      fail("готовые сплиты", `для набора «${pr.label}» нет ни одного подходящего сплита — нужен свой`);
  });
  /* Сплит, помеченный своим инвентарём, обязан ему подходить: иначе метка
     врёт, и подгонка будет чинить то, что и так задумано. */
  Object.entries(PRESETS).forEach(([key, p]) => {
    if (!p.gear) return;
    const f = adaptPreset(p, p.gear);
    if (f.verdict !== "native")
      fail("готовые сплиты", `«${p.name}» помечен своим инвентарём, но сам ему не подходит (замен ${f.swaps}, потеряно ${f.lost.length})`);
  });
}

/* ---- правила подсчёта ---- */
/* Одной рукой подход делается дважды, а повторения пишутся за одну сторону.
   Это должно удваивать и тоннаж, и время под нагрузкой — раньше удваивался
   только тоннаж, и унилатеральные упражнения занижали расход вдвое. */
{
  const set = { reps: 12, weight: 20 };
  const plain = { name: "тест", sets: [set] };
  const uni = { name: "тест", uni: true, sets: [set] };

  if (calc.exTonnage(uni) !== calc.exTonnage(plain) * 2)
    fail("подсчёт", "тоннаж одной рукой должен считаться за две стороны");
  if (energy.secOfSet(set, uni) !== energy.secOfSet(set, plain) * 2)
    fail("подсчёт", "время под нагрузкой одной рукой должно считаться за две стороны");
  /* Две гантели — это два снаряда одновременно, а не два подхода подряд. */
  const pair = { name: "тест", pair: true, sets: [set] };
  if (energy.secOfSet(set, pair) !== energy.secOfSet(set, plain))
    fail("подсчёт", "две гантели работают одновременно — время удваивать не нужно");

  /* Метки говорят о подходе то, чего не видно по числу повторений. */
  const four = (w) => [1, 2, 3, 4].map(() => ({ reps: 12, weight: w }));
  const secs = (tags, sets = four(20)) => energy.setSecondsOf({ name: "тест", tags, sets });
  const plainFour = secs([]);

  /* «Отказ» — свойство поздних подходов, а не всех: первые обычно рабочие. */
  const failed = secs(["fail"]);
  if (failed[0] !== plainFour[0]) fail("подсчёт", "отказ не должен растягивать первые подходы");
  if (failed[3] <= plainFour[3]) fail("подсчёт", "отказ должен растягивать поздние подходы");
  if (failed[1] !== plainFour[1] || failed[2] === plainFour[2])
    fail("подсчёт", "отказ приходится на позднюю половину подходов");

  /* «Дроп-сет» — только последний подход. */
  const dropped = secs(["drop"]);
  if (dropped[2] !== plainFour[2]) fail("подсчёт", "дроп-сет не должен трогать подходы до последнего");
  if (dropped[3] <= plainFour[3]) fail("подсчёт", "дроп-сет растягивает последний подход");

  /* Сброс, записанный отдельной строкой, уже посчитан повторениями —
     множитель насчитал бы их второй раз. */
  const loggedDrop = [...four(20).slice(0, 3), { reps: 12, weight: 15 }];
  if (secs(["drop"], loggedDrop)[3] !== secs([], loggedDrop)[3])
    fail("подсчёт", "дроп, записанный отдельной строкой, не должен считаться дважды");

  /* Пауза и частичные — свойство всего упражнения. */
  if (secs(["pause"]).some((v, i) => v <= plainFour[i]))
    fail("подсчёт", "пауза растягивает каждый подход");
  if (secs(["partial"]).some((v, i) => v >= plainFour[i]))
    fail("подсчёт", "частичные укорачивают каждый подход");

  /* Разные удлинения накладываются, но с затуханием: сумма завышала бы,
     максимум занижал. */
  const both = secs(["pause", "fail"])[3];
  if (!(both > secs(["pause"])[3] && both < secs(["pause"])[3] * 1.2))
    fail("подсчёт", "пауза и отказ должны складываться с затуханием");

  /* Читинг и «был запас» — про скорость, а не про длительность. */
  if (secs(["easy", "cheat"]).some((v, i) => v !== plainFour[i]))
    fail("подсчёт", "читинг и «был запас» время подхода не меняют");

  /* Секундомера на подходах больше нет: он мерял подход от кнопки до кнопки,
     вместе с обращением со снарядом, и выдавал это за время под нагрузкой.
     В старых записях поле осталось — его надо тихо игнорировать, а не
     воскрешать прежнее поведение. */
  if (energy.secOfSet({ reps: 12, weight: 20, sec: 200 }, plain) !== energy.secOfSet(set, plain))
    fail("подсчёт", "замер из старых записей не должен влиять на расчёт");
}

/* ---- рабочие подходы и переход к следующему весу ---- */
/* Правило «во всех подходах верх диапазона» ломается на живой тренировке,
   а разовая проверка на тяжёлом весе не должна затыкать совет. */
{
  const { weightAdvice, workingSets } = await import("../src/lib/progress.js");
  const ex = (ss, tags) => ({ name: "Жим гантелей лёжа (горизонт)", tags, sets: ss.map(([reps, weight]) => ({ reps, weight })) });

  /* Тяжёлый выброс не рабочий подход: он не в счёт ни за, ни против. */
  const withProbe = ex([[15, 80], [15, 75], [15, 80], [6, 100]], []);
  if (workingSets(withProbe).length !== 3)
    fail("подсчёт", "разовый тяжёлый подход не должен попадать в рабочие");
  if (!weightAdvice(withProbe)?.add)
    fail("подсчёт", "проверка на тяжёлом весе не должна затыкать совет про вес");

  /* Дроп на меньшем весе — тоже не рабочий подход. */
  if (workingSets(ex([[12, 24], [12, 24], [12, 24], [12, 20]], [])).length !== 3)
    fail("подсчёт", "сброс веса на дроп-сете не должен попадать в рабочие");

  /* Объём на рабочем весе, а не каждый подход по отдельности: 12+19+8 это
     тридцать девять повторений против тридцати шести нужных. */
  if (!weightAdvice(ex([[12, 24], [19, 24], [8, 24]], []))?.add)
    fail("подсчёт", "объём на рабочем весе выбран — совет должен сработать");
  if (weightAdvice(ex([[12, 24], [12, 24], [11, 24]], [])))
    fail("подсчёт", "не дотянул до объёма — совет должен молчать");
  /* Один огромный подход и два развалившихся — не выполненная цель. */
  if (weightAdvice(ex([[30, 24], [3, 24], [3, 24]], [])))
    fail("подсчёт", "развалившиеся подходы не считаются выполненной целью");
}

/* ---- расчётный максимум ---- */
/* Выше двенадцати повторений формулы разъезжаются настолько, что рабочий
   подход обгоняет тяжёлый. */
{
  const set = (reps, weight) => ({ reps, weight });
  const heavy = calc.est1RM({ sets: [set(6, 100)] });
  const light = calc.est1RM({ sets: [set(15, 80)] });
  if (light != null && heavy != null && light > heavy)
    fail("подсчёт", "пятнадцать по восемьдесят не должны давать максимум выше шести по сто");
  if (calc.est1RM({ sets: [set(15, 80)] }) != null)
    fail("подсчёт", "подходы выше двенадцати повторений в расчёт максимума не берутся");
}

/* ---- снимки для окна установки ---- */
/* Манифест обещает браузеру снимки с точными размерами. Обещание, которое
   не сходится, хром не прощает: он молча отбрасывает весь список и снова
   предлагает установку узкой полоской — то есть поломка выглядит ровно
   как её отсутствие, и заметить её на глаз невозможно.

   Требования браузера: файл на месте, размеры совпадают с заявленными,
   все снимки одного размера, сторона не длиннее другой больше чем в 2,3 раза. */
{
  const cfg = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  const shots = [...cfg.matchAll(/src: "(screenshots\/[^"]+)", sizes: "(\d+)x(\d+)"/g)]
    .map(([, src, w, h]) => ({ src, w: +w, h: +h }));

  if (!shots.length) fail("установка", "в манифесте нет снимков экрана — хром покажет установку узкой полоской");

  const sizes = new Set();
  shots.forEach(({ src, w, h }) => {
    const file = new URL("../public/" + src, import.meta.url);
    let real;
    try {
      const buf = readFileSync(file);
      /* PNG: ширина и высота лежат в первом блоке, по смещениям 16 и 20 */
      if (buf.subarray(1, 4).toString() !== "PNG") throw new Error("не PNG");
      real = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    } catch {
      fail("установка", `снимка ${src} нет или он не читается — обнови их командой npm run shots`);
      return;
    }
    if (real.w !== w || real.h !== h)
      fail("установка", `${src}: в манифесте ${w}×${h}, на деле ${real.w}×${real.h} — обнови манифест или снимки`);
    sizes.add(`${real.w}x${real.h}`);
    const ratio = Math.max(real.w, real.h) / Math.min(real.w, real.h);
    if (ratio > 2.3) fail("установка", `${src}: соотношение сторон ${ratio.toFixed(2)} — браузер берёт до 2.3`);
    if (Math.min(real.w, real.h) < 320) fail("установка", `${src}: сторона меньше 320 пикселей — браузер такой снимок не возьмёт`);
  });
  if (sizes.size > 1)
    fail("установка", `снимки разного размера (${[...sizes].join(", ")}) — браузер принимает только одинаковые`);
}

if (problems.length) {
  console.error(`\n✗ Найдено проблем: ${problems.length}\n`);
  problems.slice(0, 40).forEach((p) => console.error(`  • ${p.where}: ${p.what}`));
  if (problems.length > 40) console.error(`  … и ещё ${problems.length - 40}`);
  console.error("");
  process.exit(1);
}

console.log(
  `✓ Данные в порядке: ${DB_ROWS.length} упражнений, ${CONDITIONS.length} состояний, ` +
    `${Object.keys(RISKS).length} с метками травм, техника у всех, ` +
    `${Object.keys(BW_SHARE).length} со своим весом в тоннаже, ` +
    `${Object.keys(MOVES).length} движений.`
);

/* Что остаётся доступным при каждом наборе инвентаря. Не ошибка, а сводка:
   она сразу показывает, какие мышцы нечем нагрузить дома — и куда дописывать
   упражнения в следующий раз. */
const muscles = [...new Set(Object.values(EXDB).map((i) => i.m))];
GEAR_PRESETS.forEach((pr) => {
  const list = Object.entries(EXDB).filter(([, i]) => !pr.gear.length || pr.gear.includes(i.eq));
  const covered = new Set(list.map(([, i]) => i.m));
  const gap = muscles.filter((m) => !covered.has(m));
  console.log(
    `  ${pr.label.padEnd(24)} ${String(list.length).padStart(3)} упр · ${covered.size}/${muscles.length} мышц` +
      (gap.length ? ` · нечем: ${gap.join(", ")}` : "")
  );
});
