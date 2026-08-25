import React, { useMemo, useState } from "react";
import { Ruler, Scale, User, ArrowRight, ShieldAlert, Check, Layers, Plus, PenLine } from "lucide-react";
import { C } from "./lib/theme.js";
import { CONDITIONS } from "./data/conditions.js";
import { GEAR_PRESETS, PRESETS } from "./data/exercises.js";
import { adaptPreset, byFit } from "./lib/fitplan.js";

/* Знакомство: четыре экрана подряд, каждый пропускается.

   Раньше здесь спрашивали только рост, вес и возраст, а потом человека
   высаживали в приложение с чужой программой из четырёх дней и предлагали
   разбираться самому. Он и разбирался — по свидетельству первого же
   постороннего читателя, «раз тридцать запутавшись».

   Порядок экранов — порядок вопросов, которые человек задаёт себе сам:
   кто я → что у меня болит → чем я располагаю → что я буду делать.
   Каждый ответ сужает следующий шаг: инвентарь решает, какие сплиты
   вообще имеет смысл предлагать, травмы — что подсветить предупреждением.

   Пропустить можно всё: дневник работает и без единого ответа, а держать
   человека на входе ради данных, без которых можно обойтись, — плохой
   обмен. */

const FIELDS = [
  { k: "height", icon: Ruler, label: "Рост", unit: "см", mode: "numeric",
    why: "Нужен для процента жира по обхватам, ИМТ и суточных калорий." },
  { k: "weight", icon: Scale, label: "Вес", unit: "кг", mode: "decimal",
    why: "Ложится первым замером. Без него подтягивания и отжимания не попадают в тоннаж, а расход за тренировку не считается." },
  { k: "age", icon: User, label: "Возраст", unit: "лет", mode: "numeric",
    why: "Входит в формулу основного обмена." },
];

const STEPS = ["Тело", "Здоровье", "Инвентарь", "Программа"];

