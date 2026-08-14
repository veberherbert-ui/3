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
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ru-RU", timezoneId: "Europe/Moscow" });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });

const dbRead = (key) => page.evaluate(async (k) => {
  const db = await new Promise((r) => { const q = indexedDB.open("iron-diary"); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => r(t.result); });
}, key);

const tab = async (name) => {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(500);
};

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

section("Загрузка и вкладки");
ok((await page.title()) === "Железный дневник", "заголовок страницы");
for (const t of ["Сессия", "Журнал", "Графики", "База", "Тело"]) {
  await tab(t);
  ok(await page.getByRole("button", { name: t, exact: true }).isVisible(), `вкладка «${t}» открывается`);
}

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
await page.locator("button.w-8.h-8").first().click();
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
await page.getByText("Жим сведёнными гантелями сидя").first().click();
await page.waitForTimeout(600);
ok((await page.locator("body").innerText()).includes("← назад"), "переход по замене с возвратом");
await page.getByRole("button", { name: "Закрыть" }).click();
await page.waitForTimeout(400);

section("Резервная копия");
await page.locator("button:has(svg.lucide-settings)").click();
await page.waitForTimeout(500);
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
ok((await dbRead("workouts"))?.length === 1, "копия восстановилась");

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
ok((await dbRead("workouts"))?.length === 2, "новая тренировка записывается без сети");
await ctx.setOffline(false);

section("Итог");
ok(errors.length === 0, "ошибок в консоли нет", errors.slice(0, 3).join(" | "));
console.log(failed ? `\nПРОВАЛЕНО проверок: ${failed}` : "\nВсе проверки пройдены");

await browser.close();
process.exit(failed ? 1 : 0);
