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

/* Считаем запуски медиаэлементов. На iPhone именно проигрываемый <audio>
   переводит страницу в режим проигрывателя — и ставит на паузу музыку в
   наушниках. Приложение однажды делало это на каждое нажатие «начать». */
await page.addInitScript(() => {
  window.__mediaPlays = 0;
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) {
    window.__mediaPlays++;
    return play.apply(this, a);
  };
});

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
const rests = (await page.locator("div.f-num").filter({ hasText: "отдых" }).allInnerTexts())
  .map((t) => t.match(/отдых\s+(\S+)/)?.[1])
  .filter(Boolean);
ok(rests.length > 1 && new Set(rests).size > 1, "время отдыха различается по упражнениям", rests.join(", "));

await page.getByPlaceholder("повт").first().fill("10");
await page.getByPlaceholder("кг").first().fill("40");
/* Подход теперь засекается: ▶ — начали, секундомер — идёт, второе нажатие
   заканчивает, ставит отметку и запускает отдых. */
await page.getByRole("button", { name: /подход 1: начать/i }).first().click();
await page.waitForTimeout(600);
ok(await page.getByRole("button", { name: /подход 1: идёт/i }).first().isVisible(), "подход засекается секундомером");
ok(await page.evaluate(() => window.__mediaPlays) === 0, "старт подхода не перехватывает звук — музыка в наушниках играет дальше",
  `запусков медиаэлемента: ${await page.evaluate(() => window.__mediaPlays)}`);

await page.waitForTimeout(5600);
await page.getByRole("button", { name: /подход 1: идёт/i }).first().click();
await page.waitForTimeout(900);
ok(await page.getByRole("button", { name: /подход 1: снять отметку/i }).first().isVisible(), "после остановки подход отмечен");

const restBig = await page.locator(".f-num.text-4xl").first().textContent().catch(() => null);
ok(!!restBig, "полоса отдыха с крупным счётчиком", restBig || "");
const clock = await page.locator(".f-num.text-3xl").first().textContent().catch(() => null);
ok(!!clock, "крупные часы тренировки", clock || "");

/* отдых переживает перезагрузку */
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const restAfter = await page.locator(".f-num.text-4xl").first().textContent().catch(() => null);
ok(!!restAfter && restAfter !== restBig, "отдых продолжается после перезапуска", `${restBig} → ${restAfter}`);

/* Метки и всё служебное — под одной кнопкой, чтобы карточка оставалась
   про ввод подходов. */
await page.getByRole("button", { name: /метки, техника, убрать/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "отказ", exact: true }).click();
await page.getByRole("button", { name: "болело", exact: true }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Закрыть", exact: true }).click();
await page.waitForTimeout(400);

/* Отработанное упражнение складывается в строку: в середине тренировки
   половина списка уже сделана, и держать под ней пустые поля незачем. */
/* Второй подход заканчиваем не своей кнопкой, а полосой сверху: часы больше
   не уезжают вместе со списком, и до конца отдыха не надо мотать обратно. */
const panel = page.locator("#tabpanel");
await page.getByRole("button", { name: /подход 2: начать/i }).first().click();
await page.waitForTimeout(400);
const doneBtn = page.getByRole("button", { name: "Готово", exact: true });
ok(await doneBtn.isVisible(), "у идущего подхода есть своя полоса с крупным счётчиком");
await panel.evaluate((el) => el.scrollBy(0, 600));
await page.waitForTimeout(600);
const runBox = await doneBtn.boundingBox();
ok(!!runBox && runBox.y < 120, "полоса подхода остаётся сверху при прокрутке", `y = ${Math.round(runBox?.y ?? -1)}`);
/* Прилипнув, полоса сжимается до строки — иначе она съедает пол-экрана. */
const runTall = await page.locator("div:has(> button:text-is('Готово'))").last().boundingBox();
ok(!!runTall && runTall.height < 70, "висящая полоса сжата до строки", `${Math.round(runTall?.height ?? -1)}px`);
await doneBtn.click();
await page.waitForTimeout(700);
ok(await page.getByRole("button", { name: /подход 2: снять отметку/i }).first().isVisible(), "подход, законченный с полосы, отмечен");
const skipBox = await page.getByRole("button", { name: "Пропустить", exact: true }).boundingBox();
ok(!!skipBox && skipBox.y < 120, "полоса отдыха тоже остаётся на виду", `y = ${Math.round(skipBox?.y ?? -1)}`);
await panel.evaluate((el) => el.scrollTo(0, 0));
await page.waitForTimeout(600);
/* Наверху — полная карточка: ±15 правят, когда на неё смотрят. */
ok(await page.getByRole("button", { name: "+15", exact: true }).isVisible(), "наверху полоса разворачивается обратно");
await page.getByRole("button", { name: "Пропустить", exact: true }).click();
await page.waitForTimeout(400);

await page.getByRole("button", { name: /подход 3: начать/i }).first().click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: /подход 3: идёт/i }).first().click();
await page.waitForTimeout(250);
await page.waitForTimeout(400);
const firstSet = page.getByRole("spinbutton", { name: /Жим гантелей лёжа \(горизонт\), подход 1: повторения/ });
ok(!(await firstSet.isVisible().catch(() => false)), "отработанное упражнение свёрнуто в строку");
const packedRow = page.getByRole("button", { name: /Жим гантелей лёжа \(горизонт\)/ }).first();
ok((await packedRow.innerText()).includes("10×40"), "в свёрнутой строке видно, что было сделано");
await packedRow.click();
await page.waitForTimeout(400);
ok(await firstSet.isVisible(), "по нажатию раскрывается обратно");

