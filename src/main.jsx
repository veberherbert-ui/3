import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { reloadOnUpdate } from "./lib/update.js";

/* Object.hasOwn — единственное, что мешало графикам работать там, где
   работает само приложение.

   Библиотека графиков зовёт его на горячем пути, а появился он в Safari 15.4
   и Chrome 98 — то есть на iPhone с iOS 14.5–15.3 приложение открывалось
   и считало верно, а вместо графика человек видел «График не открылся».
   Разрыв на три версии системы из-за одной функции.

   Дописать её точно — одна строка: она ничего не выдумывает, а спрашивает
   у объекта ровно то же самое, что спрашивали до её появления. Остальное,
   что нужно графикам, либо ниже нашей планки, либо библиотека сама
   проверяет наличие (так она поступает с WeakRef).

   Есть ещё structuredClone, но он вызывается только в ветке для объектов
   ошибок — графики туда не заходят, и подменять его нечем и незачем. */
if (!Object.hasOwn) {
  Object.defineProperty(Object, "hasOwn", {
    value: (obj, key) => Object.prototype.hasOwnProperty.call(Object(obj), key),
    writable: true,
    configurable: true,
  });
}

/* когда новая версия берёт управление — перезагружаем страницу,
   иначе часть кода останется от старой */
reloadOnUpdate();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