function Frame({ step, title, sub, children, onNext, nextLabel, onSkip, skipLabel = "Пропустить" }) {
  return (
    <div className="h-dvh w-full overflow-y-auto" style={{ background: C.bg }}>
      <div className="px-4 pad-safe-top pb-8 max-w-lg mx-auto">
        {/* Полоска шагов: видно, сколько ещё осталось, и что это конечный
            процесс, а не бесконечная анкета. */}
        <div className="flex gap-1.5 mb-5 mt-1" aria-label={`Шаг ${step + 1} из ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className="h-1 rounded-full" style={{ background: i <= step ? C.red : C.line }} />
              <div className="f-body text-2xs mt-1 truncate" style={{ color: i === step ? C.chalk : C.dim }}>{label}</div>
            </div>
          ))}
        </div>

        <h1 className="f-display text-2xl font-bold mb-1" style={{ color: C.chalk }}>{title}</h1>
        <p className="f-body text-sm mb-5" style={{ color: C.dim }}>{sub}</p>

        {children}

        {onNext && (
          <button onClick={onNext}
            className="f-display w-full mt-6 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2"
            style={{ background: C.red, color: C.chalk }}>
            {nextLabel} <ArrowRight size={17} />
          </button>
        )}
        {onSkip && (
          <button onClick={onSkip} className="f-body w-full mt-2 py-3 text-sm pad-safe-bottom" style={{ color: C.dim }}>
            {skipLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/** Знакомство. onDone получает всё разом: профиль, травмы, инвентарь, дни. */
export default function SetupGate({ onDone }) {
  const [step, setStep] = useState(0);
  const [v, setV] = useState({ height: "", weight: "", age: "" });
  const [sex, setSex] = useState("m");
  const [conds, setConds] = useState([]);
  const [gear, setGear] = useState(null); /* null — не выбирал, значит всё */

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const next = () => setStep((i) => i + 1);
  const finish = (days) => onDone({ ...v, sex, conditions: conds, gear, days });

  /* Сплиты, отсортированные под выбранный инвентарь: то, что подходит
     как есть, — сверху. Ровно тот же расчёт, что и в самом приложении. */
  const splits = useMemo(() => {
    const g = gear || [];
    return Object.entries(PRESETS)
      .map(([k, p]) => ({ k, p, fit: adaptPreset(p, g) }))
      .sort(byFit)
      .slice(0, 5);
  }, [gear]);

  if (step === 0) return (
    <Frame step={0} title="Пара чисел о вас"
      sub="Без них половина расчётов показывает прочерки. Всё это потом правится во вкладке «Тело»."
      onNext={next} nextLabel="Дальше" onSkip={next} skipLabel="Пропустить этот шаг">
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
                  className="f-body text-xs px-4" style={{ minHeight: 44, background: sex === id ? C.red : C.surfaceHi, color: sex === id ? C.chalk : C.dim }}>{l}</button>
              ))}
            </div>
          </div>
          <div className="f-body text-2xs mt-1" style={{ color: C.dim }}>
            Формулы обмена веществ и процента жира по обхватам для мужчин
            и женщин разные — иначе результат уедет на несколько процентов.
          </div>
        </div>
      </div>
    </Frame>
  );

  if (step === 1) return (
    <Frame step={1} title="Что бережём"
      sub="Отметь проблемные места. В базе появятся предупреждения и подсказки, чем заменить опасное упражнение. Ничего не запрещается — только помечается."
      onNext={next} nextLabel={conds.length ? `Дальше (${conds.length})` : "Ничего не беспокоит"}
      onSkip={next} skipLabel="Пропустить этот шаг">
      <div className="space-y-1.5">
        {CONDITIONS.map((c) => {
          const on = conds.includes(c.id);
          return (
            <button key={c.id} onClick={() => setConds((p) => (on ? p.filter((x) => x !== c.id) : [...p, c.id]))}
              aria-pressed={on} className="w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left"
              style={{ background: C.surfaceHi, border: `1px solid ${on ? C.mustard : C.line}` }}>
              <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
                style={{ background: on ? C.mustard : "transparent", border: `1px solid ${on ? C.mustard : C.line}` }}>
                {on && <Check size={13} color={C.bg} />}
              </span>
              <span className="min-w-0">
                <span className="f-body text-sm block" style={{ color: on ? C.chalk : C.dim }}>{c.name}</span>
                <span className="f-body text-2xs block" style={{ color: C.dim }}>{c.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="f-body text-2xs mt-3 leading-relaxed flex gap-2" style={{ color: C.dim }}>
        <ShieldAlert size={14} className="shrink-0 mt-0.5" />
        <span>Это не диагноз и не лечение. При боли в покое, ночью или после травмы — сначала к врачу, а не в зал.</span>
      </div>
    </Frame>
  );

  if (step === 2) return (
    <Frame step={2} title="Чем занимаешься"
      sub="Самый полезный вопрос здесь: от ответа зависит, какие упражнения вообще будут предлагаться и какие программы имеют смысл. Потом меняется во вкладке «План»."
      onSkip={() => { setGear(null); next(); }} skipLabel="Пропустить — показывать всё">
      <div className="space-y-1.5">
        {GEAR_PRESETS.map((pr) => {
          const on = gear && gear.length === pr.gear.length && pr.gear.every((g) => gear.includes(g));
          return (
            <button key={pr.id} onClick={() => { setGear(pr.id === "all" ? [] : pr.gear); next(); }}
              className="w-full text-left rounded-xl px-3.5 py-3"
              style={{ background: C.surfaceHi, border: `1px solid ${on ? C.moss : C.line}` }}>
              <div className="f-body text-sm" style={{ color: C.chalk }}>{pr.label}</div>
              <div className="f-body text-2xs" style={{ color: C.dim }}>
                {pr.id === "all" ? "все снаряды" : pr.gear.join(" · ")}
              </div>
            </button>
          );
        })}
      </div>
    </Frame>
  );

  return (
    <Frame step={3} title="С чего начнём"
      sub="Последний шаг. Программу всегда можно поменять, удалить и собрать заново."
      onSkip={() => finish(null)} skipLabel="Позже, просто открыть дневник">
      <div className="space-y-2">
        <div className="f-body text-xs uppercase tracking-wide" style={{ color: C.dim }}>Взять готовую</div>
        {splits.map(({ k, p, fit }) => (
          <button key={k} onClick={() => finish(fit.days)} className="w-full text-left rounded-xl p-3"
            style={{ background: C.surfaceHi, border: `1px solid ${fit.verdict === "native" ? C.moss : fit.verdict === "adapted" ? C.blue : C.line}`, opacity: fit.verdict === "poor" ? 0.55 : 1 }}>
            <div className="f-display text-sm font-semibold" style={{ color: C.chalk }}>{p.name}</div>
            <div className="f-body text-xs" style={{ color: C.dim }}>{p.desc}</div>
            <div className="f-body text-2xs mt-1" style={{ color: C.blueText }}>{fit.days.map((d) => d.name.split(" (")[0]).join(" · ")}</div>
          </button>
        ))}

        <div className="f-body text-xs uppercase tracking-wide pt-2" style={{ color: C.dim }}>Или</div>
        <button onClick={() => finish([{ name: "Мой день", exercises: [] }])}
          className="w-full text-left rounded-xl px-3.5 py-3 flex items-center gap-3"
          style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
          <PenLine size={16} color={C.mossText} className="shrink-0" />
          <span>
            <span className="f-body text-sm block" style={{ color: C.chalk }}>Собрать свою</span>
            <span className="f-body text-2xs block" style={{ color: C.dim }}>пустой день, наполнишь сам</span>
          </span>
        </button>
        <button onClick={() => finish(null)}
          className="w-full text-left rounded-xl px-3.5 py-3 flex items-center gap-3"
          style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
          <Plus size={16} color={C.dim} className="shrink-0" />
          <span>
            <span className="f-body text-sm block" style={{ color: C.chalk }}>Просто записывать</span>
            <span className="f-body text-2xs block" style={{ color: C.dim }}>без плана — выбирать упражнения по ходу</span>
          </span>
        </button>
      </div>
    </Frame>
  );
}
