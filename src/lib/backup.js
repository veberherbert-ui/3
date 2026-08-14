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
