/* Снимки экрана для окна установки.

   Без них хром на андроиде предлагает установку узкой полоской внизу,
   которую половина людей просто не замечает: она уезжает через несколько
   секунд и больше не возвращается. Со снимками он показывает нормальное
   окно во весь экран — с именем, значком, описанием и картинками.

   Снимаем настоящее приложение с заполненным дневником, а не пустое:
   пустой экран в окне установки выглядит как неработающая программа.

   Запуск: npm run build && npx vite preview & node tools/shots.mjs */
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const URL = process.env.SHOTS_URL || "http://127.0.0.1:4173/";
const OUT = "public/screenshots";
mkdirSync(OUT, { recursive: true });

const iso = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const set = (reps, weight, tags) => (tags ? { reps, weight, tags } : { reps, weight });
/* pair проставлен заранее: иначе приложение честно решит, что перед ним
   старые записи, пересчитает тоннаж и встретит нас окном об этом. */
const ex = (id, name, sets, pair = false) => ({ id, name, pair, sets });

/* Дневник для снимков: три недели, чтобы графики были не из двух точек,
   и заметный рост, чтобы было видно, о чём приложение. */
const seed = {
  profile: { height: 180, weight: 82, age: 35, sex: "m", activity: "1.55", conditions: [] },
  workouts: [
    { id: "w1", date: iso(18), day: "Грудь + Бицепс", start: 0, end: 0, duration: 3900, exercises: [
      ex("db-press-flat", "Жим гантелей лёжа (горизонт)", [set(12, 22), set(11, 22), set(10, 22, ["fail"])], true),
      ex("pushup", "Отжимания от пола", [set(20, 0), set(18, 0), set(15, 0)]),
      ex("db-curl", "Подъём гантелей на бицепс", [set(12, 14), set(11, 14), set(10, 14)], true),
    ] },
    { id: "w2", date: iso(11), day: "Грудь + Бицепс", start: 0, end: 0, duration: 4200, exercises: [
      ex("db-press-flat", "Жим гантелей лёжа (горизонт)", [set(12, 24), set(12, 24), set(10, 24, ["fail"])], true),
      ex("pushup", "Отжимания от пола", [set(22, 0), set(20, 0), set(17, 0)]),
      ex("db-curl", "Подъём гантелей на бицепс", [set(12, 16), set(11, 16), set(10, 16)], true),
    ] },
    { id: "w3", date: iso(4), day: "Грудь + Бицепс", start: 0, end: 0, duration: 4440, exercises: [
      ex("db-press-flat", "Жим гантелей лёжа (горизонт)", [set(12, 26), set(12, 26), set(11, 26, ["fail"])], true),
      ex("pushup", "Отжимания от пола", [set(25, 0), set(22, 0), set(20, 0)]),
      ex("db-curl", "Подъём гантелей на бицепс", [set(12, 18), set(12, 18), set(10, 18, ["fail"])], true),
    ] },
  ],
  /* План нужен, иначе вкладка «Тренировка» встречает пустым экраном —
     а именно её и разглядывают в окне установки. */
  days: [
    { id: "d1", name: "Грудь + Бицепс", exercises: ["Жим гантелей лёжа (горизонт)", "Жим гантелей на наклонной (30°)", "Отжимания от пола", "Подъём гантелей на бицепс", "Молотковые сгибания (гантели)"] },
    { id: "d2", name: "Спина + Трицепс", exercises: ["Подтягивания (обычный хват)", "Тяга гантели в наклоне одной рукой", "Отжимания на брусьях", "Французский жим с гантелью"] },
    { id: "d3", name: "Ноги + Плечи", exercises: ["Приседания с гантелями", "Румынская тяга с гантелями", "Выпады с гантелями", "Махи гантелями в стороны"] },
  ],
  metrics: [
    { id: "m1", date: iso(18), weight: 82.4, waist: 86 },
    { id: "m2", date: iso(11), weight: 82.0, waist: 85.5 },
    { id: "m3", date: iso(4), weight: 81.6, waist: 85 },
  ],
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: "ru-RU", timezoneId: "Europe/Moscow" });
const page = await ctx.newPage();

/* Дневник кладём прямо в хранилище, а не через интерфейс: мастер знакомства
   собирает программу с нуля и трёх недель истории всё равно не даст.

   Сначала даём странице устояться. При первом заходе служебный поток берёт
   управление, приложение само перезагружается — и запись, начатая в этот
   момент, обрывается на полуслове. */
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

await page.evaluate(async (data) => {
  const db = await new Promise((r, e) => {
    const q = indexedDB.open("iron-diary");
    q.onupgradeneeded = () => { if (!q.result.objectStoreNames.contains("kv")) q.result.createObjectStore("kv"); };
    q.onsuccess = () => r(q.result);
    q.onerror = () => e(q.error);
  });
  const put = (k, v) => new Promise((r) => {
    const t = db.transaction("kv", "readwrite").objectStore("kv").put(v, k);
    t.onsuccess = t.onerror = () => r();
  });
  await put("accepted", true);
  await put("setup", true);
  await put("profile", data.profile);
  await put("days", data.days);
  await put("workouts", data.workouts);
  await put("metrics", data.metrics);
}, seed);

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1800);

/* Приглашение установить на самих снимках лишнее — они и есть про установку. */
await page.getByRole("button", { name: "Скрыть приглашение установить" }).click().catch(() => {});
await page.waitForTimeout(300);

const shots = [
  ["diary", "Дневник", async () => { await page.getByRole("tab", { name: "Дневник" }).click(); }],
  ["session", "Тренировка", async () => { await page.getByRole("tab", { name: "Тренировка" }).click(); }],
  ["plan", "План", async () => { await page.getByRole("tab", { name: "План" }).click(); }],
];

const made = [];
for (const [file, label, go] of shots) {
  await go();
  await page.waitForTimeout(900);
  const path = `${OUT}/${file}.png`;
  await page.screenshot({ path });
  made.push({ file, label });
  console.log("  ✓", path, "—", label);
}

/* В манифесте размеры пишутся в настоящих пикселях файла, а не в точках
   разметки: у телефона с тройной плотностью это втрое больше. Не совпадёт —
   браузер отбросит весь список снимков молча. */
const buf = readFileSync(`${OUT}/${made[0].file}.png`);
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
console.log(`\n${made.length} снимка ${width}×${height} — соотношение ${(height / width).toFixed(2)} (предел 2.3)`);
console.log(`в vite.config.js должно стоять sizes: "${width}x${height}"`);

await browser.close();
