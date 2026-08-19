import { useCallback, useEffect, useRef, useState } from "react";

/* Перетаскивание упражнений в идущей тренировке.

   Занят тренажёр — упражнение откладывают на потом, и порядок в списке
   должен это уметь. Обычный drag на телефоне не годится: список
   прокручивается, и палец, начавший тянуть карточку, уводит вместе с ней
   всю страницу.

   Поэтому — долгое нажатие. Полсекунды держим палец на месте, и только
   тогда карточка «отрывается»; до этого жест принадлежит прокрутке.
   Так же ведёт себя перестановка иконок в iOS, и объяснять её не нужно.

   Пока карточка едет, страница не скроллится (touch-action: none на время
   захвата), а список у краёв экрана подкручивается сам — иначе в длинной
   тренировке нельзя перенести упражнение с конца в начало. */

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10; /* палец дрогнул — это ещё не отмена захвата */
const EDGE = 90; /* от края экрана начинается автопрокрутка */
const EDGE_SPEED = 12;

export function useDragOrder(count, onMove) {
  const [drag, setDrag] = useState(null); // { from, to, y }
  const hold = useRef(null);
  const start = useRef(null);
  const scroller = useRef(null);
  const rowsRef = useRef([]);
  const raf = useRef(0);
  const moved = useRef(false);

  const cancelHold = () => { clearTimeout(hold.current); hold.current = null; };

  const stopAutoScroll = () => { cancelAnimationFrame(raf.current); raf.current = 0; };

  const finish = useCallback(() => {
    cancelHold();
    stopAutoScroll();
    const s = start.current;
    if (s?.el && s.id != null) {
      try { s.el.releasePointerCapture(s.id); } catch { /* уже отпущен */ }
    }
    setDrag((d) => {
      if (d) {
        /* Отпустили после перетаскивания — следующий click гасим, иначе
           карточка ещё и раскроется под пальцем. */
        moved.current = true;
        setTimeout(() => { moved.current = false; }, 0);
        if (d.to !== d.from) onMove(d.from, d.to);
      }
      return null;
    });
    start.current = null;
  }, [onMove]);

  /* Куда попадёт карточка, если отпустить палец сейчас. Считаем по
     серединам соседних строк — так порядок меняется ровно тогда, когда
     карточка визуально перевалила за соседа. */
  const indexAt = (y) => {
    const rows = rowsRef.current.filter(Boolean);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) return i;
    }
    return rows.length - 1;
  };

  const autoScroll = useCallback((y) => {
    const el = scroller.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const up = y - r.top < EDGE;
    const down = r.bottom - y < EDGE;
    stopAutoScroll();
    if (!up && !down) return;
    const step = () => {
      el.scrollTop += up ? -EDGE_SPEED : EDGE_SPEED;
      setDrag((d) => (d ? { ...d, to: indexAt(d.y) } : d));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => { cancelHold(); stopAutoScroll(); }, []);

  /** Измеряем всю карточку — ref вешается на её корень. */
  const rowRef = (index) => (el) => { rowsRef.current[index] = el; };

  /** Жест вешается на заголовок карточки: за него и тянут. */
  const handlers = (index) => ({
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.currentTarget;
      const id = e.pointerId;
      start.current = { x: e.clientX, y: e.clientY, el, id };
      scroller.current = el.closest('[role="tabpanel"]');
      hold.current = setTimeout(() => {
        /* Захват указателя ставим только здесь. Поставить его сразу нельзя:
           заголовок перехватил бы и обычный тап, и кнопка «ещё» внутри него
           перестала бы нажиматься. */
        try { el.setPointerCapture(id); } catch { /* не критично */ }
        try { navigator.vibrate?.(8); } catch { /* не везде есть */ }
        setDrag({ from: index, to: index, y: start.current.y });
      }, HOLD_MS);
    },
    onPointerMove: (e) => {
      if (!drag) {
        /* Палец поехал раньше, чем сработало удержание — значит человек
           хотел прокрутить список, а не переставить карточку. */
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE) cancelHold();
        return;
      }
      e.preventDefault();
      const y = e.clientY;
      setDrag((d) => (d ? { ...d, y, to: indexAt(y) } : d));
      autoScroll(y);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onContextMenu: (e) => { if (drag) e.preventDefault(); },
  });

  return { drag, handlers, rowRef, dragging: drag !== null, didDrag: () => moved.current };
}

/** Переставить элемент массива, не мутируя исходный. */
export function moveItem(list, from, to) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