/* Подходы 2 и 3 отмечены секундомером, но повторения не вписаны. Раньше
   такие подходы молча выбрасывались при сохранении — человек делал подход,
   видел отметку и отдых, а в журнале его не было. Теперь приложение
   останавливается и показывает, чего не хватает. */
await page.getByRole("button", { name: /Завершить и сохранить/ }).first().click();
await page.waitForTimeout(600);
ok(await page.getByText("Подходов без цифр: 2").isVisible(), "отмеченный подход без цифр не даёт тихо сохранить");
const blanksText = await page.locator("div.rounded-t-2xl, div[role='dialog']").last().innerText().catch(() => "");
ok(/нет повторений/.test(blanksText), "лист называет, чего именно не хватает");
ok(/Сохранить без них/.test(blanksText), "есть выход для тех, кто правда не помнит цифр");
await page.getByRole("button", { name: /Вернуться и дописать/ }).click();
await page.waitForTimeout(600);
const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
ok(/подход 2: повторения/.test(focused), "курсор сам встаёт в первое пустое поле", focused);
for (const j of [2, 3]) {
  await page.getByRole("spinbutton", { name: new RegExp(`Жим гантелей лёжа \\(горизонт\\), подход ${j}: повторения`) }).fill("10");
  await page.getByRole("spinbutton", { name: new RegExp(`Жим гантелей лёжа \\(горизонт\\), подход ${j}: вес`) }).fill("40");
}
await page.waitForTimeout(300);

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
ok(saved?.[0]?.exercises?.[0]?.sets?.length === 3, "дописанные подходы не потерялись",
  `сохранено ${saved?.[0]?.exercises?.[0]?.sets?.length} из 3`);
/* Замер короче пяти секунд не считается замером — иначе двойное нажатие
   «сделано» породило бы время под нагрузкой в две секунды. */
const sec = saved?.[0]?.exercises?.[0]?.sets?.[0]?.sec;
ok(sec >= 5 && sec < 30, "время под нагрузкой замерено, а не оценено", `${sec} сек`);
ok(JSON.stringify(saved?.[0]?.exercises?.[0]?.tags) === '["fail","pain"]', "метки сохранены", JSON.stringify(saved?.[0]?.exercises?.[0]?.tags));
/* Две гантели: в поле веса одна, тоннаж считается за обе. */
ok(saved?.[0]?.exercises?.[0]?.pair === true, "жим гантелей помечен парным");
const pairCard = page.locator("div.rounded-xl").filter({ hasText: "Грудь + Бицепс" }).first();
const pairTons = +((await pairCard.innerText()).match(/([\d\s\u00a0\u202f]+)\s*кг/)?.[1] || "0").replace(/[^\d]/g, "");
ok(pairTons === 3 * 10 * 40 * 2, "тоннаж пары гантелей считается за две", `${pairTons} кг`);

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
/* Выбор идёт по областям, а не плоским списком на сто одну строку:
   сначала область, потом мышца, потом упражнение. */
