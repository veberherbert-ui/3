// Кнопка в popup шлёт сообщение content-скрипту на активной вкладке Avito,
// чтобы показать/скрыть панель.
document.getElementById("toggle").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const note = document.getElementById("note");
    if (!tab || !/^https:\/\/(www\.)?avito\.ru\//.test(tab.url || "")) {
      note.textContent = "Откройте страницу avito.ru — там появится панель.";
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "toggle-panel" }, () => {
      if (chrome.runtime.lastError) {
        note.textContent = "Обновите страницу Avito (F5) и попробуйте снова.";
      } else {
        window.close();
      }
    });
  });
});
