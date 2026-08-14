import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { reloadOnUpdate } from "./lib/update.js";

/* когда новая версия берёт управление — перезагружаем страницу,
   иначе часть кода останется от старой */
reloadOnUpdate();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
