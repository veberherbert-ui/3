/* Сквозная проверка собранного приложения в мобильном браузере.

   Запуск:
     npm run build
     npx http-server dist -p 4173 -a 127.0.0.1 --silent &
     node tools/smoke.mjs

   Playwright нужен только для этой проверки и не входит в зависимости
   приложения: npm i -D playwright && npx playwright install chromium

   Проверяются те места, где уже ловились настоящие ошибки: порядок хуков
   при старте сессии, локальные даты, перекрытие всплывающих листов,
   работа без сети. */

const URL = process.env.SMOKE_URL || "http://127.0.0.1:4173/";

let chromium, devices;
try {
  ({ chromium, devices } = await import("playwright"));
} catch {
  console.error("Нужен playwright: npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

let failed = 0;
const ok = (cond, label, extra = "") => {
  if (!cond) failed++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra ? " — " + extra : ""}`);
};
const section = (t) => console.log(`\n── ${t} ──`);

const browser = await chromium.launch();
const TZ = "Europe/Moscow";
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ru-RU", timezoneId: TZ });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

const dbRead = (key) => page.evaluate(async (k) => {
  const db = await new Promise((r) => { const q = indexedDB.open("iron-diary"); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => r(t.result); });
}, key);

/* Дата считается в часовом поясе браузера, а не машины с тестом.
   Иначе поздним вечером по Москве узел ещё во «вчера» по UTC, и проверка
   «дата по умолчанию — вчера» падает на разнице в сутки. */
const daysAgoISO = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};

/* Нижняя панель — набор вкладок (role="tablist"), а не пять кнопок подряд:
   диктору так понятно, что выбрано и сколько всего разделов. */
const tab = async (name) => {
  await page.getByRole("tab", { name, exact: true }).click();
  await page.waitForTimeout(500);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

section("Загрузка и вкладки");
ok((await page.title()) === "Железный дневник", "заголовок страницы");

/* экран первого запуска с ограничениями */
ok(await page.getByText("Это не медицина").isVisible(), "показан экран с ограничениями");
await page.getByRole("button", { name: /Понятно, начать/ }).click();
await page.waitForTimeout(700);
ok(!(await page.getByText("Это не медицина").isVisible().catch(() => false)), "после принятия экран не мешает");

/* Знакомство: без роста, веса и возраста половина расчётов пустая,
   поэтому их спрашивают сразу, а не прячут во вкладку «Тело». */
ok(await page.getByText("Пара чисел о вас").isVisible(), "после условий спрашивают рост, вес, возраст");
await page.getByRole("spinbutton", { name: "Рост, см" }).fill("180");
await page.getByRole("spinbutton", { name: "Вес, кг" }).fill("82");
await page.getByRole("spinbutton", { name: "Возраст, лет" }).fill("35");
await page.getByRole("button", { name: /Сохранить и начать/ }).click();
await page.waitForTimeout(800);
ok(!(await page.getByText("Пара чисел о вас").isVisible().catch(() => false)), "знакомство показывается один раз");
ok((await dbRead("profile"))?.height === "180", "рост сохранён в профиль");
ok(+(await dbRead("metrics"))?.[0]?.weight === 82, "вес лёг первым замером");
for (const t of ["Сессия", "Журнал", "Графики", "База", "Тело"]) {
  await tab(t);
  const el = page.getByRole("tab", { name: t, exact: true });
  ok(await el.isVisible(), `вкладка «${t}» открывается`);
  ok((await el.getAttribute("aria-selected")) === "true", `вкладка «${t}» помечена выбранной`);
}
ok(await page.locator('[role="tablist"]').isVisible(), "панель вкладок объявлена как tablist");
ok(await page.locator('[role="tabpanel"]').isVisible(), "содержимое объявлено как панель вкладки");

section("Тренировка");
await tab("Сессия");
await page.getByRole("button", { name: /Начать тренировку/ }).click();
await page.waitForTimeout(700);
ok(await page.getByRole("button", { name: /Завершить и сохранить/ }).first().isVisible(), "сессия стартовала (порядок хуков цел)");

/* у разных упражнений разное время отдыха */
const rests = (await page.locator("div.f-body").filter({ hasText: "отдых" }).allInnerTexts())
  .map((t) => t.match(/отдых\s+(\S+)/)?.[1])
  .filter(Boolean);
ok(rests.length > 1 && new Set(rests).size > 1, "время отдыха различается по упражнениям", rests.join(", "));

await page.getByPlaceholder("повт").first().fill("10");
await page.getByPlaceholder("кг").first().fill("40");
await page.getByRole("button", { name: /^Подход 1/ }).first().click();
await page.waitForTimeout(1000);

const restBig = await page.locator(".f-num.text-4xl").first().textContent().catch(() => null);
ok(!!restBig, "полоса отдыха с крупным счётчиком", restBig || "");
const clock = await page.locator(".f-num.text-3xl").first().textContent().catch(() => null);
ok(!!clock, "крупные часы тренировки", clock || "");

/* отдых переживает перезагрузку */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const restAfter = await page.locator(".f-num.text-4xl").first().textContent().catch(() => null);
ok(!!restAfter && restAfter !== restBig, "отдых продолжается после перезапуска", `${restBig} → ${restAfter}`);

await page.getByRole("button", { name: /Завершить и сохранить/ }).first().click();
await page.waitForTimeout(1200);

section("Сохранение");
const saved = await dbRead("workouts");
ok(saved?.length === 1, "тренировка записана в IndexedDB");
const localDate = await page.evaluate(() => {
  const p = (n) => String(n).padStart(2, "0");
  const d = new Date();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});
ok(saved?.[0]?.date === localDate, "дата локальная, а не UTC", `${saved?.[0]?.date} = ${localDate}`);
ok(saved?.[0]?.exercises?.[0]?.sets?.[0]?.weight === 40, "подход сохранён верно");

section("Правка записи");
await page.locator("text=Грудь + Бицепс").first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Изменить/ }).click();
await page.waitForTimeout(600);
ok(await page.getByText("Правка тренировки").isVisible(), "лист правки открылся");
await page.getByPlaceholder("кг").first().fill("45");
await page.getByRole("button", { name: /Сохранить изменения/ }).click();
await page.waitForTimeout(1000);
const edited = await dbRead("workouts");
ok(edited?.[0]?.exercises?.[0]?.sets?.[0]?.weight === 45, "вес исправлен");
ok(edited?.[0]?.id === saved?.[0]?.id, "запись та же, не создалась новая");

section("Мелочи");
/* необратимые действия должны спрашивать подтверждение */
await tab("Журнал");
/* карточка могла остаться раскрытой после правки — разворачиваем только если закрыта */
if (!(await page.getByRole("button", { name: /Изменить/ }).isVisible().catch(() => false))) {
  await page.locator("text=Грудь + Бицепс").first().click();
  await page.waitForTimeout(500);
}
await page.getByRole("button", { name: /Удалить/ }).first().click();
await page.waitForTimeout(400);
ok(await page.getByText("Удалить тренировку?").isVisible(), "удаление спрашивает подтверждение");
await page.getByRole("button", { name: "Нет", exact: true }).click();
await page.waitForTimeout(400);
ok((await dbRead("workouts"))?.length === 1, "отказ ничего не удалил");

/* в интерфейсе не должно остаться упоминаний Claude */
const journalText = await page.locator("body").innerText();
ok(!/claude/i.test(journalText), "в журнале нет упоминаний Claude");

/* повтор прошлой тренировки и добавление упражнения на ходу */
await tab("Сессия");
ok(await page.getByRole("button", { name: /Повторить прошлую/ }).isVisible(), "есть кнопка повтора прошлой тренировки");
await page.getByRole("button", { name: /Повторить прошлую/ }).click();
await page.waitForTimeout(800);
const before = await page.locator("button:has-text('+ подход')").count();
await page.getByRole("button", { name: /Добавить упражнение/ }).click();
await page.waitForTimeout(600);
await page.getByPlaceholder(/Поиск по названию/).fill("фейспул");
await page.waitForTimeout(500);
await page.getByText("Фейспул", { exact: false }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Готово" }).click();
await page.waitForTimeout(600);
const after = await page.locator("button:has-text('+ подход')").count();
ok(after === before + 1, "упражнение добавилось в идущую тренировку", `${before} → ${after}`);
await page.locator('button[aria-label="Ещё действия"]').first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Прервать без сохранения/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Да", exact: true }).click();
await page.waitForTimeout(800);

section("Запись задним числом");
await tab("Журнал");
await page.getByRole("button", { name: /Записать прошлую тренировку/ }).click();
await page.waitForTimeout(600);
ok(await page.getByText("Какой это был день?").isVisible(), "спрашивает, что это был за день");
await page.getByRole("button", { name: /Спина \+ Задняя дельта/ }).click();
await page.waitForTimeout(700);
const dateField = page.locator('input[type="date"]');
const def = await dateField.inputValue();
ok(def === daysAgoISO(1), "дата по умолчанию — вчера", def);
const past = def.slice(0, 8) + "05";
await dateField.fill(past);
await page.getByPlaceholder("повт").first().fill("8");
await page.getByPlaceholder("кг").first().fill("70");
/* Подтягивания заодно: проверим, что свой вес попадает в тоннаж. */
await page.getByRole("spinbutton", { name: /Подтягивания \(обычный хват\), подход 1/ }).fill("8");
await page.getByRole("button", { name: /Записать в журнал/ }).click();
await page.waitForTimeout(1100);
const list = await dbRead("workouts");
const added = list?.find((w) => w.date === past);
ok(!!added, "тренировка записана прошедшей датой", past);
ok(added?.exercises?.length === 2, "пустые упражнения отброшены");
ok(list?.length === 2, "прежняя запись на месте");

/* Раньше упражнения со своим весом давали ноль: четыре подхода подтягиваний
   просто исчезали из статистики. Теперь считаются по доле веса тела. */
const bwCard = page.locator("div.rounded-xl").filter({ hasText: "Спина + Задняя дельта" }).first();
const bwTons = +((await bwCard.innerText()).match(/([\d\s\u00a0\u202f]+)\s*кг/)?.[1] || "0").replace(/[^\d]/g, "");
ok(bwTons > 560, "подтягивания попадают в тоннаж", `${bwTons} кг против 560 без своего веса`);
await bwCard.getByText("Спина + Задняя дельта").click();
await page.waitForTimeout(400);
ok((await bwCard.innerText()).includes("своим весом"), "видно, во что оценён повтор своим весом");

section("Расход за тренировку");
await tab("Тело");
const picker = page.getByRole("combobox", { name: "Тренировка для расчёта расхода" });
await picker.scrollIntoViewIfNeeded();
ok(await picker.isVisible(), "расход считается по выбранной тренировке из журнала");
ok((await picker.locator("option").count()) === 2, "в списке обе записи журнала");
const energyCard = picker.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
const calc = await energyCard.innerText();
/* Число само по себе ничего не значит — важно, что видно, из чего оно
   собрано: длительность, доля времени под нагрузкой, вес тела. */
for (const part of ["Длительность", "Под нагрузкой", "Вес тела", "МЕТ"])
  ok(calc.includes(part), `в разборе расчёта есть «${part.toLowerCase()}»`);
/* Проверяем не саму цифру — она зависит от того, сколько подходов ввёл
   тест, — а темп: ккал в минуту при 82 кг должно лежать между 3,5 и 6,0 МЕТ,
   то есть примерно 5–9. Мимо этого коридора — сломана формула. */
const kcal = +(calc.match(/~(\d+)\s*\n\s*ВСЕГО СОЖЖЕНО/i)?.[1] || 0);
const mins = +(calc.match(/Длительность\s*\n\s*(\d+)\s*мин/i)?.[1] || 0);
const perMin = mins ? kcal / mins : 0;
ok(perMin > 4 && perMin < 10, "темп расхода правдоподобен", `${kcal} ккал за ${mins} мин`);
const netK = +(calc.match(/~(\d+)\s*\n\s*СВЕРХ ПОКОЯ/i)?.[1] || 0);
ok(netK > 0 && netK < kcal, "«сверх покоя» меньше общего расхода", `${netK} < ${kcal}`);
/* Смена тренировки в списке должна менять расчёт, а не только подпись. */
const first = calc;
await picker.selectOption({ index: 1 });
await page.waitForTimeout(500);
ok((await energyCard.innerText()) !== first, "выбор другой тренировки пересчитывает расход");

section("Травмы и замены");
await tab("Тело");
await page.getByText("Травмы и ограничения").click();
await page.waitForTimeout(400);
await page.getByText("импиджмент, боль при подъёме руки").click();
await page.waitForTimeout(600);
ok(await page.getByText(/Убираются жимы над головой/).isVisible(), "состояние выбралось, показана сводка");

await tab("База");
await page.getByPlaceholder(/Поиск среди/).fill("жим гантелей сидя");
await page.waitForTimeout(600);
await page.getByText("Жим гантелей сидя", { exact: false }).first().click();
await page.waitForTimeout(700);
const card = await page.locator("body").innerText();
ok(/Не рекомендуется/i.test(card), "предупреждение в карточке упражнения");
ok(/чем заменить/i.test(card), "показаны замены");
ok(card.includes("Жим сведёнными гантелями сидя"), "замена осмысленная (нейтральный хват)");
for (const part of ["Исходное положение", "Ход движения", "Ключевые точки", "Частые ошибки"])
  ok(new RegExp(part, "i").test(card), `в карточке есть раздел «${part.toLowerCase()}»`);
await page.getByText("Жим сведёнными гантелями сидя").first().click();
await page.waitForTimeout(600);
ok((await page.locator("body").innerText()).includes("← назад"), "переход по замене с возвратом");
await page.getByRole("button", { name: "Закрыть" }).click();
await page.waitForTimeout(400);

section("Резервная копия");
await page.locator('button[aria-label="Настройки"]').click();
await page.waitForTimeout(500);
const beforeBackup = (await dbRead("workouts"))?.length || 0;
const backup = JSON.stringify({ v: 1, workouts: await dbRead("workouts"), metrics: [], days: await dbRead("days"), profile: await dbRead("profile") });
await page.getByRole("button", { name: "Восстановить из копии" }).click();
await page.waitForTimeout(500);
ok(await page.getByRole("button", { name: /Выбрать файл копии/ }).isVisible(), "лист восстановления поверх настроек, а не под ними");
await page.getByPlaceholder(/Вставь сюда/).fill("не json");
await page.getByRole("button", { name: /Восстановить из текста/ }).click();
await page.waitForTimeout(500);
ok(await page.getByText(/не похоже на резервную копию/).isVisible(), "понятная ошибка вместо alert");
await page.getByPlaceholder(/Вставь сюда/).fill(backup);
await page.getByRole("button", { name: /Восстановить из текста/ }).click();
await page.waitForTimeout(1000);
ok((await dbRead("workouts"))?.length === beforeBackup, "копия восстановилась", `${beforeBackup} записей`);

section("Работа без сети");
await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
const cached = await page.evaluate(async () => {
  let n = 0;
  for (const k of await caches.keys()) n += (await (await caches.open(k)).keys()).length;
  return n;
});
ok(cached > 50, "приложение закешировано целиком", `${cached} файлов`);

await ctx.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
ok(await page.getByText("Железный дневник").isVisible().catch(() => false), "открывается без сети");
ok(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("600 16px Oswald"); }), "шрифты локальные");
await tab("Журнал");
ok(await page.getByText("всего тренировок").isVisible(), "журнал доступен офлайн");
await tab("Сессия");
await page.getByRole("button", { name: /Начать тренировку/ }).click();
await page.waitForTimeout(600);
await page.getByPlaceholder("повт").first().fill("8");
await page.getByPlaceholder("кг").first().fill("60");
await page.getByRole("button", { name: /Завершить и сохранить/ }).first().click();
await page.waitForTimeout(1200);
ok((await dbRead("workouts"))?.length === beforeBackup + 1, "новая тренировка записывается без сети");
await ctx.setOffline(false);

section("Читаемость и доступность");
const a11y = await page.evaluate(() => {
  const small = [], tiny = [], noLabel = [];
  document.querySelectorAll("button").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width > 0 && !el.classList.contains("tap-inline") && (b.width < 44 || b.height < 44))
      small.push(`${(el.innerText || el.ariaLabel || "иконка").trim().slice(0, 20)} ${Math.round(b.width)}×${Math.round(b.height)}`);
    if (!el.innerText.trim() && !el.getAttribute("aria-label")) noLabel.push(1);
  });
  document.querySelectorAll("*").forEach((el) => {
    if (!el.children.length && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 13) tiny.push(1);
  });
  const inputs = [...document.querySelectorAll("input, textarea, select")];
  /* Подпись поля — своя, обёртка <label> или, на худой конец, подсказка
     внутри: диктор должен назвать поле, а не сказать «текстовое поле». */
  const bare = inputs.filter(
    (el) => el.type !== "file" && !el.getAttribute("aria-label")
      && !el.closest("label") && !el.getAttribute("placeholder"),
  ).length;
  const px = inputs.filter((el) => el.tagName === "INPUT").map((el) => parseFloat(getComputedStyle(el).fontSize));
  return { small, tiny: tiny.length, noLabel: noLabel.length, bare, zoomy: px.filter((x) => x < 16).length };
});
ok(a11y.small.length === 0, "все кнопки не мельче 44px", a11y.small.slice(0, 3).join(", "));
ok(a11y.tiny === 0, "нет текста мельче 13px", a11y.tiny ? `нашлось ${a11y.tiny}` : "");
ok(a11y.noLabel === 0, "у всех кнопок есть подпись для диктора", a11y.noLabel ? `без подписи ${a11y.noLabel}` : "");
ok(a11y.zoomy === 0, "поля ввода не вызывают автозум на iOS");
ok(a11y.bare === 0, "у всех полей ввода есть подпись", a11y.bare ? `без подписи ${a11y.bare}` : "");

section("Итог");
ok(errors.length === 0, "ошибок в консоли нет", errors.slice(0, 3).join(" | "));
console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : "\nВсе проверки пройдены");

await browser.close();
process.exit(failed ? 1 : 0);
