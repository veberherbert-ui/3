/* Системная кнопка «назад» на андроиде.

   У приложения одна страница и одна запись в истории. Значит «назад»
   закрывает не открытый лист, а всё приложение целиком — а на андроиде это
   первое, что делает рука, чтобы закрыть что угодно. На айфоне такой кнопки
   нет, поэтому раньше проблема и не всплывала.

   Лечится так: открытый лист добавляет в историю свою запись, «назад» её
   снимает и закрывает лист. Закрыли крестиком — запись убираем сами, иначе
   следующее «назад» сработает вхолостую и всё-таки закроет приложение.

   Листы бывают вложенными: восстановление копии открывается поверх настроек.
   Поэтому обработчики лежат стопкой, и «назад» снимает верхний, а не все. */

const stack = [];
let listening = false;
/* Откат, который мы затеяли сами, не должен закрывать лист под нами. */
let selfBack = 0;
/* Отложенный откат — нужен из-за режима разработки, см. openBack. */
let pending = null;

function onPop() {
  if (selfBack > 0) {
    selfBack--;
    return;
  }
  const top = stack.pop();
  if (!top) return;
  top.popped = true;
  top.close();
}

/** Лист открылся: добавляем запись в историю и встаём на вершину стопки. */
export function openBack(close) {
  if (typeof window === "undefined" || !window.history) return null;
  if (!listening) {
    window.addEventListener("popstate", onPop);
    listening = true;
  }
  /* В режиме разработки React нарочно монтирует всё дважды. Откат от первого
     размонтирования отложен на такт — здесь мы его отменяем, и запись
     в истории остаётся одна вместо двух. */
  if (pending) {
    clearTimeout(pending);
    pending = null;
  } else {
    window.history.pushState({ sheet: stack.length + 1 }, "");
  }
  const entry = { close, popped: false };
  stack.push(entry);
  return entry;
}

/** Лист закрылся. Если не кнопкой «назад» — снимаем свою запись сами. */
export function closeBack(entry) {
  if (!entry) return;
  const i = stack.indexOf(entry);
  if (i >= 0) stack.splice(i, 1);
  if (entry.popped) return;
  pending = setTimeout(() => {
    pending = null;
    selfBack++;
    window.history.back();
  }, 0);
}

/** Только для проверок: сколько листов сейчас держат историю. */
export const backDepth = () => stack.length;
