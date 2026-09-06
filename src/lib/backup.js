import { localISO } from "./dates.js";

/* Выгрузка резервной копии в файл.

   На iPhone ссылка со скачиванием работает ненадёжно, зато системное «Поделиться»
   умеет «Сохранить в Файлы». Поэтому порядок такой:
   1) поделиться файлом через меню системы,
   2) обычное скачивание,
   3) буфер обмена — на самый крайний случай. */

export const backupName = (ext = "json") => `железный-дневник-${localISO(new Date())}.${ext}`;

export async function shareOrDownload(filename, text, mime = "application/json") {
  const file = new File([text], filename, { type: mime });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    } catch (e) {
      /* пользователь закрыл окно «Поделиться» — это не ошибка, просто выходим */
      if (e?.name === "AbortError") return "cancelled";
    }
  }

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "downloaded";
  } catch {
    /* провалились дальше, в буфер обмена */
  }

  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

/** Читает выбранный пользователем файл в строку. */
export const readFileAsText = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

/* Разбор резервной копии.

   Единственное место, куда в приложение попадают данные, которых оно
   не создавало: файл или текст из буфера. Раньше их писали в хранилище
   как есть — и это оказалось способом убить приложение насовсем.

   Достаточно было списка тренировок, который на самом деле не список:
   приложение падало при первой же отрисовке, повреждённая запись
   оставалась в хранилище, и каждый следующий запуск падал точно так же.
   Ни перезагрузка, ни переустановка не помогали — они намеренно
   не трогают дневник. Белый экран навсегда, без единой подсказки.

   Взломом это не назвать: выполнить чужой код так нельзя, React
   экранирует любые строки, а JSON.parse не создаёт прототипов. Но
   прислать другу «копию тренировок», после которой у него перестанет
   открываться дневник, — вполне достаточно неприятно, чтобы это чинить.

   Поэтому здесь разбор с проверкой: что не похоже на запись — то
   не попадает в хранилище, и человеку говорят, сколько записей
   отброшено и почему. */

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x) => (Number.isFinite(+x) ? +x : null);

/* Подход: повторения обязательны, вес может отсутствовать (свой вес). */
const cleanSet = (s, lost) => {
  if (!isObj(s)) { lost.n++; return null; }
  const reps = num(s.reps);
  if (reps === null || reps < 0 || reps > 10000) { lost.n++; return null; }
  const out = { reps, weight: num(s.weight) ?? 0 };
  if (Array.isArray(s.tags)) out.tags = s.tags.filter((t) => typeof t === "string");
  return out;
};

const cleanExercise = (e, lost) => {
  if (!isObj(e) || typeof e.name !== "string" || !e.name) { lost.n++; return null; }
  const sets = Array.isArray(e.sets) ? e.sets.map((x) => cleanSet(x, lost)).filter(Boolean) : [];
  const out = { ...e, name: e.name, sets };
  if (Array.isArray(e.tags)) out.tags = e.tags.filter((t) => typeof t === "string");
  else delete out.tags;
  return out;
};

const cleanWorkout = (w, lost) => {
  if (!isObj(w) || typeof w.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(w.date)) { lost.n++; return null; }
  const exercises = Array.isArray(w.exercises) ? w.exercises.map((x) => cleanExercise(x, lost)).filter(Boolean) : [];
  return { ...w, date: w.date, exercises };
};

const cleanMetric = (m, lost) => {
  if (!isObj(m) || typeof m.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) { lost.n++; return null; }
  return { ...m, date: m.date };
};

const cleanDay = (d, lost) => {
  if (!isObj(d) || typeof d.name !== "string") { lost.n++; return null; }
  return { ...d, name: d.name, exercises: Array.isArray(d.exercises) ? d.exercises.filter((n) => typeof n === "string") : [] };
};

/**
 * Разобрать текст резервной копии.
 * @returns {{ok: true, data: object, dropped: number} | {ok: false, error: string}}
 */
export function parseBackup(txt) {
  let o;
  try {
    o = JSON.parse(txt);
  } catch {
    return { ok: false, error: "Это не похоже на резервную копию. Нужен файл целиком или весь скопированный текст." };
  }
  if (!isObj(o)) return { ok: false, error: "Файл прочитался, но внутри не запись дневника." };
  if (!(o.workouts || o.metrics || o.days || o.profile))
    return { ok: false, error: "Файл прочитался, но записей дневника в нём нет." };

  /* Список, который на самом деле не список, — не «немного испорченная
     копия», а другой файл. Молча превращать его в пустоту нельзя:
     человек нажимал «восстановить», а не «стереть». */
  for (const k of ["workouts", "metrics", "days"]) {
    if (o[k] !== undefined && !Array.isArray(o[k]))
      return { ok: false, error: "Копия повреждена: список записей в ней не список. Восстанавливать нечего — возьми другой файл." };
  }
  if (o.profile !== undefined && !isObj(o.profile))
    return { ok: false, error: "Копия повреждена: сведения о себе в ней записаны не так, как должны." };

  const data = {};
  /* Считаем потери на всех уровнях, а не только верхнем: выброшенный
     подход — тоже потерянная запись, и молчать о ней нечестно. */
  const lost = { n: 0 };
  const take = (key, fn) => {
    if (!o[key]) return;
    data[key] = o[key].map((x) => fn(x, lost)).filter(Boolean);
  };
  take("workouts", cleanWorkout);
  take("metrics", cleanMetric);
  take("days", cleanDay);
  if (o.profile) data.profile = o.profile;

  if (o.workouts?.length && !data.workouts.length)
    return { ok: false, error: "Тренировки в копии есть, но ни одну не удалось прочитать. Похоже, это копия из другого приложения." };

  return { ok: true, data, dropped: lost.n };
}

/* Проверка того, что лежит в хранилище.

   Хранилище не заслуживает доверия больше, чем чужой файл. Записать в него
   мусор могла и прошлая версия приложения, и оборванное сохранение, и —
   до появления проверки выше — восстановление из чужой копии.

   Цена ошибки оказалась велика: одно поле не того вида, и приложение
   зависало на заставке навсегда. Не падало — тогда бы сработала ограда, —
   а именно зависало: сбой случался в асинхронной загрузке, где ловить
   его нечем.

   Здесь то же самое, что при восстановлении, но молча и по частям:
   непрочитанная запись просто не показывается. Хранилище при этом
   не переписывается — испорченную запись всегда можно достать целиком
   через спасательный экран. */
const CLEAN = { workouts: cleanWorkout, metrics: cleanMetric, days: cleanDay };

/**
 * @returns {{list: any[], dropped: number}}
 */
export function sanitizeStored(kind, raw) {
  const fn = CLEAN[kind];
  if (!fn || raw == null) return { list: [], dropped: 0 };
  /* Не список — значит потеряно всё, что там было. */
  if (!Array.isArray(raw)) return { list: [], dropped: 1 };
  const lost = { n: 0 };
  return { list: raw.map((x) => fn(x, lost)).filter(Boolean), dropped: lost.n };
}
