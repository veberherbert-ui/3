/* Уведомление об окончании отдыха, когда приложение свёрнуто.

   Честно о границах. Настоящее уведомление «по расписанию» умеет только
   сервер: он будит систему и та показывает сообщение, даже если приложение
   выгружено. Сервера у дневника нет и не будет — он весь живёт на телефоне,
   ничего никуда не отправляет.

   Что реально работает без сервера: пока страница не усыплена, она сама
   просит систему показать уведомление. На Android и на компьютере этого
   хватает — вкладка в фоне продолжает считать. На iPhone свёрнутое
   приложение засыпает вместе со своими часами, и уведомление приходит не
   вовремя, а в момент возвращения. Поэтому там главный расчёт — на сигнал
   в наушники и на догоняющую отметку при возврате. */

let timer = null;

const supported = () => typeof Notification !== "undefined" && "serviceWorker" in navigator;

/** "нет" | "спросить" | "да" | "запрещено" — состояние для настроек. */
export function notifyState() {
  if (!supported()) return "нет";
  if (Notification.permission === "granted") return "да";
  if (Notification.permission === "denied") return "запрещено";
  return "спросить";
}

/** Спросить разрешение. Вызывать только по нажатию — иначе браузер откажет. */
export async function askNotify() {
  if (!supported()) return "нет";
  try {
    await Notification.requestPermission();
  } catch {
    /* старый Safari отвечает через колбэк — состояние всё равно перечитаем */
  }
  return notifyState();
}

async function show(title, body) {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.showNotification(title, {
      body,
      tag: "rest-over", /* одно и то же уведомление не копится стопкой */
      renotify: true,
      silent: false,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
    });
  } catch {
    /* не показалось — сигнал и экран остаются как были */
  }
}

/** Показать уведомление через delaySec секунд. Повторный вызов заменяет прежнее. */
export function scheduleRestNotice(delaySec, exName) {
  cancelRestNotice();
  if (notifyState() !== "да" || delaySec <= 0) return;
  timer = setTimeout(() => {
    timer = null;
    /* Вернулись в приложение раньше — уведомление не нужно, его и так видно. */
    if (document.visibilityState === "visible") return;
    show("Отдых окончен", exName ? `Следующий подход: ${exName}` : "Пора делать подход");
  }, delaySec * 1000);
}

export function cancelRestNotice() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!supported() || Notification.permission !== "granted") return;
  navigator.serviceWorker.getRegistration?.()
    .then((reg) => reg?.getNotifications?.({ tag: "rest-over" }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => {});
}
