/*
 * content.js — интерфейс расширения на странице Avito.
 *
 * Отвечает за:
 *   - панель фильтров (плавающее окно + свёрнутая кнопка),
 *   - сохранение/восстановление настроек фильтра,
 *   - сбор объявлений на текущей странице,
 *   - режим «сканировать все страницы» (переход по пагинации с накоплением),
 *   - показ результатов, подсветку/скрытие карточек,
 *   - копирование списка и экспорт в CSV.
 *
 * Всю логику разбора карточек берём из window.AvitoParser (parser.js).
 */
(function () {
  "use strict";

  const AP = window.AvitoParser;
  if (!AP) return; // parser.js не загрузился — молча выходим

  const FILTERS_KEY = "avitoParserFilters";
  const SCAN_KEY = "avitoParserScan";
  const MAX_PAGES = 50; // страховка от бесконечного обхода
  const DEEP_CAP = 60; // максимум объявлений за одну глубокую проверку
  const DEFAULT_STOP_PHRASES = "агентствам не беспокоить, агентства не беспокоить, без агентств, риелторам не беспокоить, риэлторам не беспокоить";

  // ---------- работа с chrome.storage ----------
  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (res) => resolve(res[key]));
    });
  }
  function storageSet(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, resolve);
    });
  }
  function storageRemove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    });
  }

  // ---------- состояние ----------
  let panelEl = null;
  let lastResults = []; // последние показанные объявления (для копирования/CSV)
  let deepAbort = false; // флаг остановки глубокой проверки

  // ---------- построение панели ----------
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") el.className = attrs[k];
        else if (k === "text") el.textContent = attrs[k];
        else if (k === "html") el.innerHTML = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach((c) => {
      if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }

  function field(labelText, inputEl, hint) {
    const wrap = h("div", { class: "ap-field" }, [
      h("label", { class: "ap-label", text: labelText }),
      inputEl,
    ]);
    if (hint) wrap.appendChild(h("div", { class: "ap-hint", text: hint }));
    return wrap;
  }

  function buildPanel() {
    const panel = h("div", { id: "avito-parser-panel", class: "ap-panel" });

    // Шапка (за неё же таскаем окно)
    const header = h("div", { class: "ap-header" }, [
      h("span", { class: "ap-title", text: "🔎 Авито Парсер" }),
      h("div", { class: "ap-header-btns" }, [
        h("button", { class: "ap-icon-btn", id: "ap-collapse", title: "Свернуть", text: "—" }),
      ]),
    ]);
    panel.appendChild(header);

    const body = h("div", { class: "ap-body" });

    const includeInput = h("textarea", {
      id: "ap-include",
      class: "ap-input",
      rows: "2",
      placeholder: "квартира, 2-комн, срочно",
    });
    body.appendChild(
      field("Ключевые слова", includeInput, "Через запятую. Фраза из нескольких слов — тоже один пункт.")
    );

    const matchAllWrap = h("label", { class: "ap-check" }, [
      h("input", { type: "checkbox", id: "ap-match-all" }),
      h("span", { text: "Объявление должно содержать все ключевые слова" }),
    ]);
    body.appendChild(matchAllWrap);

    const excludeInput = h("textarea", {
      id: "ap-exclude",
      class: "ap-input",
      rows: "2",
      placeholder: "агентство, посредник, обмен",
    });
    body.appendChild(field("Слова-исключения", excludeInput, "Объявления с этими словами будут отброшены."));

    const ownerWrap = h("label", { class: "ap-check" }, [
      h("input", { type: "checkbox", id: "ap-only-owner" }),
      h("span", { text: "Только собственники (отсеять явные агентства)" }),
    ]);
    body.appendChild(ownerWrap);

    const priceRow = h("div", { class: "ap-row" }, [
      h("input", { id: "ap-price-min", class: "ap-input ap-input-sm", type: "number", min: "0", placeholder: "Цена от" }),
      h("input", { id: "ap-price-max", class: "ap-input ap-input-sm", type: "number", min: "0", placeholder: "Цена до" }),
    ]);
    body.appendChild(field("Цена, ₽", priceRow));

    const hideWrap = h("label", { class: "ap-check" }, [
      h("input", { type: "checkbox", id: "ap-hide-others" }),
      h("span", { text: "Скрывать неподходящие карточки на странице" }),
    ]);
    body.appendChild(hideWrap);

    // Кнопки действий (быстрый фильтр по словам)
    const actions = h("div", { class: "ap-actions" }, [
      h("button", { id: "ap-find", class: "ap-btn ap-btn-primary", text: "Найти на этой странице" }),
      h("button", { id: "ap-scan", class: "ap-btn", text: "Сканировать все страницы" }),
      h("button", { id: "ap-stop", class: "ap-btn ap-btn-danger ap-hidden", text: "Стоп" }),
    ]);
    body.appendChild(actions);

    // ---- Блок глубокой проверки ----
    const deepBox = h("div", { class: "ap-deep" });
    deepBox.appendChild(h("div", { class: "ap-deep-title", text: "🔬 Глубокая проверка продавца" }));

    const maxAdsInput = h("input", {
      id: "ap-max-ads",
      class: "ap-input ap-input-sm",
      type: "number",
      min: "1",
      value: "1",
    });
    deepBox.appendChild(
      field("Отсеять, если у продавца объявлений больше, чем", maxAdsInput, "1 = оставить только тех, у кого 1 объект.")
    );

    const stopInput = h("textarea", {
      id: "ap-stop-phrases",
      class: "ap-input",
      rows: "2",
      placeholder: "агентствам не беспокоить, без агентств",
    });
    deepBox.appendChild(
      field("Стоп-фразы на странице объявления", stopInput, "Объявления с этими фразами будут убраны из списка.")
    );

    deepBox.appendChild(
      h("div", { class: "ap-actions" }, [
        h("button", { id: "ap-deep", class: "ap-btn ap-btn-primary", text: "Проверить эту страницу (~20 шт)" }),
      ])
    );
    deepBox.appendChild(
      h("div", {
        class: "ap-hint",
        text: "Открывает каждое отобранное объявление и профиль продавца с паузами. 20 объявлений ≈ 1–2 мин.",
      })
    );
    body.appendChild(deepBox);

    // Статус
    body.appendChild(h("div", { id: "ap-status", class: "ap-status" }));

    // Экспорт
    const exportRow = h("div", { class: "ap-actions" }, [
      h("button", { id: "ap-copy", class: "ap-btn ap-btn-sm", text: "Копировать" }),
      h("button", { id: "ap-csv", class: "ap-btn ap-btn-sm", text: "Скачать CSV" }),
      h("button", { id: "ap-reset", class: "ap-btn ap-btn-sm", text: "Сбросить фильтр" }),
    ]);
    body.appendChild(exportRow);

    // Результаты
    body.appendChild(h("div", { id: "ap-results", class: "ap-results" }));

    panel.appendChild(body);

    // Свёрнутая кнопка-запуск
    const launcher = h("button", {
      id: "avito-parser-launcher",
      class: "ap-launcher ap-hidden",
      title: "Открыть Авито Парсер",
      text: "🔎",
    });

    document.body.appendChild(panel);
    document.body.appendChild(launcher);

    wireEvents(panel, launcher);
    makeDraggable(panel, header);
    return panel;
  }

  // ---------- перетаскивание панели за шапку ----------
  function makeDraggable(panel, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const rect = panel.getBoundingClientRect();
      ox = rect.left;
      oy = rect.top;
      panel.style.right = "auto";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const nx = Math.max(0, ox + (e.clientX - sx));
      const ny = Math.max(0, oy + (e.clientY - sy));
      panel.style.left = nx + "px";
      panel.style.top = ny + "px";
    });
    document.addEventListener("mouseup", () => (dragging = false));
  }

  // ---------- чтение фильтров из полей ----------
  function readFilters() {
    const numOrNull = (v) => {
      const s = (v || "").trim();
      if (!s) return null;
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    };
    return {
      includeRaw: document.getElementById("ap-include").value,
      excludeRaw: document.getElementById("ap-exclude").value,
      include: AP.splitTerms(document.getElementById("ap-include").value),
      exclude: AP.splitTerms(document.getElementById("ap-exclude").value),
      matchAll: document.getElementById("ap-match-all").checked,
      onlyOwner: document.getElementById("ap-only-owner").checked,
      priceMin: numOrNull(document.getElementById("ap-price-min").value),
      priceMax: numOrNull(document.getElementById("ap-price-max").value),
      hideOthers: document.getElementById("ap-hide-others").checked,
      maxSellerAds: Math.max(1, numOrNull(document.getElementById("ap-max-ads").value) || 1),
      stopPhrasesRaw: document.getElementById("ap-stop-phrases").value,
      stopPhrases: AP.splitTerms(document.getElementById("ap-stop-phrases").value),
    };
  }

  function applyFiltersToForm(f) {
    if (!f) return;
    document.getElementById("ap-include").value = f.includeRaw || "";
    document.getElementById("ap-exclude").value = f.excludeRaw || "";
    document.getElementById("ap-match-all").checked = !!f.matchAll;
    document.getElementById("ap-only-owner").checked = !!f.onlyOwner;
    document.getElementById("ap-price-min").value = f.priceMin != null ? f.priceMin : "";
    document.getElementById("ap-price-max").value = f.priceMax != null ? f.priceMax : "";
    document.getElementById("ap-hide-others").checked = !!f.hideOthers;
    document.getElementById("ap-max-ads").value = f.maxSellerAds != null ? f.maxSellerAds : 1;
    // Стоп-фразы: если пользователь ещё не трогал — подставляем дефолт.
    document.getElementById("ap-stop-phrases").value =
      f.stopPhrasesRaw != null ? f.stopPhrasesRaw : DEFAULT_STOP_PHRASES;
  }

  function saveFilters() {
    storageSet({ [FILTERS_KEY]: readFilters() });
  }

  // ---------- статус ----------
  function setStatus(text, kind) {
    const el = document.getElementById("ap-status");
    if (!el) return;
    el.textContent = text || "";
    el.className = "ap-status" + (kind ? " ap-status-" + kind : "");
  }

  // ---------- визуальные пометки на карточках ----------
  function clearMarks() {
    document.querySelectorAll(".ap-hit, .ap-miss").forEach((n) => {
      n.classList.remove("ap-hit", "ap-miss");
    });
  }

  function markNode(node, hit, hideOthers) {
    if (hit) {
      node.classList.add("ap-hit");
      node.classList.remove("ap-miss");
    } else {
      node.classList.remove("ap-hit");
      if (hideOthers) node.classList.add("ap-miss");
    }
  }

  // ---------- сбор объявлений на ТЕКУЩЕЙ странице ----------
  function collectCurrentPage(filters, doMark) {
    const nodes = AP.findItems();
    const hits = [];
    nodes.forEach((node) => {
      const parsed = AP.parseItem(node);
      const ok = AP.matches(parsed, filters);
      if (ok) hits.push(parsed);
      if (doMark) markNode(node, ok, filters.hideOthers);
    });
    return { total: nodes.length, hits: hits };
  }

  // ---------- отрисовка результатов ----------
  function ownerBadge(parsed) {
    if (parsed.isOwner === true) return h("span", { class: "ap-badge ap-badge-owner", text: "собственник" });
    if (parsed.isOwner === false) return h("span", { class: "ap-badge ap-badge-agency", text: "агентство?" });
    return null;
  }

  // Пометка по итогам глубокой проверки.
  function deepBadge(parsed) {
    const d = parsed._deep;
    if (!d) return null;
    if (d.status === "ok" && d.count != null)
      return h("span", { class: "ap-badge ap-badge-owner", text: "✓ объявлений: " + d.count });
    if (d.status === "ok-unknown" || d.status === "ok")
      return h("span", { class: "ap-badge ap-badge-neutral", text: "✓ проверено" });
    if (d.status === "error")
      return h("span", { class: "ap-badge ap-badge-neutral", text: "не проверено" });
    return null;
  }

  function renderResults(hits) {
    lastResults = hits;
    const box = document.getElementById("ap-results");
    box.innerHTML = "";
    if (!hits.length) {
      box.appendChild(h("div", { class: "ap-empty", text: "Ничего не найдено под фильтр." }));
      return;
    }
    hits.forEach((p, i) => {
      const meta = [];
      if (p.price != null) meta.push(p.price.toLocaleString("ru-RU") + " ₽");
      if (p.address) meta.push(p.address);
      if (p.date) meta.push(p.date);

      const titleLink = h("a", {
        class: "ap-res-title",
        href: p.url || "#",
        target: "_blank",
        rel: "noopener",
        text: p.title || "(без заголовка)",
      });

      const row = h("div", { class: "ap-res" }, [
        h("div", { class: "ap-res-num", text: String(i + 1) }),
        h("div", { class: "ap-res-main" }, [
          titleLink,
          h("div", { class: "ap-res-meta", text: meta.join(" · ") }),
          h("div", { class: "ap-res-badges" }, [ownerBadge(p), deepBadge(p)]),
        ]),
      ]);
      box.appendChild(row);
    });
  }

  // ---------- поиск на текущей странице (кнопка «Найти») ----------
  function doFind() {
    const filters = readFilters();
    saveFilters();
    clearMarks();
    const { total, hits } = collectCurrentPage(filters, true);
    renderResults(hits);
    setStatus("На странице: " + total + " объявлений, подходит: " + hits.length, "ok");
  }

  // ---------- многостраничное сканирование ----------
  function findNextPageLink() {
    const selectors = [
      '[data-marker="pagination-button/nextPage"]',
      '[data-marker="pagination-button/next"]',
      'a[aria-label="Следующая страница"]',
      'nav a[rel="next"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      // На последней странице кнопка «дальше» бывает отключена — её пропускаем.
      const disabled =
        el.getAttribute("aria-disabled") === "true" ||
        el.hasAttribute("disabled") ||
        el.getAttribute("aria-disabled") === "";
      if (disabled) continue;
      const a = el.tagName === "A" ? el : el.closest("a") || el.querySelector("a");
      if (a && a.href && a.getAttribute("aria-disabled") !== "true") return a.href;
    }
    return null;
  }

  function isBlockedPage() {
    // Признаки капчи / файрвола Avito.
    if (document.querySelector(".firewall-container, [class*='firewall' i]")) return true;
    const t = (document.title || "").toLowerCase();
    if (t.includes("доступ ограничен") || t.includes("captcha")) return true;
    return false;
  }

  function dedupePush(collected, seen, hits) {
    hits.forEach((p) => {
      const key = p.id || p.url;
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      // В хранилище кладём без DOM-узла.
      collected.push({
        id: p.id,
        title: p.title,
        url: p.url,
        price: p.price,
        seller: p.seller,
        date: p.date,
        address: p.address,
        isOwner: p.isOwner,
      });
    });
  }

  async function startScan() {
    const filters = readFilters();
    saveFilters();
    const first = collectCurrentPage(filters, true);
    const collected = [];
    const seen = {};
    dedupePush(collected, seen, first.hits);

    const scan = {
      active: true,
      filters: filters,
      collected: collected,
      seen: seen,
      page: 1,
    };
    await storageSet({ [SCAN_KEY]: scan });

    renderResults(collected);
    toggleScanUI(true);
    setStatus("Стр. 1 — собрано: " + collected.length + ". Перехожу дальше…", "run");

    await continueScan(scan);
  }

  async function continueScan(scan) {
    const next = findNextPageLink();
    if (!next || scan.page >= MAX_PAGES) {
      await finishScan(scan, next ? "Достигнут лимит страниц" : "Дошли до последней страницы");
      return;
    }
    // Человекоподобная задержка перед переходом (1.5–3.5 сек).
    const delay = 1500 + Math.floor(Math.random() * 2000);
    setStatus(
      "Стр. " + scan.page + " — собрано: " + scan.collected.length + ". Переход через " + Math.round(delay / 1000) + " с…",
      "run"
    );
    await storageSet({ [SCAN_KEY]: scan });
    setTimeout(() => {
      window.location.href = next;
    }, delay);
  }

  async function resumeScanOnLoad(scan) {
    // Восстановили фильтры из scan, показали панель, собрали эту страницу.
    if (isBlockedPage()) {
      await finishScan(scan, "Авито показал проверку/капчу — сканирование остановлено");
      setStatus("Авито показал капчу. Пройдите её вручную и запустите заново.", "err");
      return;
    }
    toggleScanUI(true);
    const page = collectCurrentPage(scan.filters, true);
    dedupePush(scan.collected, scan.seen, page.hits);
    scan.page = (scan.page || 1) + 1;
    renderResults(scan.collected);
    await continueScan(scan);
  }

  async function finishScan(scan, reason) {
    scan.active = false;
    await storageRemove(SCAN_KEY);
    toggleScanUI(false);
    renderResults(scan.collected);
    setStatus(
      (reason || "Готово") + ". Всего собрано: " + scan.collected.length + " объявлений с " + scan.page + " стр.",
      "ok"
    );
  }

  async function stopScan() {
    const scan = await storageGet(SCAN_KEY);
    if (scan) {
      await finishScan(scan, "Остановлено вручную");
    } else {
      toggleScanUI(false);
    }
  }

  // Кнопка «Стоп» обслуживает и сканирование страниц, и глубокую проверку.
  async function onStop() {
    deepAbort = true; // остановит цикл глубокой проверки после текущего шага
    const scan = await storageGet(SCAN_KEY);
    if (scan) {
      await finishScan(scan, "Остановлено вручную");
    } else {
      setStatus("Останавливаю…", "run");
    }
  }

  // Единый переключатель «занято»: прячем рабочие кнопки, показываем «Стоп».
  function setBusy(running) {
    const scanBtn = document.getElementById("ap-scan");
    const stopBtn = document.getElementById("ap-stop");
    const findBtn = document.getElementById("ap-find");
    const deepBtn = document.getElementById("ap-deep");
    if (!scanBtn) return;
    scanBtn.classList.toggle("ap-hidden", running);
    findBtn.disabled = running;
    if (deepBtn) deepBtn.disabled = running;
    stopBtn.classList.toggle("ap-hidden", !running);
  }
  // Совместимость со старыми вызовами сканирования.
  function toggleScanUI(running) {
    setBusy(running);
  }

  // ---------- глубокая проверка (заход внутрь каждого объявления) ----------
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function humanDelay() {
    return 1500 + Math.floor(Math.random() * 1200); // 1.5–2.7 сек
  }
  function absolutize(url) {
    try {
      return new URL(url, location.origin).href;
    } catch (e) {
      return url;
    }
  }
  async function fetchText(url) {
    const res = await fetch(url, { credentials: "include", headers: { Accept: "text/html" } });
    return await res.text();
  }

  async function deepCheck() {
    const filters = readFilters();
    saveFilters();
    clearMarks();

    // Кандидаты = то, что прошло фильтр по словам на текущей странице.
    const collected = collectCurrentPage(filters, true);
    let candidates = collected.hits;
    if (!candidates.length) {
      setStatus("На странице нет объявлений под фильтр — уточните ключевые слова.", "err");
      return;
    }
    if (candidates.length > DEEP_CAP) candidates = candidates.slice(0, DEEP_CAP);

    deepAbort = false;
    setBusy(true);

    const kept = [];
    const removed = { agency: 0, phrase: 0, ads: 0 };
    let unverified = 0;
    const sellerCache = {}; // профиль продавца качаем один раз

    for (let i = 0; i < candidates.length; i++) {
      if (deepAbort) break;
      const p = candidates[i];
      setStatus("Глубокая проверка " + (i + 1) + " из " + candidates.length + "…", "run");

      if (!p.url) {
        unverified++;
        p._deep = { status: "error" };
        kept.push(p);
        continue;
      }

      let html;
      try {
        html = await fetchText(p.url);
      } catch (e) {
        unverified++;
        p._deep = { status: "error" };
        kept.push(p);
        await sleep(humanDelay());
        continue;
      }

      if (AP.isBlockedHtml(html)) {
        setBusy(false);
        renderResults(kept);
        setStatus("Авито показал проверку/капчу. Пройдите её вручную на сайте и запустите заново.", "err");
        return;
      }

      const info = AP.analyzeListingHtml(html, { stopPhrases: filters.stopPhrases });

      // Стоп-фразы → убираем совсем.
      if (info.stopHits.length) {
        removed.phrase++;
        await sleep(humanDelay());
        continue;
      }
      // Явное агентство на странице объявления → убираем.
      if (info.sellerType === "company") {
        removed.agency++;
        await sleep(humanDelay());
        continue;
      }

      // Считаем объявления продавца (по его профилю).
      let count = null;
      const sellerUrl = info.sellerUrl ? absolutize(info.sellerUrl) : null;
      if (sellerUrl) {
        if (Object.prototype.hasOwnProperty.call(sellerCache, sellerUrl)) {
          count = sellerCache[sellerUrl];
        } else {
          await sleep(humanDelay());
          try {
            const sh = await fetchText(sellerUrl);
            if (AP.isBlockedHtml(sh)) {
              setBusy(false);
              renderResults(kept);
              setStatus("Авито показал капчу на странице продавца. Пройдите её и запустите заново.", "err");
              return;
            }
            count = AP.analyzeSellerHtml(sh).adsCount;
          } catch (e) {
            count = null;
          }
          sellerCache[sellerUrl] = count;
        }
      }

      if (count != null && count > filters.maxSellerAds) {
        removed.ads++;
        await sleep(humanDelay());
        continue;
      }

      p._deep = { status: "ok", count: count, sellerType: info.sellerType };
      if (count == null) p._deep.status = "ok-unknown";
      kept.push(p);
      await sleep(humanDelay());
    }

    setBusy(false);
    renderResults(kept);
    const removedTotal = removed.agency + removed.phrase + removed.ads;
    const tail = deepAbort ? " (остановлено)" : "";
    setStatus(
      "Проверено: " +
        candidates.length +
        ". Оставлено: " +
        kept.length +
        ". Отсеяно: " +
        removedTotal +
        " (агентства " +
        removed.agency +
        ", стоп-фразы " +
        removed.phrase +
        ", много объявлений " +
        removed.ads +
        ")." +
        (unverified ? " Не удалось проверить: " + unverified + "." : "") +
        tail,
      deepAbort ? "" : "ok"
    );
  }

  // ---------- экспорт ----------
  function resultsToRows() {
    return lastResults.map((p) => ({
      title: p.title || "",
      price: p.price != null ? p.price : "",
      seller: p.seller || "",
      owner: p.isOwner === true ? "собственник" : p.isOwner === false ? "агентство?" : "?",
      sellerAds: p._deep && p._deep.count != null ? p._deep.count : "",
      address: p.address || "",
      date: p.date || "",
      url: p.url || "",
    }));
  }

  function copyList() {
    if (!lastResults.length) {
      setStatus("Список пуст — сначала выполните поиск.", "err");
      return;
    }
    const lines = resultsToRows().map(
      (r) => [r.title, r.price ? r.price + " ₽" : "", r.url].filter(Boolean).join(" — ")
    );
    const text = lines.join("\n");
    navigator.clipboard.writeText(text).then(
      () => setStatus("Скопировано строк: " + lines.length, "ok"),
      () => setStatus("Не удалось скопировать (нет доступа к буферу).", "err")
    );
  }

  function csvEscape(v) {
    const s = String(v == null ? "" : v);
    if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadCsv() {
    if (!lastResults.length) {
      setStatus("Список пуст — сначала выполните поиск.", "err");
      return;
    }
    const rows = resultsToRows();
    const header = ["Заголовок", "Цена", "Продавец", "Тип", "Объявлений у продавца", "Адрес", "Дата", "Ссылка"];
    const cols = ["title", "price", "seller", "owner", "sellerAds", "address", "date", "url"];
    // ; как разделитель — так Excel в русской локали открывает без плясок.
    const csv = [header.map(csvEscape).join(";")]
      .concat(rows.map((r) => cols.map((c) => csvEscape(r[c])).join(";")))
      .join("\r\n");
    // BOM, чтобы Excel не ломал кириллицу.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    a.href = url;
    a.download = "avito-" + stamp + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus("CSV сохранён: " + rows.length + " строк.", "ok");
  }

  function resetFilters() {
    applyFiltersToForm({});
    saveFilters();
    clearMarks();
    renderResults([]);
    setStatus("Фильтр сброшен.", "");
  }

  // ---------- сворачивание / показ панели ----------
  function collapsePanel() {
    panelEl.classList.add("ap-hidden");
    document.getElementById("avito-parser-launcher").classList.remove("ap-hidden");
  }
  function showPanel() {
    panelEl.classList.remove("ap-hidden");
    document.getElementById("avito-parser-launcher").classList.add("ap-hidden");
  }

  // ---------- навешивание обработчиков ----------
  function wireEvents(panel, launcher) {
    panel.querySelector("#ap-collapse").addEventListener("click", collapsePanel);
    launcher.addEventListener("click", showPanel);
    panel.querySelector("#ap-find").addEventListener("click", doFind);
    panel.querySelector("#ap-scan").addEventListener("click", startScan);
    panel.querySelector("#ap-deep").addEventListener("click", deepCheck);
    panel.querySelector("#ap-stop").addEventListener("click", onStop);
    panel.querySelector("#ap-copy").addEventListener("click", copyList);
    panel.querySelector("#ap-csv").addEventListener("click", downloadCsv);
    panel.querySelector("#ap-reset").addEventListener("click", resetFilters);

    // Сохраняем фильтры при изменении полей.
    [
      "ap-include",
      "ap-exclude",
      "ap-match-all",
      "ap-only-owner",
      "ap-price-min",
      "ap-price-max",
      "ap-hide-others",
      "ap-max-ads",
      "ap-stop-phrases",
    ].forEach(
      (id) => {
        const el = panel.querySelector("#" + id);
        el.addEventListener("change", saveFilters);
      }
    );

    // Сообщения из popup (кнопка «Открыть панель»).
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "toggle-panel") {
        if (panelEl.classList.contains("ap-hidden")) showPanel();
        else collapsePanel();
      }
    });
  }

  // ---------- инициализация ----------
  async function init() {
    if (document.getElementById("avito-parser-panel")) return;
    panelEl = buildPanel();

    const savedFilters = await storageGet(FILTERS_KEY);
    applyFiltersToForm(savedFilters || {}); // {} → подставит дефолтные стоп-фразы

    const scan = await storageGet(SCAN_KEY);
    if (scan && scan.active) {
      // Продолжаем ранее запущенное сканирование на новой странице.
      applyFiltersToForm(scan.filters);
      showPanel();
      // Дадим карточкам догрузиться.
      setTimeout(() => resumeScanOnLoad(scan), 1200);
    } else {
      setStatus("Введите слова и нажмите «Найти на этой странице».", "");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
