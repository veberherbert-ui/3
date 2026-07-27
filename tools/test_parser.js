/*
 * Мини-тесты чистой логики parser.js (splitTerms + matches).
 * Запуск: node tools/test_parser.js
 * DOM здесь не нужен — matches() работает с готовым объектом объявления.
 */
const fs = require("fs");
const path = require("path");

// Загружаем parser.js в поддельный window.
const code = fs.readFileSync(path.join(__dirname, "..", "src", "parser.js"), "utf8");
const window = {};
new Function("window", code)(window);
const AP = window.AvitoParser;

let passed = 0,
  failed = 0;
function eq(actual, expected, name) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log("  ✓ " + name);
  } else {
    failed++;
    console.log("  ✗ " + name + " → получили " + JSON.stringify(actual) + ", ждали " + JSON.stringify(expected));
  }
}

// --- splitTerms ---
console.log("splitTerms:");
eq(AP.splitTerms("квартира, 2-комн ; студия"), ["квартира", "2-комн", "студия"], "разделители , ;");
eq(AP.splitTerms("срочная продажа\nбез посредников"), ["срочная продажа", "без посредников"], "фразы и перенос строки");
eq(AP.splitTerms("   "), [], "пустой ввод");

// helper для объявления
function item(text, extra) {
  return Object.assign({ _haystack: text.toLowerCase(), price: null, isOwner: null }, extra || {});
}

// --- include (любое слово) ---
console.log("matches — ключевые слова (любое):");
const fAny = { include: ["квартира", "студия"], matchAll: false, exclude: [] };
eq(AP.matches(item("Продам квартиру в центре"), fAny), true, "совпало одно слово");
eq(AP.matches(item("Продам гараж"), fAny), false, "не совпало ни одно");

// --- include (все слова) ---
console.log("matches — ключевые слова (все):");
const fAll = { include: ["квартира", "срочно"], matchAll: true, exclude: [] };
eq(AP.matches(item("Срочно продам квартиру"), fAll), true, "оба слова есть");
eq(AP.matches(item("Продам квартиру"), fAll), false, "второго слова нет");

// --- exclude ---
console.log("matches — слова-исключения:");
const fExc = { include: [], matchAll: false, exclude: ["агентство", "посредник"] };
eq(AP.matches(item("Квартира от собственника"), fExc), true, "нет стоп-слов");
eq(AP.matches(item("Квартира, агентство недвижимости"), fExc), false, "есть стоп-слово");

// --- price ---
console.log("matches — цена:");
const fPrice = { include: [], exclude: [], priceMin: 1000000, priceMax: 5000000 };
eq(AP.matches(item("x", { price: 3000000 }), fPrice), true, "в диапазоне");
eq(AP.matches(item("x", { price: 500000 }), fPrice), false, "ниже минимума");
eq(AP.matches(item("x", { price: 9000000 }), fPrice), false, "выше максимума");
eq(AP.matches(item("x", { price: null }), fPrice), false, "цена неизвестна при заданном диапазоне");

// --- onlyOwner ---
console.log("matches — только собственники:");
const fOwner = { include: [], exclude: [], onlyOwner: true };
eq(AP.matches(item("x", { isOwner: true }), fOwner), true, "явный собственник проходит");
eq(AP.matches(item("x", { isOwner: null }), fOwner), true, "неизвестный тип не отсекаем");
eq(AP.matches(item("x", { isOwner: false }), fOwner), false, "явное агентство отсекаем");

// --- стемминг (падежи) ---
console.log("matches — русская морфология (стемминг):");
const fStem = { include: ["квартира"], matchAll: false, exclude: [] };
eq(AP.matches(item("Продам квартиру в центре"), fStem), true, "'квартира' находит 'квартиру'");
eq(AP.matches(item("Двухкомнатная квартира"), fStem), true, "'квартира' находит 'квартира'");
eq(AP.matches(item("Продам квартиры оптом"), fStem), true, "'квартира' находит 'квартиры'");
const fStem2 = { include: [], matchAll: false, exclude: ["посредник"] };
eq(AP.matches(item("Работаю через посредников"), fStem2), false, "'посредник' ловит 'посредников'");
eq(AP.stemTerm("квартира"), "квартир", "stemTerm: квартира → квартир");
eq(AP.stemTerm("без посредников"), "без посредник", "stemTerm по словам во фразе");
eq(AP.stemTerm("дом"), "дом", "короткое слово не режется");

