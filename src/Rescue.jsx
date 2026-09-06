/* Последняя ограда — вокруг всего приложения.

   Ограды внутри (см. Boundary в App.jsx) ловят сбой в разделе. Но если
   падает само приложение — например, из-за повреждённой записи в
   хранилище, — ловить его там уже нечем: ограда живёт внутри того, что
   упало. Раньше это давало пустой экран без единого слова, причём
   навсегда: повреждённая запись переживает и перезагрузку, и
   переустановку, потому что и то и другое намеренно не трогает дневник.

   Здесь — то, чего в такой ситуации не хватало.

   Главное: записи можно вытащить. Приложение не открывается, но
   хранилище на месте, и прочитать его напрямую ничто не мешает. Сначала
   человек забирает копию, и только потом, если захочет, стирает.

   Держим отдельным файлом без единой зависимости от App.jsx: если бы
   этот экран жил рядом с тем, что падает, он падал бы вместе с ним. */

import React from "react";
import { C } from "./lib/theme.js";
import { BUILD_ID } from "./lib/update.js";

const DB = "iron-diary";
const STORE = "kv";
const KEYS = ["workouts", "metrics", "days", "profile", "session", "setup", "accepted"];

/* Чтение в обход обычного хранилища: обёртки могли не загрузиться. */
function openDb() {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(DB);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}

/* Читаем в обход обычного хранилища и отдаём наружу: тем же способом
   приложение предлагает спасти записи, когда часть из них не прочиталась,
   но само оно при этом открылось. */
export async function readRawStorage() {
  const out = { v: 1 };
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(STORE)) return out;
    await Promise.all(
      KEYS.map(
        (k) =>
          new Promise((r) => {
            try {
              const t = db.transaction(STORE).objectStore(STORE).get(k);
              t.onsuccess = () => { if (t.result !== undefined) out[k] = t.result; r(); };
              t.onerror = () => r();
            } catch { r(); }
          })
      )
    );
  } catch {
    /* хранилище недоступно — заберём хотя бы то, что в localStorage */
  }
  try {
    for (const k of KEYS) {
      const raw = localStorage.getItem("iron-diary:" + k);
      if (raw && out[k] === undefined) out[k] = JSON.parse(raw);
    }
  } catch {
    /* и его нет — значит забирать нечего */
  }
  return out;
}

async function wipe() {
  try {
    const db = await openDb();
    if (db.objectStoreNames.contains(STORE)) {
      await new Promise((r) => {
        const t = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
        t.onsuccess = t.onerror = () => r();
      });
    }
    db.close();
  } catch {
    /* нечего чистить */
  }
  try {
    for (const k of KEYS) localStorage.removeItem("iron-diary:" + k);
  } catch {
    /* и тут нечего */
  }
}

const btn = {
  display: "block", width: "100%", padding: "14px", marginBottom: 8,
  borderRadius: 12, border: `1px solid ${C.line}`, background: C.surfaceHi,
  color: C.chalk, font: "500 15px/1 system-ui, -apple-system, sans-serif",
};

export default class Rescue extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null, saved: false, armed: false };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    console.error("приложение не открылось:", err);
    /* Сказать странице снаружи, что человеку уже всё объяснено.

       Без этого получалось перетягивание каната: этот экран рисует
       объяснение и кнопку «сохранить копию», а страница через шесть
       секунд решает, что приложение не поднялось, стирает кеш
       и перезагружается — вместе с объяснением. Причём помочь она
       всё равно не может: дело в записях, а их починка не трогает. */
    try { document.documentElement.dataset.ready = "rescue"; } catch { /* некуда ставить */ }
  }

  async save() {
    const data = await readRawStorage();
    const text = JSON.stringify(data);
    const name = `железный-дневник-спасённое.json`;
    try {
      const file = new File([text], name, { type: "application/json" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        this.setState({ saved: true });
        return;
      }
    } catch {
      /* отказался от «поделиться» — пробуем скачиванием */
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.setState({ saved: true });
      return;
    } catch {
      /* и так нельзя — остаётся буфер обмена */
    }
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ saved: true });
    } catch {
      this.setState({ saved: false });
    }
  }

  render() {
    if (!this.state.err) return this.props.children;
    const why = this.state.err?.message || String(this.state.err);
    const info = `${why}\nсборка ${BUILD_ID}\n${navigator.userAgent}`;

    return (
      <div style={{
        position: "fixed", inset: 0, padding: 24, overflow: "auto",
        background: C.bg, color: C.chalk,
        font: "16px/1.5 system-ui, -apple-system, sans-serif",
      }}>
        <h1 style={{ font: "600 20px/1.3 system-ui, sans-serif", margin: "0 0 12px" }}>Приложение не открылось</h1>
        <p style={{ margin: "0 0 16px", color: C.dim, fontSize: 15 }}>
          Скорее всего дело в повреждённой записи — например, после восстановления
          из чужой или неполной копии. Записи при этом целы, и первым делом их
          стоит забрать.
        </p>

        <button style={{ ...btn, background: C.red, borderColor: "transparent", fontWeight: 600 }}
          onClick={() => this.save()}>
          {this.state.saved ? "Копия сохранена" : "Сохранить копию записей"}
        </button>

        {/* Стирание — только после того, как копия предложена, и в два
            нажатия: отменить его будет нечем. */}
        {!this.state.armed ? (
          <button style={btn} onClick={() => this.setState({ armed: true })}>Стереть записи и открыть заново</button>
        ) : (
          <div style={{ marginBottom: 8 }}>
            <p style={{ margin: "0 0 8px", color: C.redText, fontSize: 14 }}>
              Записи будут стёрты без возможности вернуть. Копию сохранил?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn, marginBottom: 0, background: C.red, borderColor: "transparent" }}
                onClick={async () => { await wipe(); location.reload(); }}>Да, стереть</button>
              <button style={{ ...btn, marginBottom: 0 }} onClick={() => this.setState({ armed: false })}>Нет</button>
            </div>
          </div>
        )}

        <button style={{ ...btn, color: C.dim, fontSize: 14 }}
          onClick={() => { navigator.clipboard?.writeText(info).catch(() => {}); }}>
          Скопировать сведения об ошибке
        </button>

        <pre style={{
          whiteSpace: "pre-wrap", wordBreak: "break-word", background: C.surface,
          padding: 12, borderRadius: 8, fontSize: 13, margin: 0, color: C.dim,
        }}>{info}</pre>
      </div>
    );
  }
}