ok(await page.getByRole("button", { name: /^Спина/ }).first().isVisible(), "выбор упражнения начинается с областей");
await page.getByRole("button", { name: /^Плечи/ }).first().click();
await page.waitForTimeout(400);
ok(await page.getByRole("button", { name: /^Задняя дельта/ }).first().isVisible(), "внутри области — мышцы");
await page.getByRole("button", { name: /^Задняя дельта/ }).first().click();
await page.waitForTimeout(400);
ok(await page.getByRole("button", { name: /^Фейспул/ }).first().isVisible(), "внутри мышцы — упражнения");
await page.getByPlaceholder(/Поиск по названию/).fill("фейспул");
await page.waitForTimeout(500);
await page.getByText("Фейспул", { exact: false }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Готово" }).click();
await page.waitForTimeout(600);
const after = await page.locator("button:has-text('+ подход')").count();
ok(after === before + 1, "упражнение добавилось в идущую тренировку", `${before} → ${after}`);

/* Порядок упражнений — занят тренажёр, значит меняем на ходу.
   Тянут за ручку слева: у неё touch-action отключён заранее, иначе на
   телефоне прокрутка выигрывает у жеста и карточка никуда не едет. */
const order = () => page.evaluate(() =>
  [...document.querySelectorAll('[role="tabpanel"] .f-body.text-sm.font-medium')].map((e) => e.textContent.trim()));
const grips = () => page.evaluate(() =>
  [...document.querySelectorAll('[role="tabpanel"] span[aria-hidden="true"]')]
    .filter((e) => e.style.touchAction === "none")
    .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, ta: getComputedStyle(e).touchAction, w: Math.round(r.width), h: Math.round(r.height) }; }));
const g = await grips();
ok(g.length > 1 && g[0].ta === "none", "у карточек есть ручка перетаскивания без прокрутки", g[0]?.ta);
ok(g[0].w >= 30 && g[0].h >= 44, "в ручку можно попасть пальцем", `${g[0].w}×${g[0].h}`);
const dragBefore = await order();
await page.mouse.move(g[0].x, g[0].y);
await page.mouse.down();
await page.mouse.move(g[0].x, g[0].y + 20, { steps: 3 });
await page.mouse.move(g[1].x, g[1].y + 30, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
const dragAfter = await order();
ok(dragAfter[0] === dragBefore[1], "перетаскивание за ручку меняет порядок", `${dragBefore[0]} → ${dragAfter[0]}`);

/* Кнопки в листе «ещё» — тот же результат для тех, кому жест не даётся. */
const beforeOrder = await order();
await page.getByRole("button", { name: /метки, техника, убрать/ }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Переместить упражнение ниже" }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Закрыть", exact: true }).click();
await page.waitForTimeout(400);
const afterOrder = await order();
ok(afterOrder[0] === beforeOrder[1] && afterOrder[1] === beforeOrder[0], "упражнение переставляется в тренировке",
  `${beforeOrder[0]} ↔ ${beforeOrder[1]}`);
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
/* Подтягивания заодно: свой вес плюс блин на поясе. */
await page.getByRole("spinbutton", { name: /Подтягивания \(обычный хват\), подход 1: повторения/ }).fill("8");
const beltField = page.getByRole("spinbutton", { name: /Подтягивания \(обычный хват\), подход 1: утяжеление/ });
ok(await beltField.isVisible(), "у упражнения со своим весом есть поле утяжеления");
await beltField.fill("10");
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
/* 560 за тягу штангой + 8 × (78 + 10) своим весом с поясом. Свой вес
   округляется до килограмма на повторение — ровно так, как подписано
   в карточке, чтобы цифра сходилась с тем, что видно глазами. */
const perRep = Math.round(82 * 0.95) + 10;
ok(bwTons === 560 + 8 * perRep, "тоннаж = штанга + свой вес + утяжеление", `${bwTons} = 560 + 8 × ${perRep}`);
await bwCard.getByText("Спина + Задняя дельта").click();
await page.waitForTimeout(400);
const bwText = await bwCard.innerText();
ok(bwText.includes("свой вес ~78 кг"), "видно, во что оценён свой вес");
ok(bwText.includes("+ 10 кг"), "видно утяжеление");
ok(bwText.includes("8+10"), "подход записан как повторения плюс утяжеление");

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

section("Графики");
await tab("Графики");
await page.waitForTimeout(700);
const prog = await page.locator('[role="tabpanel"]').innerText();
/* Вкладка отвечает на вопросы сама, а не просит выбрать одно упражнение
   из ста одного и одну метрику из четырёх. */
for (const part of ["Что растёт, что стоит", "Объём по неделям", "Неделя по мышцам", "Сравнить тренировки", "Рекорды"])
  ok(prog.includes(part), `на графиках есть раздел «${part.toLowerCase()}»`);
