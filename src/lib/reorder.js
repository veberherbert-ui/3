import { useCallback, useEffect, useRef, useState } from "react";

/* Перетаскивание упражнений в идущей тренировке.

   Занят тренажёр — упражнение откладывают на потом, и порядок должен это
   уметь. Первая попытка была через долгое нажатие на карточку, и она
   не работала: на телефоне прокрутка начинается в компоновщике браузера
   раньше, чем скрипт успевает её отменить, поэтому палец уводил страницу
   вместе с карточкой. preventDefault здесь опаздывает по своей природе.

   Единственное надёжное решение — отдельная ручка, у которой прокрутка
   отключена заранее: touch-action: none стоит на ней всегда, а не
   включается по ходу жеста. Заодно исчезает скрытый жест: ручку видно,
   и по ней понятно, что карточку можно двигать.

   Пока карточка едет, список у краёв экрана подкручивается сам — иначе
   в длинной тренировке нельзя перенести упражнение с конца в начало. */

const GRAB_TOLERANCE = 4; /* палец дрогнул на тапе — это ещё не перетаскивание */
const EDGE = 90; /* от края экрана начинается автопрокрутка */
const EDGE_SPEED = 12;

export function useDragOrder(count, onMove) {
  const [drag, setDrag] = useState(null); // { from, to, y }
  const start = useRef(null);
  const scroller = useRef(null);
  const rowsRef = useRef([]);
  const raf = useRef(0);
  const moved = useRef(false);

  const stopAutoScroll = () => { cancelAnimationFrame(raf.current); raf.current = 0; };

  const finish = useCallback(() => {
    stopAutoScroll();
    const s = start.current;
    if (s?.el && s.id != null) {
      try { s.el.releasePointerCapture(s.id); } catch { /* уже отпущен */ }
    }
    setDrag((d) => {
      if (d) {
        moved.current = true;
        setTimeout(() => { moved.current = false; }, 0);
        if (d.to !== d.from) onMove(d.from, d.to);
      }
      return null;
    });
    start.current = null;
  }, [onMove]);

  /* Куда попадёт карточка, если отпустить палец сейчас. Считаем по серединам
     строк — порядок меняется ровно тогда, когда карточка перевалила соседа. */
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

  useEffect(() => () => stopAutoScroll(), []);

  /** Ref на корень карточки — по нему меряются позиции. */
  const rowRef = (index) => (el) => { rowsRef.current[index] = el; };

  /**
   * Свойства для ручки перетаскивания. touchAction: "none" обязателен
   * и обязан стоять до начала жеста — иначе прокрутка выигрывает.
   */
  const handleProps = (index) => ({
    style: { touchAction: "none" },
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const el = e.currentTarget;
      start.current = { x: e.clientX, y: e.clientY, el, id: e.pointerId, index, armed: false };
      scroller.current = el.closest('[role="tabpanel"]');
      try { el.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (!s) return;
      const y = e.clientY;
      if (!s.armed) {
        /* Ждём небольшого сдвига: иначе случайный тап по ручке считался бы
           перетаскиванием и карточка дёргалась бы без причины. */
        if (Math.hypot(e.clientX - s.x, y - s.y) < GRAB_TOLERANCE) return;
        s.armed = true;
        try { navigator.vibrate?.(8); } catch { /* не везде есть */ }
        setDrag({ from: s.index, to: s.index, y });
        return;
      }
      setDrag((d) => (d ? { ...d, y, to: indexAt(y) } : d));
      autoScroll(y);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  });

  return { drag, handleProps, rowRef, dragging: drag !== null, didDrag: () => moved.current };
}

/** Переставить элемент массива, не мутируя исходный. */
export function moveItem(list, from, to) {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
