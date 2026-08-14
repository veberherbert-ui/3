import { get, set, del, createStore } from "idb-keyval";

/* Данные лежат в IndexedDB — она переживает перезагрузку, работает офлайн
   и не имеет жёсткого лимита в 5 МБ, как localStorage.
   localStorage остаётся запасным вариантом: в приватном режиме Safari
   IndexedDB иногда недоступна. */

const LS_PREFIX = "iron-diary:";
let store = null;
let useFallback = false;

try {
  store = createStore("iron-diary", "kv");
} catch {
  useFallback = true;
}

const lsLoad = (k) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const lsSave = (k, v) => {
  try {
    localStorage.setItem(LS_PREFIX + k, JSON.stringify(v));
  } catch (e) {
    console.error("не удалось сохранить", k, e);
  }
};
const lsDel = (k) => {
  try {
    localStorage.removeItem(LS_PREFIX + k);
  } catch {
    /* удалять нечего — и хорошо */
  }
};

export async function loadKey(k) {
  if (!useFallback) {
    try {
      const v = await get(k, store);
      return v === undefined ? null : v;
    } catch {
      useFallback = true;
    }
  }
  return lsLoad(k);
}

export async function saveKey(k, v) {
  if (!useFallback) {
    try {
      await set(k, v, store);
      return;
    } catch {
      useFallback = true;
    }
  }
  lsSave(k, v);
}

export async function deleteKey(k) {
  if (!useFallback) {
    try {
      await del(k, store);
      return;
    } catch {
      useFallback = true;
    }
  }
  lsDel(k);
}

/* Просим браузер не вычищать данные при нехватке места.
   Safari и Chrome обычно соглашаются, если приложение установлено на домашний экран. */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
