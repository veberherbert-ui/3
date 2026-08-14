import React from "react";
import { ShieldAlert, HeartPulse, HardDrive, Calculator } from "lucide-react";
import { C } from "./lib/theme.js";

/* Что приложение о себе честно сообщает.

   Показывается один раз при первом запуске и потом доступно из настроек.
   Формулировки намеренно без юридического жаргона: смысл в том, чтобы
   человек действительно понял границы, а не пролистал стену текста. */

const POINTS = [
  {
    icon: HeartPulse,
    color: C.redText,
    title: "Это не медицина",
    text:
      "Пометки о травмах и ограничениях — обобщённые ориентиры по механике движений, а не диагноз и не назначение. Приложение не знает вашего состояния и не может его оценить. При боли, свежей травме, беременности, проблемах с сердцем или давлением сначала врач, потом зал.",
  },
  {
    icon: ShieldAlert,
    color: C.mustard,
    title: "Это не тренер",
    text:
      "Описания техники помогают вспомнить движение, но по тексту технику не ставят. Новое упражнение стоит хотя бы раз сделать под присмотром того, кто видит вас со стороны. «Не рекомендуется» означает «у движения известны проблемы при таком состоянии», а не запрет.",
  },
  {
    icon: Calculator,
    color: C.blueText,
    title: "Расчёты приблизительные",
    text:
      "Процент жира по обхватам, одноповторный максимум, расход калорий — оценки по формулам, с погрешностью в десятки процентов. Они полезны, чтобы видеть динамику, и бесполезны как точные числа. Идти проверять расчётный максимум на практике — плохая идея.",
  },
  {
    icon: HardDrive,
    color: C.mossText,
    title: "Данные только у вас",
    text:
      "Дневник хранится на самом устройстве и никуда не отправляется — ни на сервер, ни в облако. Обратная сторона: удалите приложение — исчезнут и записи. Делайте копию файлом хотя бы раз в месяц, это в настройках.",
  },
];

export function DisclaimerBody({ compact }) {
  return (
    <div className="space-y-3">
      {POINTS.map(({ icon: Icon, color, title, text }) => (
        <div key={title} className="rounded-xl p-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${color}` }}>
          <div className="f-display text-sm font-semibold flex items-center gap-1.5 mb-1" style={{ color }}>
            <Icon size={14} /> {title}
          </div>
          {/* 13px — нижняя граница читаемого, ниже опускаться нельзя даже
              в компактном виде: см. docs/interface.md */}
          <div className={`f-body leading-relaxed ${compact ? "text-2xs" : "text-xs"}`} style={{ color: C.chalk }}>{text}</div>
        </div>
      ))}
    </div>
  );
}

/** Экран первого запуска: пока не принят, приложение не показывается. */
export default function DisclaimerGate({ onAccept }) {
  return (
    <div className="h-dvh w-full overflow-y-auto" style={{ background: C.bg }}>
      <div className="px-4 pad-safe-top pb-8 max-w-lg mx-auto">
        <h1 className="f-display text-2xl font-bold mb-1" style={{ color: C.chalk }}>Железный дневник</h1>
        <p className="f-body text-sm mb-4" style={{ color: C.dim }}>
          Прежде чем начать — четыре вещи, которые честно стоит знать.
        </p>

        <DisclaimerBody />

        <button onClick={onAccept} className="f-display w-full mt-5 rounded-xl py-3.5 text-base font-semibold" style={{ background: C.red, color: C.chalk }}>
          Понятно, начать
        </button>
        <p className="f-body text-xs text-center mt-3 pad-safe-bottom" style={{ color: C.dim }}>
          Этот текст всегда доступен в настройках.
        </p>
      </div>
    </div>
  );
}