// --- комбинация ---
console.log("matches — комбинация фильтров:");
const fCombo = { include: ["квартира"], matchAll: false, exclude: ["обмен"], priceMin: null, priceMax: 4000000, onlyOwner: true };
eq(AP.matches(item("Квартира 2-комн", { price: 3500000, isOwner: null }), fCombo), true, "всё сходится");
eq(AP.matches(item("Квартира, обмен", { price: 3500000 }), fCombo), false, "стоп-слово рубит");

// --- глубокая проверка: разбор страницы объявления ---
console.log("analyzeListingHtml — стоп-фразы и продавец:");
const listingWithStop =
  '<html><head></head><body>' +
  '<h1 data-marker="item-view/title-info">Продам 2-комн квартиру</h1>' +
  '<div data-marker="item-view/item-description">Тихий двор. Агентствам НЕ беспокоить, только прямые покупатели.</div>' +
  '<a data-marker="seller-link/link" href="/user/abc123def/profile/?id=1">Иван</a>' +
  '<span>Частное лицо</span>' +
  "</body></html>";
const stopPhrases = ["агентствам не беспокоить", "без агентств"];
const a1 = AP.analyzeListingHtml(listingWithStop, { stopPhrases: stopPhrases });
eq(a1.stopHits, ["агентствам не беспокоить"], "нашли стоп-фразу (без учёта регистра)");
eq(a1.sellerType, "private", "тип продавца: частное лицо");
eq(a1.sellerUrl, "/user/abc123def/profile/?id=1", "вытащили ссылку на профиль");

const listingClean =
  '<div data-marker="item-view/item-description">Продаю от собственника, торг уместен.</div>' +
  '<a data-marker="seller-link/link" href="/user/zzz/profile/">Пётр</a>';
const a2 = AP.analyzeListingHtml(listingClean, { stopPhrases: stopPhrases });
eq(a2.stopHits, [], "в чистом объявлении стоп-фраз нет");

const listingAgency =
  '<div>Агентство недвижимости "Дом"</div><div data-marker="item-view/item-description">Продаётся квартира</div>';
eq(AP.detectSellerType(listingAgency), "company", "агентство определяется как company");

// --- глубокая проверка: разбор профиля продавца ---
console.log("analyzeSellerHtml — счётчик объявлений:");
eq(AP.countSellerAds('<div>Активные · 7</div>'), 7, "«Активные · 7» → 7");
eq(AP.countSellerAds("<span>12 активных объявлений</span>"), 12, "«12 активных объявлений» → 12");
eq(AP.countSellerAds('<script>{"activeItemsCount":5}</script>'), 5, "из JSON activeItemsCount → 5");
eq(AP.countSellerAds("<div>Профиль продавца</div>"), null, "нет счётчика → null");
eq(AP.analyzeSellerHtml("<div>Частное лицо</div><div>1 объявление</div>").adsCount, 1, "один объект → 1");

// --- защита: капча/заглушка ---
console.log("isBlockedHtml — детект капчи:");
eq(AP.isBlockedHtml("<html><body>Доступ ограничен</body></html>"), true, "«Доступ ограничен» → заблокировано");
eq(AP.isBlockedHtml(""), true, "пустой ответ → заблокировано");
eq(AP.isBlockedHtml("<html>" + "x".repeat(2000) + "</html>"), false, "нормальная длинная страница → ок");

console.log("\nИтого: " + passed + " ok, " + failed + " fail");
process.exit(failed ? 1 : 0);
