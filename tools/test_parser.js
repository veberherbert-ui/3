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

console.log("\nИтого: " + passed + " ok, " + failed + " fail");
process.exit(failed ? 1 : 0);
