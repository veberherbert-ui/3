/* Установка приложения на телефон.

   Самая частая жалоба при раздаче ссылки — «оно не встало». Причина почти
   никогда не в приложении: браузеры прячут установку в разных местах, а
   часть браузеров не умеет её вовсе. Человек с ссылкой в мессенджере
   открывает её во встроенном окне, где установки нет и быть не может, —
   и делает вывод, что приложение сломано.

   Поэтому здесь: понять, где мы открыты, и сказать ровно то, что нужно
   сделать в этом месте. Где браузер даёт установить по кнопке — дать
   кнопку, где не даёт — назвать пункт меню его настоящим именем. */

import { isIOS, isAndroid } from "./platform.js";
import { installed } from "./update.js";

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");

/* Встроенное окно браузера внутри другого приложения: телеграм, инстаграм,
   вконтакте, почта. Установки в нём нет ни на одной системе — только
   «открыть во внешнем браузере». Опознаём двумя способами, потому что
   системы врут по-разному:
   — на андроиде встроенное окно честно пишет в строке браузера « wv»;
   — на iPhone оно притворяется сафари, но у настоящего сафари в строке
     есть «Version/», а у встроенного окна его нет никогда. */
export function isInApp() {
  const s = ua();
  if (/\bFBAN|\bFBAV|Instagram|Line\/|MicroMessenger|VKClient|OKApp|Snapchat|Twitter|Pinterest/i.test(s)) return true;
  if (isAndroid()) return /;\s*wv\)/.test(s);
  if (isIOS()) return !/Version\/\d/.test(s) && !/CriOS|FxiOS|EdgiOS|OPT\/|YaBrowser/.test(s);
  return false;
}

/** Какой это браузер — от этого зависит и путь установки, и его название. */
export function browserKind() {
  const s = ua();
  if (isInApp()) return "inapp";
  if (isIOS()) {
    if (/CriOS/.test(s)) return "chrome-ios";
    if (/FxiOS|EdgiOS|OPT\/|YaBrowser/.test(s)) return "other-ios";
    return "safari";
  }
  if (/SamsungBrowser/.test(s)) return "samsung";
  if (/Firefox\//.test(s)) return "firefox";
  if (/YaBrowser/.test(s)) return "yandex";
  if (/Edg\//.test(s)) return "edge";
  if (/Chrome\//.test(s)) return "chrome";
  return "other";
}

/* Предложение установки от браузера.

   Хром выдаёт его один раз и молча забирает, если человек отмахнулся:
   больше он не предложит месяца три. Поэтому событие перехватываем и
   держим у себя — тогда установка остаётся доступной по нашей кнопке
   всё время, пока открыта страница.

   Слушатель ставится и здесь, и в самой странице (см. index.html):
   событие приходит раньше, чем успевает загрузиться этот файл. */
let deferred = (typeof window !== "undefined" && window.__installPrompt) || null;
const subs = new Set();
const tell = () => subs.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    tell();
  });
  /* Приложение встало — предложение больше не действительно. */
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.__installPrompt = null;
    tell();
  });
}

