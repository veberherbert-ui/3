/* Обновление установленного приложения.

   PWA обновляется сама, но не мгновенно: новая версия скачивается в фоне
   и включается при следующем запуске. На iPhone «следующий запуск» — это
   закрыть приложение из переключателя задач, а не просто свернуть.

   Поэтому здесь: метка версии, чтобы было видно, что именно установлено,
   и кнопка принудительной проверки. */

/** Подставляется при сборке, см. vite.config.js */
export const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

/* Запущено как установленное приложение или как вкладка браузера.

   Разница видна невооружённым глазом только тому, кто знает, куда смотреть,
   а поведение разное: во вкладке нижнюю кромку экрана занимает сам браузер,
   и ни один стиль страницы на неё не влияет. Когда отзыв приходит с чужого
   телефона, это первое, что нужно знать. */
export const installed = () => {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches
      || window.matchMedia?.("(display-mode: fullscreen)").matches
      || window.navigator.standalone === true;
  } catch {
    return false;
  }
};

export const buildLabel = () => {
  if (!BUILD_TIME) return BUILD_ID;
  const d = new Date(BUILD_TIME);
  if (Number.isNaN(d.getTime())) return BUILD_ID;
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · ${BUILD_ID}`;
};

/**
 * Спросить сервер, нет ли новой версии.
 * @returns {Promise<"updated"|"current"|"unsupported"|"offline">}
 */
export async function checkForUpdate() {
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!navigator.onLine) return "offline";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "unsupported";

    /* если новая версия уже скачана и ждёт — просим её включиться */
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      return "updated";
    }

    await reg.update();
    /* update() возвращает управление до того, как новый обработчик установится */
    const found = await new Promise((resolve) => {
      const t = setTimeout(() => resolve(false), 6000);
      if (reg.installing || reg.waiting) {
        clearTimeout(t);
        resolve(true);
        return;
      }
      reg.addEventListener("updatefound", () => {
        clearTimeout(t);
        resolve(true);
      }, { once: true });
    });

    if (!found) return "current";
    if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
    return "updated";
  } catch {
    return "current";
  }
}

/** Перезагрузить страницу, когда новая версия взяла управление. */
export function reloadOnUpdate() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
