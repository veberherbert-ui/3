/*
 * parser.js — чистая логика поиска и разбора карточек объявлений Avito.
 *
 * Здесь только «глупые» функции без обращения к панели и хранилищу:
 *   - находим карточки объявлений на странице поиска,
 *   - вытаскиваем из каждой заголовок, цену, ссылку, продавца и т.д.,
 *   - решаем, подходит ли объявление под фильтры пользователя.
 *
 * Разметку Avito периодически меняет, поэтому почти для каждого поля
 * перечислено несколько запасных селекторов + текстовый фолбэк.
 * Всё вешаем в один неймспейс window.AvitoParser, чтобы content.js мог
 * этим пользоваться (у content-скриптов общий window страницы... нет,
 * общий isolated world расширения — этого достаточно).
 */
(function () {
  "use strict";

  const AP = (window.AvitoParser = window.AvitoParser || {});

  // Селекторы карточки объявления. Идём по списку до первого, который
  // хоть что-то находит.
  const ITEM_SELECTORS = [
    '[data-marker="item"]',
    "div[data-item-id]",
    'div[itemtype*="Product"]',
  ];

  const TITLE_SELECTORS = [
    '[data-marker="item-title"]',
    'a[itemprop="url"]',
    'h3 a',
    "h3",
    '[itemprop="name"]',
  ];

  const PRICE_TEXT_SELECTORS = [
    '[data-marker="item-price"]',
    '[itemprop="price"]',
    'span[class*="price" i]',
  ];

  const SELLER_SELECTORS = [
    '[data-marker="seller-info/name"]',
    '[data-marker="seller-link/link"]',
    '[data-marker="seller-info/label"]',
    'div[class*="sellerInfo" i]',
    'div[class*="seller" i] a',
  ];

  const DATE_SELECTORS = [
    '[data-marker="item-date"]',
    'div[class*="date" i]',
    'p[data-marker="item-date"]',
  ];

  const ADDRESS_SELECTORS = [
    '[data-marker="item-address"]',
    'div[class*="geo" i]',
    'span[class*="address" i]',
  ];

  const DESC_SELECTORS = [
    '[data-marker="item-specific-params"]',
    'div[class*="description" i]',
    'meta[itemprop="description"]',
  ];

  function normSpace(s) {
    return (s || "").replace(/\s+/g, " ").trim();
  }

  function nodeText(node) {
    if (!node) return "";
    if (node.tagName === "META") return normSpace(node.getAttribute("content"));
    return normSpace(node.textContent);
  }

  // Первый селектор из списка, который что-то нашёл → его текст.
  function pickText(item, selectors) {
    for (const sel of selectors) {
      const el = item.querySelector(sel);
      if (el) {
        const t = nodeText(el);
        if (t) return t;
      }
    }
    return "";
  }

  function findItems(root) {
    root = root || document;
    for (const sel of ITEM_SELECTORS) {
      const nodes = root.querySelectorAll(sel);
      if (nodes.length) return Array.prototype.slice.call(nodes);
    }
    return [];
  }
  AP.findItems = findItems;

  function parsePrice(item) {
    // Надёжнее всего — микроразметка meta[itemprop=price].
    const meta = item.querySelector('meta[itemprop="price"]');
    if (meta && meta.getAttribute("content")) {
      const n = parseInt(meta.getAttribute("content"), 10);
      if (!isNaN(n)) return n;
    }
    for (const sel of PRICE_TEXT_SELECTORS) {
      const el = item.querySelector(sel);
      if (!el) continue;
      const attr = el.getAttribute && el.getAttribute("content");
      if (attr) {
        const n = parseInt(attr, 10);
        if (!isNaN(n)) return n;
      }
      const digits = nodeText(el).replace(/[^\d]/g, "");
      if (digits) return parseInt(digits, 10);
    }
    return null;
  }

  function findLink(item, titleEl) {
    let a = null;
    if (titleEl) {
      a = titleEl.tagName === "A" ? titleEl : titleEl.closest("a");
    }
    if (!a) a = item.querySelector('a[data-marker="item-title"]') || item.querySelector('a[href*="/"]');
    if (!a) return "";
    // .href у якоря уже абсолютный.
    return a.href || "";
  }

  function extractId(item, url) {
    const attrId = item.getAttribute && item.getAttribute("data-item-id");
    if (attrId) return attrId;
    const m = (url || "").match(/_(\d+)(?:[/?#]|$)/);
    if (m) return m[1];
    return url || "";
  }

  // Эвристика «частное лицо, а не агентство». Точного признака в карточке
  // Avito часто нет, поэтому это лучшее приближение:
  //   - явные слова-маркеры,
  //   - у агентств обычно есть рейтинг/число отзывов и слова «агентство»,
  //     «недвижимость», «риелт» в имени продавца.
  function detectSeller(item, sellerName) {
    const name = (sellerName || "").toLowerCase();
    const cardText = normSpace(item.textContent).toLowerCase();

    const ownerWords = ["собственник", "частное лицо"];
    const agencyWords = [
      "агентство",
      "агенство",
      "недвижимост",
      "риелт",
      "риэлт",
      "застройщик",
      'ооо',
      'ип ',
    ];

    let isOwner = null; // null = неизвестно
    if (ownerWords.some((w) => cardText.includes(w))) isOwner = true;
    if (agencyWords.some((w) => name.includes(w) || cardText.includes(w))) isOwner = false;

    // Признак компании: наличие блока рейтинга продавца в карточке.
    const hasRating =
      item.querySelector('[data-marker*="seller-rating" i]') ||
      item.querySelector('[class*="SellerInfo-rating" i]');
    if (hasRating && isOwner === null) isOwner = false;

    return isOwner; // true / false / null
  }

  function parseItem(item) {
    let titleEl = null;
    for (const sel of TITLE_SELECTORS) {
      titleEl = item.querySelector(sel);
      if (titleEl) break;
    }
    const url = findLink(item, titleEl);
    const title = nodeText(titleEl) || pickText(item, ['[itemprop="name"]', "h3"]);
    const price = parsePrice(item);
    const description = pickText(item, DESC_SELECTORS);
    const seller = pickText(item, SELLER_SELECTORS);
    const date = pickText(item, DATE_SELECTORS);
    const address = pickText(item, ADDRESS_SELECTORS);
    const id = extractId(item, url);
    const isOwner = detectSeller(item, seller);

    const haystack = [title, description, address, seller].join(" ").toLowerCase();

    return {
      id: id,
      title: title,
      url: url,
      price: price,
      description: description,
      seller: seller,
      date: date,
      address: address,
      isOwner: isOwner, // true / false / null
      _haystack: haystack,
      _node: item,
    };
  }
  AP.parseItem = parseItem;

  // Разбиваем строку "квартира, 2-комн ; студия" на ["квартира","2-комн","студия"].
  // Запятая/точка с запятой/перевод строки — разделители. Внутри элемента
  // могут быть пробелы (фраза), это нормально.
  function splitTerms(str) {
    return (str || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  AP.splitTerms = splitTerms;

  // Лёгкий стеммер: срезаем частые русские падежные/родовые окончания,
  // чтобы «квартира» находила «квартиру», «квартиры», «квартире» и т.д.
  // Стемим ТОЛЬКО слова из фильтра (текст объявления не трогаем): основа
  // как подстрока ловит все более длинные формы в тексте.
  // Порядок важен — длинные окончания проверяем раньше коротких.
  const ENDINGS = [
    "ого", "его", "ыми", "ими", "ыми",
    "ая", "яя", "ое", "ее", "ый", "ий", "ой", "ую", "юю",
    "ам", "ям", "ах", "ях", "ом", "ем", "ов", "ев", "ми",
    "ы", "и", "а", "я", "у", "ю", "о", "е", "ь",
  ];

  function stemWord(w) {
    if (w.length < 5) return w; // короткие слова не режем
    for (let i = 0; i < ENDINGS.length; i++) {
      const e = ENDINGS[i];
      if (w.length - e.length >= 3 && w.slice(-e.length) === e) {
        return w.slice(0, w.length - e.length);
      }
    }
    return w;
  }

  // Стемим каждое слово внутри пункта (для фраз вроде «без посредников»).
  function stemTerm(term) {
    return term
      .split(/\s+/)
      .map(stemWord)
      .join(" ");
  }
  AP.stemTerm = stemTerm;

  /*
   * matches(parsed, filters) → true/false.
   * filters = {
   *   include: [строки], matchAll: bool,
   *   exclude: [строки],
   *   priceMin: number|null, priceMax: number|null,
   *   onlyOwner: bool
   * }
   */
  function matches(parsed, filters) {
    const hay = parsed._haystack;

    if (filters.include && filters.include.length) {
      const results = filters.include.map((w) => hay.includes(stemTerm(w)));
      const ok = filters.matchAll ? results.every(Boolean) : results.some(Boolean);
      if (!ok) return false;
    }

    if (filters.exclude && filters.exclude.length) {
      if (filters.exclude.some((w) => hay.includes(stemTerm(w)))) return false;
    }

    if (filters.priceMin != null) {
      if (parsed.price == null || parsed.price < filters.priceMin) return false;
    }
    if (filters.priceMax != null) {
      if (parsed.price == null || parsed.price > filters.priceMax) return false;
    }

    if (filters.onlyOwner) {
      // Отсекаем только явные агентства (isOwner === false).
      // Неизвестные (null) оставляем, чтобы не потерять реальных собственников.
      if (parsed.isOwner === false) return false;
    }

    return true;
  }
  AP.matches = matches;
})();