/** Подписаться на появление кнопки установки. Возвращает отписку. */
export function onInstallable(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Готов ли браузер установить приложение по нажатию кнопки. */
export const canPrompt = () => !!(deferred || (typeof window !== "undefined" && window.__installPrompt));

/**
 * Показать системное окно установки.
 * @returns {Promise<"accepted"|"dismissed"|"unavailable">}
 */
export async function promptInstall() {
  const e = deferred || (typeof window !== "undefined" && window.__installPrompt) || null;
  if (!e) return "unavailable";
  try {
    e.prompt();
    const { outcome } = await e.userChoice;
    /* Предложение одноразовое: показать его дважды браузер не даст. */
    deferred = null;
    if (typeof window !== "undefined") window.__installPrompt = null;
    tell();
    return outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "unavailable";
  }
}

/* Пути установки словами.

   Названия пунктов меню взяты как есть, вплоть до кавычек, — человек ищет
   глазами точное совпадение, а не пересказ. */
const STEPS = {
  safari: [
    "Нажми кнопку «Поделиться» — квадрат со стрелкой вверх, внизу экрана",
    "Пролистай список вниз до пункта «На экран „Домой“»",
    "Нажми «Добавить» в правом верхнем углу",
  ],
  "chrome-ios": [
    "Нажми кнопку «Поделиться» — квадрат со стрелкой вверх",
    "Выбери «На экран „Домой“»",
    "Если такого пункта нет — открой эту же ссылку в Safari, там он есть всегда",
  ],
  "other-ios": [
    "На iPhone приложение с домашнего экрана умеет ставить только Safari",
    "Скопируй ссылку и открой её в Safari",
    "Дальше: «Поделиться» → «На экран „Домой“»",
  ],
  chrome: [
    "Нажми ⋮ в правом верхнем углу",
    "Выбери «Установить приложение» — или «Добавить на главный экран», если пункт называется так",
    "Подтверди «Установить»",
  ],
  samsung: [
    "Нажми ☰ внизу справа",
    "Выбери «Добавить страницу на» → «Главный экран»",
  ],
  firefox: [
    "Нажми ⋮ в правом верхнем углу",
    "Выбери «Установить» или «Добавить на главный экран»",
  ],
  yandex: [
    "Нажми ⋮ в строке адреса",
    "Выбери «Добавить на главный экран»",
  ],
  edge: [
    "Нажми ⋯ внизу",
    "Выбери «Добавить на телефон»",
  ],
  inapp: [
    "Сейчас страница открыта во встроенном окне другого приложения — установить отсюда нельзя, такой кнопки в нём нет",
    isIOS() ? "Нажми ⋯ или значок Safari и выбери «Открыть в Safari»" : "Нажми ⋮ и выбери «Открыть в браузере»",
    "Дальше установка появится в меню браузера",
  ],
  other: [
    "Найди в меню браузера пункт «Установить приложение» или «Добавить на главный экран»",
    "Если такого пункта нет — открой ссылку в Chrome (Android) или Safari (iPhone)",
  ],
};

/* Компьютер — отдельный случай: там установка живёт в строке адреса. */
const DESKTOP = [
  "Нажми значок установки в правой части строки адреса — монитор со стрелкой вниз",
  "Если значка нет, загляни в меню браузера: «Установить „Железный дневник“»",
];

/**
 * Что показать человеку прямо сейчас.
 * @returns {{state: "installed"|"prompt"|"manual", title: string, note: string, steps: string[]}}
 */
export function installPlan() {
  if (installed()) {
    return {
      state: "installed",
      title: "Приложение уже установлено",
      note: "Ты открыл его с домашнего экрана, а не во вкладке. Так и должно быть: дневник работает без сети и не зависит от вкладок браузера.",
      steps: [],
    };
  }

  const kind = browserKind();
  const phone = isIOS() || isAndroid();

  if (canPrompt()) {
    return {
      state: "prompt",
      title: "Установить на телефон",
      note: "Приложение станет значком на экране, будет открываться без строки браузера и работать без сети. Записи останутся на устройстве.",
      steps: [],
    };
  }

  const steps = phone ? STEPS[kind] || STEPS.other : kind === "inapp" ? STEPS.inapp : DESKTOP;
  return {
    state: "manual",
    title: kind === "inapp" ? "Отсюда установить нельзя" : "Установить на телефон",
    note:
      kind === "inapp"
        ? "Встроенное окно мессенджера умеет только показывать страницы. Приложение из него не поставить — нужен настоящий браузер."
        : "Кнопки установки браузер не дал, поэтому руками — это три нажатия.",
    steps,
  };
}

/* Полная переустановка.

   Значок с экрана можно удалить, а скачанная копия приложения при этом
   остаётся в браузере. Поставишь заново — и получишь ту же самую старую
   копию, иногда неработоспособную: разметка из кеша ссылается на файлы,
   которых давно нет. Снаружи это выглядит как «переустановка не помогает».

   Здесь то же, что делает экран поломки, только по своей воле и заранее.
   Дневник лежит в IndexedDB и не трогается. */
export async function hardReset() {
  const jobs = [];
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister())))
      );
    }
    if (window.caches?.keys) {
      jobs.push(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
    }
  } catch {
    /* нечего чистить */
  }
  try {
    await Promise.all(jobs);
  } catch {
    /* не вышло — перезагрузка всё равно не повредит */
  }
  /* важно мимо кеша: иначе вернётся та же страница, из-за которой чистились */
  window.location.replace(window.location.pathname + "?fresh=" + Date.now());
}
