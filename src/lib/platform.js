/* Какой телефон в руках.

   Нужно только для подсказок: где искать переключатель звука, что значит
   «перезапустить приложение», чего ждать от уведомлений. Ошибка здесь
   не ломает ничего — подсказка просто станет менее точной, поэтому
   определяем грубо и без библиотек.

   iPadOS с некоторых пор представляется макинтошем, отличается только
   наличием касаний — отсюда вторая проверка. */

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");
const plat = () => (typeof navigator === "undefined" ? "" : navigator.platform || "");

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(plat()) ||
  /iPhone|iPad|iPod/.test(ua()) ||
  (/Mac/.test(plat()) && (navigator.maxTouchPoints || 0) > 1);

export const isAndroid = () => /Android/.test(ua());

/** Телефон это или компьютер — от этого зависит формулировка подсказок. */
export const isPhone = () => isIOS() || isAndroid();
