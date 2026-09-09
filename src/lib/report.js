/* Тренировка обычным текстом.

   Раньше выгрузка была одна на весь дневник: кнопка отдавала простыню
   за всё время. Читать её незачем, а отправить кому-то — тем более:
   человеку, которому показывают вчерашнюю тренировку, не нужны все
   предыдущие вместе с замерами тела.

   Поэтому текст собирается по одной тренировке и отдаётся файлом
   по требованию — из её же карточки в журнале.

   Формат человеческий, а не машинный: это не резервная копия (для неё
   есть отдельная кнопка в настройках), а то, что читают глазами
   и пересылают в переписке. */

import { est1RM, bwKg, workoutTonnage, ironKg } from "./calc.js";
import { rmDoubtful } from "./progress.js";
import { allTags } from "../data/tags.js";
import { tagLine } from "../data/tags.js";

/** Как записан один подход: «12×24», «12+10» или просто «12». */
const setsOf = (ex) =>
  ex.sets
    .map((x) => (ex.bodyweight ? (+x.weight ? `${x.reps}+${x.weight}кг` : `${x.reps}`) : `${x.reps}×${ironKg(ex, x.weight)}`))
    .join(", ");

/**
 * Одна тренировка обычным текстом.
 * @param {object} w запись тренировки
 * @param {number} bodyKg вес тела на её дату — без него подтягивания без цифр
 */
export function workoutText(w, bodyKg = 0) {
  const lines = [
    `${w.date} — ${w.dayLabel || "тренировка"}`,
    `тоннаж ${workoutTonnage(w, bodyKg).toLocaleString("ru-RU")} кг${w.durationMin ? ` · ${w.durationMin} мин` : ""}`,
    "",
  ];

  w.exercises.forEach((ex) => {
    /* Как считается вес — иначе цифры непонятны тому, кто читает со стороны:
       12×24 в гантельном жиме это 24 за одну гантель, а не общий вес. */
    const how = [
      ex.uni && "каждой стороной",
      ex.pair && "вес одной гантели",
      ex.block && "двойной блок, на стеке вдвое больше",
    ].filter(Boolean).join(", ");
    const own = ex.bodyweight ? bwKg(ex.name, bodyKg) : null;
    const rm = est1RM(ex);
    /* Знак вопроса у максимума, взятого корпусом или на половине амплитуды:
       формула этого не видит, а человек, читающий текст, должен. */
    const doubt = rmDoubtful(ex) ? "?" : "";
    const marks = tagLine(allTags(ex));

    lines.push(
      `${ex.name}${how ? ` [${how}]` : ""}: ${setsOf(ex)}` +
        `${own ? ` [свой вес ~${own} кг]` : ""}` +
        `${rm ? ` (расч.1ПМ ${rm}${doubt})` : ""}` +
        `${marks ? ` — ${marks}` : ""}`
    );
  });

  if (w.note) lines.push("", `заметка: ${w.note}`);
  return lines.join("\n");
}

/* Имя файла: дата впереди, чтобы файлы сами вставали по порядку. */
export const workoutFileName = (w) =>
  `тренировка-${w.date}${w.dayLabel ? `-${w.dayLabel.toLowerCase().replace(/[^\wа-яё]+/gi, "-").replace(/^-|-$/g, "")}` : ""}.txt`;
