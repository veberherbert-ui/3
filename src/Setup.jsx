import React, { useState } from "react";
import { Ruler, Scale, User, ArrowRight } from "lucide-react";
import { C } from "./lib/theme.js";

/* Знакомство: рост, вес, возраст, пол.

   Половина расчётов в приложении без этих четырёх чисел просто не работает:
   тоннаж подтягиваний не на что умножить, расход калорий не от чего считать,
   процент жира по обхватам требует роста. Раньше всё это лежало во вкладке
   «Тело», куда новый человек заходит в лучшем случае на второй неделе —
   и до тех пор половина приложения молча показывала прочерки.

   Спрашиваем один раз, сразу после условий, и объясняем, зачем каждое поле.
   Пропустить можно: заставлять вводить данные, без которых дневник всё
   равно работает, — плохой обмен. */

const FIELDS = [
  { k: "height", icon: Ruler, label: "Рост", unit: "см", mode: "numeric",
    why: "Нужен для процента жира по обхватам, ИМТ и суточных калорий." },
  { k: "weight", icon: Scale, label: "Вес", unit: "кг", mode: "decimal",
    why: "Ложится первым замером. Без него подтягивания и отжимания не попадают в тоннаж, а расход за тренировку не считается." },
  { k: "age", icon: User, label: "Возраст", unit: "лет", mode: "numeric",
    why: "Входит в формулу основного обмена." },
];

/** Второй экран первого запуска. Показывается один раз после условий. */
export default function SetupGate({ onDone, onSkip }) {
  const [v, setV] = useState({ height: "", weight: "", age: "" });
  const [sex, setSex] = useState("m");
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const filled = Object.values(v).some((x) => x !== "");

  return (
    <div className="h-dvh w-full overflow-y-auto" style={{ background: C.bg }}>
      <div className="px-4 pad-safe-top pb-8 max-w-lg mx-auto">
        <h1 className="f-display text-2xl font-bold mb-1" style={{ color: C.chalk }}>Пара чисел о вас</h1>
        <p className="f-body text-sm mb-5" style={{ color: C.dim }}>
          Без них половина расчётов показывает прочерки. Всё это потом
          правится во вкладке «Тело» — и всё можно пропустить.
        </p>

        <div className="space-y-4">
          {FIELDS.map(({ k, icon: Icon, label, unit, mode, why }) => (
            <div key={k}>
              <label className="flex items-center gap-3">
                <span className="f-body text-sm flex items-center gap-2 flex-1" style={{ color: C.chalk }}>
                  <Icon size={16} color={C.dim} /> {label}
                </span>
                <input type="number" inputMode={mode} value={v[k]} onChange={set(k)}
                  aria-label={`${label}, ${unit}`} placeholder="—"
                  className="f-num w-24 rounded-lg px-2 py-2.5 text-sm text-center shrink-0"
                  style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
                <span className="f-body text-xs w-8 shrink-0" style={{ color: C.dim }}>{unit}</span>
              </label>
              <div className="f-body text-2xs mt-1" style={{ color: C.dim }}>{why}</div>
            </div>
          ))}

          <div>
            <div className="flex items-center gap-3">
              <span className="f-body text-sm flex-1" style={{ color: C.chalk }}>Пол</span>
              <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.line}` }}>
                {[["m", "Мужской"], ["f", "Женский"]].map(([id, l]) => (
                  <button key={id} onClick={() => setSex(id)} aria-pressed={sex === id}
                    className="f-body text-xs px-4"
                    style={{ background: sex === id ? C.red : C.surfaceHi, color: sex === id ? C.chalk : C.dim }}>{l}</button>
                ))}
              </div>
            </div>
            <div className="f-body text-2xs mt-1" style={{ color: C.dim }}>
              Формулы обмена веществ и процента жира по обхватам для мужчин
              и женщин разные — иначе результат уедет на несколько процентов.
            </div>
          </div>
        </div>

        <button onClick={() => onDone({ ...v, sex })}
          className="f-display w-full mt-6 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2"
          style={{ background: filled ? C.red : C.surfaceHi, color: filled ? C.chalk : C.dim }}>
          Сохранить и начать <ArrowRight size={17} />
        </button>
        <button onClick={onSkip} className="f-body w-full mt-2 py-3 text-sm pad-safe-bottom" style={{ color: C.dim }}>
          Пропустить, заполню потом
        </button>
      </div>
    </div>
  );
}