/* Сравнение молчит, пока его не спросили: раньше оно вываливало три десятка
   цифр сразу, из которых половина говорила «так же». */
ok(prog.includes("Выбери день…") || prog.includes("Сравнивать пока нечего"), "сравнение по умолчанию пустое");
ok(!/ВЫРОСЛО|ПРОСЕЛО/.test(prog), "цифры сравнения не показываются без выбора");
ok(!(await page.getByRole("combobox", { name: "Упражнение для графика" }).isVisible().catch(() => false)),
  "выпадающего списка на 101 упражнение больше нет");
const mover = page.locator('[role="tabpanel"] button').filter({ hasText: /стоит|растёт|просело|был один раз/ }).first();
ok(await mover.isVisible(), "упражнения показаны с состоянием, а не по запросу");
await mover.click();
await page.waitForTimeout(900);
ok(await page.locator("svg.recharts-surface").first().isVisible().catch(() => false), "нажатие раскрывает график упражнения");

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
/* То же движение на другом снаряде: тренажёр занят, дома нет блока,
   плечо не любит штангу — вариант выбирается в один тап. */
ok(/то же движение/i.test(card), "в карточке есть варианты того же движения");
ok(card.includes("Жим штанги стоя"), "среди вариантов — то же движение на другом снаряде");
await page.getByText("Жим сведёнными гантелями сидя").first().click();
await page.waitForTimeout(600);
ok((await page.locator("body").innerText()).includes("← назад"), "переход по замене с возвратом");
await page.getByRole("button", { name: "Закрыть" }).click();
await page.waitForTimeout(400);

section("Инвентарь");
await tab("База");
await page.getByRole("button", { name: /Мой инвентарь/ }).click();
await page.waitForTimeout(500);
/* Числа не зашиваем: база растёт, а проверка должна пережить это. */
const catalogCount = async () => +((await page.getByPlaceholder(/Поиск среди/).getAttribute("placeholder")).match(/\d+/)?.[0] || 0);
const allCount = await catalogCount();
await page.getByRole("button", { name: "Дом: гантели", exact: true }).click();
await page.waitForTimeout(700);
const homeCount = await catalogCount();
ok(homeCount > 0 && homeCount < allCount, "инвентарь сокращает каталог", `${allCount} → ${homeCount}`);
await page.getByPlaceholder(/Поиск среди/).fill("смит");
await page.waitForTimeout(500);
ok(await page.getByText("Ничего не нашлось").isVisible(), "чего нет в инвентаре — не предлагается");
await page.getByPlaceholder(/Поиск среди/).fill("");
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Полный зал", exact: true }).click();
await page.waitForTimeout(600);
ok((await catalogCount()) === allCount, "«полный зал» возвращает всё");
await page.getByRole("button", { name: /Мой инвентарь/ }).click();
await page.waitForTimeout(300);

section("Звук и уведомления");
await page.locator('button[aria-label="Настройки"]').click();
await page.waitForTimeout(500);
const soundSheet = await page.locator("body").innerText();
ok(/Не мешать музыке/.test(soundSheet), "выбор стороны развилки со звуком есть в настройках");
ok(/встаёт на паузу/.test(soundSheet), "цена второго варианта названа прямо");
ok(/уведомлени/i.test(soundSheet), "уведомление об отдыхе можно включить");
/* Что бы система ни ответила про разрешение, блок обязан назвать
   настоящее ограничение, а не обещать «придёт всегда». */
ok(/при возвращении|настройках телефона/.test(soundSheet), "про ограничение сказано честно, без обещаний");
const notifyBtn = page.getByRole("button", { name: /[Уу]ведомлени/ }).first();
const notifyDead = /запрещены|недоступны|: вкл/.test(await notifyBtn.innerText());
ok(notifyDead === (await notifyBtn.isDisabled()), "кнопка, которая уже ничего не даст, не предлагается нажать");
/* «Сигнал важнее музыки» — там держатель медиасессии как раз нужен. */
await page.getByRole("button", { name: /Сигнал важнее музыки/ }).click();
await page.waitForTimeout(300);
const soloSaved = (await dbRead("profile"))?.soundSolo;
ok(soloSaved === true, "выбор запоминается");
await page.getByRole("button", { name: /Не мешать музыке/ }).click();
await page.waitForTimeout(300);
ok((await dbRead("profile"))?.soundSolo === false, "и переключается обратно");
await page.getByRole("button", { name: "Закрыть", exact: true }).last().click();
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
