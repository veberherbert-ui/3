/* Проверка собранных файлов на нижнюю планку браузеров.

   Проверять исходники бесполезно: в них можно писать что угодно, вопрос
   в том, что осталось после сборщика. А ошибка здесь особенно подлая —
   телефон, который не разобрал файл, не показывает ни ошибки, ни строчки
   в консоли: до выполнения дело не доходит вовсе. Белый экран без единой
   зацепки. Такое в этом проекте уже случалось.

   Двух планок здесь две, и они разные нарочно.

   Код держим низко, на es2018. Это стоит нескольких лишних килобайт, зато
   страница разбирается даже там, где приложение всё равно не заработает
   как надо, — а значит работают экран поломки и самопочинка, и человек
   видит объяснение вместо пустоты.

   Оформление держать так же низко не выйдет: Tailwind выдаёт :where()
   и промежутки во flex, а это Safari 14.1. Ниже приложение открывается
   и считает верно, но выглядит криво. Врать про Safari 12 хуже, чем
   честно назвать 14.1, поэтому здесь названа она.

   Запуск: после vite build, см. npm run build */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const fail = (where, what) => problems.push({ where, what });

const DIR = "dist/assets";
let files;
try {
  files = readdirSync(DIR);
} catch {
  console.error(`✗ Нет папки ${DIR} — сборка не выполнялась`);
  process.exit(1);
}

const js = files.filter((f) => f.endsWith(".js"));
const css = files.filter((f) => f.endsWith(".css"));
if (!js.length) fail("сборка", "в сборке нет ни одного файла с кодом");
if (!css.length) fail("сборка", "в сборке нет ни одного файла оформления");

/* ---- код ---- */
/* Синтаксис, который старый разборщик не проглотит. Ищем как есть, без
   регулярных выражений: после сжатия пробелов вокруг операторов нет. */
const JS_BANNED = [
  ["??=", "логическое присваивание — Safari 14"],
  ["||=", "логическое присваивание — Safari 14"],
  ["&&=", "логическое присваивание — Safari 14"],
  ["(?<", "ретроспективная проверка в выражении — Safari 16.4"],
  ["static{", "статический блок класса — Safari 16.4"],
  [".at(", "Array.prototype.at — Safari 15.4"],
  ["toSorted(", "Array.prototype.toSorted — Safari 16"],
  ["findLast(", "Array.prototype.findLast — Safari 15.4"],
];

js.forEach((f) => {
  const src = readFileSync(join(DIR, f), "utf8");
  JS_BANNED.forEach(([needle, why]) => {
    if (src.includes(needle)) fail("код", `${f}: ${needle} — ${why}, а сборка объявлена с es2018`);
  });
});

/* Возможности, которых у старого браузера может не быть. Это не ошибка
   сборки: часть из них приходит из библиотек и живёт в отдельных кусках,
   которые грузятся по требованию. Но знать о них надо — каждая такая
   строчка обязана быть под оградой (см. Boundary в src/App.jsx), иначе
   она уносит всё приложение. */
const JS_NOTE = [
  ["structuredClone", "Safari 15.4"],
  ["Object.hasOwn", "Safari 15.4"],
  ["replaceAll(", "Safari 13.1"],
  ["Promise.any", "Safari 14"],
];

/* Дописанное вручную. Полифил снимает вопрос целиком: возможность есть
   всюду, где приложение вообще запускается, — и отчёт не должен пугать
   тем, что уже решено. Ищем по строке, которую оставляет сжатие
   (см. src/main.jsx). */
const all = js.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");
const FILLED = [["Object.hasOwn", 'defineProperty(Object,"hasOwn"']];
const filled = new Set(FILLED.filter(([, mark]) => all.includes(mark)).map(([name]) => name));

const notes = [];
js.forEach((f) => {
  const src = readFileSync(join(DIR, f), "utf8");
  JS_NOTE.forEach(([needle, since]) => {
    if (filled.has(needle)) return;
    const n = src.split(needle).length - 1;
    if (n) notes.push(`${f}: ${needle} ×${n} — с ${since}`);
  });
});

/* ---- оформление ---- */
/* Единицы dvh/svh/lvh появились в Safari 15.4. Браузер, который их не знает,
   выбрасывает строку целиком — и оболочка приложения остаётся без высоты:
   нижние вкладки перестают быть прижатыми, середина схлопывается.
   Поэтому у каждого такого правила обязан быть запасной вариант в vh. */
css.forEach((f) => {
  const src = readFileSync(join(DIR, f), "utf8");

  /* Собираем правила по селектору: запасной вариант может лежать
     в отдельном правиле с тем же селектором, и это законно. */
  const bySelector = new Map();
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    bySelector.set(sel, (bySelector.get(sel) || "") + m[2]);
  }
  for (const [sel, body] of bySelector) {
    if (!/\d(dvh|svh|lvh)\b/.test(body)) continue;
    if (!/\d(vh|px|rem|%)\b/.test(body.replace(/\d(dvh|svh|lvh)\b/g, "")))
      fail("оформление", `${f}: у «${sel}» есть dvh, но нет запасной высоты — до Safari 15.4 правило пропадёт целиком`);
  }

  const CSS_BANNED = [
    [":has(", "Safari 15.4"],
    ["color-mix(", "Safari 16.2"],
    ["oklch(", "Safari 15.4"],
    ["@container", "Safari 16"],
    ["text-wrap:balance", "Safari 17.5"],
  ];
  CSS_BANNED.forEach(([needle, since]) => {
    if (src.includes(needle)) fail("оформление", `${f}: ${needle} — ${since}, а объявлена нижняя планка Safari 14.1`);
  });
});

if (problems.length) {
  console.error(`\n✗ Сборка не годится для объявленных браузеров: ${problems.length}\n`);
  problems.forEach((p) => console.error(`  • ${p.where}: ${p.what}`));
  console.error("");
  process.exit(1);
}

console.log(
  `✓ Сборка по планке: код разбирается с es2018, оформление работает с Safari 14.1 ` +
    `(${js.length} ${js.length === 1 ? "файл" : "файлов"} кода, ${css.length} оформления).`
);
if (filled.size) console.log(`  Дописано вручную, планку не поднимает: ${[...filled].join(", ")}`);
if (notes.length) {
  console.log("  Требует браузера посвежее — держим под оградой:");
  notes.forEach((n) => console.log(`    ${n}`));
}
