/* Проверка данных приложения перед сборкой.

   Тексты правятся руками — прямо на сайте GitHub или в редакторе. Опечатка
   в кавычке или потерянная запятая ломают сборку с невнятной ошибкой где-то
   в глубине сборщика. Этот скрипт проверяет данные первым и говорит
   человеческим языком, что именно не так и где.

   Запуск: npm run check */

const problems = [];
const fail = (where, what) => problems.push({ where, what });

let exercises, conditions, technique;
try {
  exercises = await import("../src/data/exercises.js");
  conditions = await import("../src/data/conditions.js");
  technique = await import("../src/data/technique.js");
} catch (e) {
  console.error("\n✗ Файл с данными не читается — скорее всего потеряна запятая или кавычка.\n");
  console.error(String(e.message).split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}

const { DB_ROWS, EXDB, PRESETS, DEFAULT_DAYS } = exercises;
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

/* ---- итог ---- */
if (problems.length) {
  console.error(`\n✗ Найдено проблем: ${problems.length}\n`);
  problems.slice(0, 40).forEach((p) => console.error(`  • ${p.where}: ${p.what}`));
  if (problems.length > 40) console.error(`  … и ещё ${problems.length - 40}`);
  console.error("");
  process.exit(1);
}

console.log(
  `✓ Данные в порядке: ${DB_ROWS.length} упражнений, ${CONDITIONS.length} состояний, ` +
    `${Object.keys(RISKS).length} с метками травм, техника у всех.`
);
