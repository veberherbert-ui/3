import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, lazy, Suspense } from "react";
import { Plus, X, TrendingUp, BookOpen, Dumbbell, Flame, Settings, Trash2, Check, Info, Play, Timer, Calculator, Copy, ExternalLink, Activity, Pause, ChevronDown, ChevronUp, MoreHorizontal, Search, Library, Layers, Pencil, RotateCcw, Download, Upload, Share2, HardDrive, ShieldAlert, TriangleAlert, HeartPulse, Repeat2, Volume2, VolumeX, RefreshCw, FileText, Type, CalendarPlus } from "lucide-react";

import { EXDB, GROUPS, ALL_MUSCLES, PUSH_M, PULL_M, PRESETS, DEFAULT_DAYS, isUni, isBW } from "./data/exercises.js";
import { CONDITIONS, CONDITION_BY_ID, helpfulNote } from "./data/conditions.js";
import { TECHNIQUE } from "./data/technique.js";
import { saferAlternatives, worstRisk, risksFor, dayWarnings } from "./lib/swap.js";
import { C, plateColor } from "./lib/theme.js";
import { today, daysAgo, fmtDate } from "./lib/dates.js";
import {
  uid, r1, ytLink,
  exTonnage, workoutTonnage, bwKg, addedKg, perRepKg, weightNear, topWeight, topReps, totalReps,
  epley, brzycki, est1RM, readyToAdd,
  bodyFatNavy, bmiOf, lbmOf, ffmiOf,
} from "./lib/calc.js";
import { loadKey, saveKey, deleteKey, requestPersistence, storageEstimate } from "./lib/storage.js";
import { shareOrDownload, readFileAsText, backupName } from "./lib/backup.js";
import { restFor, fmtRest, stepRest } from "./lib/rest.js";
import { workoutEnergy } from "./lib/energy.js";
import { primeAudio, playRestOver, scheduleRestOver, cancelScheduled, vibrate, tapBuzz, releaseAudio, audioReady } from "./lib/sound.js";
import { useWakeLock } from "./lib/wakelock.js";
import { buildLabel, checkForUpdate, reloadOnUpdate } from "./lib/update.js";
import { useAppearance, TEXT_SIZES } from "./lib/appearance.js";
import DisclaimerGate, { DisclaimerBody } from "./Disclaimer.jsx";
import SetupGate from "./Setup.jsx";

/* Графики грузятся отдельным куском: библиотека тяжёлая, а нужна только
   на двух вкладках из пяти. */
const LineByDate = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.LineByDate })));
const BarByDate = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.BarByDate })));

/** Место под график, пока он подгружается — чтобы страница не дёргалась. */
const ChartFrame = ({ children, height = 200 }) => (
  <Suspense fallback={<div style={{ height }} />}>{children}</Suspense>
);

/* ============ atoms ============ */
const Chip = ({ label, value, sub, accent }) => (
  <div className="flex-1 rounded-xl px-3 py-2.5 min-w-0" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
    <div className="f-num text-lg font-semibold truncate" style={{ color: accent || C.chalk }}>{value}</div>
    <div className="f-body text-xs uppercase tracking-wide truncate" style={{ color: C.dim }}>{label}</div>
    {sub && <div className="f-body text-xs mt-0.5" style={{ color: C.dim }}>{sub}</div>}
  </div>
);
const Sheet = ({ children, onClose }) => (
  <div className="sheet-scrim fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
    <div className="sheet-panel w-full max-w-xl rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);
/** Строка разбора расчёта: слева что, справа сколько и откуда. */
const CalcLine = ({ k, v, hint }) => (
  <div className="py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
    <div className="flex items-baseline justify-between gap-3">
      <span className="f-body text-xs" style={{ color: C.dim }}>{k}</span>
      <span className="f-num text-sm shrink-0" style={{ color: C.chalk }}>{v}</span>
    </div>
    {/* Пояснение слева и на всю ширину: прижатое вправо, оно ломается
        на три рваные строки и читается хуже самой цифры. */}
    {hint && <div className="f-body text-2xs mt-0.5" style={{ color: C.dim }}>{hint}</div>}
  </div>
);
const UniTag = () => (
  <span className="f-body text-2xs rounded px-1 py-0.5 ml-1 align-middle" style={{ background: C.blue, color: C.chalk }}>×2</span>
);

/**
 * Кнопка необратимого действия: первое касание взводит её, второе выполняет.
 * Отдельным окном не делаем — их и так много, а вложенные листы уже
 * однажды перекрыли друг друга. Взвод сам снимается через несколько секунд.
 */
function ConfirmButton({ onConfirm, question = "Точно?", className, style, children }) {
  const [armed, setArmed] = useState(false);
  /* Взвод намеренно не снимается сам: пять секунд мало тому, кому нужно
     прочитать вопрос и подумать, а исчезающая кнопка ещё и пугает. */

  if (!armed) {
    return (
      <button onClick={() => setArmed(true)} className={className} style={style}>
        {children}
      </button>
    );
  }
  return (
    <div className="flex gap-1.5 items-center">
      <span className="f-body text-xs flex-1 text-center" style={{ color: C.redText }}>{question}</span>
      <button onClick={() => { setArmed(false); onConfirm(); }} className="f-body rounded-lg px-3 py-2 text-xs font-medium" style={{ background: C.red, color: C.chalk }}>Да</button>
      <button onClick={() => setArmed(false)} className="f-body rounded-lg px-3 py-2 text-xs" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>Нет</button>
    </div>
  );
}

/* Маленький значок рядом с названием: красный — не рекомендуется при твоих
   состояниях, жёлтый — с осторожностью. Без выбранных состояний не рисуется. */
const RiskMark = ({ name, conditions }) => {
  const r = worstRisk(name, conditions);
  if (!r) return null;
  return (
    <span className="inline-flex align-middle ml-1" title={r === 2 ? "не рекомендуется при твоих ограничениях" : "с осторожностью"}>
      {r === 2 ? <ShieldAlert size={13} color={C.redText} /> : <TriangleAlert size={12} color={C.mustard} />}
    </span>
  );
};

/** Блок предупреждений и замен — показывается в карточке упражнения. */
function RiskPanel({ name, conditions, onOpen }) {
  const risks = risksFor(name, conditions);
  const good = helpfulNote(name, conditions);
  const alts = saferAlternatives(name, conditions);
  if (!risks.length && !good) return null;

  const worst = risks[0]?.level || 0;
  const accent = worst === 2 ? C.red : worst === 1 ? C.mustard : C.moss;

  return (
    <div className="rounded-lg p-3 mb-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${accent}` }}>
      {risks.length > 0 && (
        <>
          <div className="f-body text-xs uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: accent }}>
            {worst === 2 ? <ShieldAlert size={13} /> : <TriangleAlert size={13} />}
            {worst === 2 ? "Не рекомендуется" : "С осторожностью"}
          </div>
          <div className="space-y-1.5">
            {risks.map((r) => (
              <div key={r.id} className="f-body text-sm" style={{ color: C.chalk }}>
                <span style={{ color: r.level === 2 ? C.red : C.mustard }}>{r.name}.</span>{" "}
                {r.note || CONDITION_BY_ID[r.id]?.guide}
              </div>
            ))}
          </div>
        </>
      )}

      {good && (
        <div className="f-body text-sm flex items-start gap-1.5" style={{ color: C.mossText, marginTop: risks.length ? 10 : 0 }}>
          <HeartPulse size={14} className="shrink-0 mt-0.5" />
          <span><span className="font-medium">{good.name} — полезно.</span> {good.note}</span>
        </div>
      )}

      {alts.length > 0 && (
        <div className="mt-3">
          <div className="f-body text-xs uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: C.dim }}>
            <Repeat2 size={13} /> Чем заменить
          </div>
          <div className="space-y-1">
            {alts.map((a) => (
              <button key={a.name} onClick={() => onOpen?.(a.name)} className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <span className="min-w-0">
                  <span className="f-body text-sm block" style={{ color: C.chalk }}>{a.name}</span>
                  <span className="f-body text-xs" style={{ color: C.dim }}>
                    {a.eq}
                    {!a.sameMuscle && ` · другая мышца: ${a.muscle}`}
                    {a.risk === 1 && " · тоже с осторожностью"}
                  </span>
                </span>
                <ChevronDown size={13} color={C.dim} className="-rotate-90 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Список упражнений с поиском — одинаково нужен и в редакторе дней,
 * и при добавлении упражнения в идущую тренировку.
 */
function ExercisePicker({ title, onPick, onClose, has, conditions = [] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = useMemo(() => {
    const all = Object.keys(EXDB);
    if (query.length < 2) return all;
    return all.filter((n) => n.toLowerCase().includes(query) || EXDB[n].m.toLowerCase().includes(query));
  }, [query]);

  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-2" style={{ color: C.chalk }}>{title}</div>
      <div className="relative mb-3">
        <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или мышце…" aria-label="Поиск упражнения"
          className="f-body w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
      </div>
      <div className="space-y-1">
        {!list.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Ничего не нашлось.</div>}
        {list.map((n) => {
          const already = has?.(n);
          return (
            <button key={n} onClick={() => onPick(n)} disabled={already} className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
              style={{ background: C.surfaceHi, opacity: already ? 0.45 : 1 }}>
              <span className="min-w-0">
                <span className="f-body text-xs block" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
                <span className="f-body text-2xs" style={{ color: C.dim }}>{EXDB[n].m} · {EXDB[n].eq}</span>
              </span>
              {already ? <Check size={14} color={C.mossText} /> : <Plus size={14} color={C.mossText} />}
            </button>
          );
        })}
      </div>
      <button onClick={onClose} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Готово</button>
    </Sheet>
  );
}

/** Разбор техники: исходное положение, ход движения, ключевые точки, ошибки, дыхание. */
function TechniqueBlock({ name, fallbackCue }) {
  const t = TECHNIQUE[name];

  /* своё упражнение или база ещё не дополнена — показываем короткую подсказку */
  if (!t) {
    return fallbackCue ? (
      <div className="rounded-lg p-3 mb-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${C.mustard}` }}>
        <div className="f-body text-xs uppercase tracking-wide mb-1" style={{ color: C.mustard }}>Ключ к технике</div>
        <div className="f-body text-sm" style={{ color: C.chalk }}>{fallbackCue}</div>
      </div>
    ) : null;
  }

  /* Разбор техники — самый длинный текст в приложении, и его читают.
     Раньше он лежал в трёх вложенных карточках: лист → карточка → строка
     с рамкой. Каждая рамка съедала ширину и добавляла шума — отсюда
     жалоба на «пустые места». Коробок больше нет: разделы разделены
     тонкой линией, роль каждого несёт заголовок и цвет, а освободившаяся
     ширина ушла в размер текста. */

  const Step = ({ n, title, children }) => (
    <div className="flex gap-2.5 mb-3">
      <span className="f-num shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-2xs font-semibold mt-1"
        style={{ background: C.surfaceHi, color: C.dim }}>{n}</span>
      <div className="min-w-0">
        <div className="f-body text-xs uppercase tracking-wide mb-0.5" style={{ color: C.dim }}>{title}</div>
        <div className="f-body text-base leading-relaxed" style={{ color: C.chalk }}>{children}</div>
      </div>
    </div>
  );

  const List = ({ title, color, marker, items }) => (
    <div className="pt-3 mt-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="f-body text-xs uppercase tracking-wide mb-1.5" style={{ color }}>{title}</div>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c} className="f-body text-base flex gap-2 leading-relaxed" style={{ color: C.chalk }}>
            <span className="shrink-0" aria-hidden="true" style={{ color }}>{marker}</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="mb-3">
      <Step n="1" title="Исходное положение">{t.setup}</Step>
      <Step n="2" title="Ход движения">{t.exec}</Step>
      <div className="f-body text-sm flex items-start gap-1.5 ml-7" style={{ color: C.blueText }}>
        <Activity size={13} className="shrink-0 mt-1" />
        <span>{t.breath}</span>
      </div>
      <List title="Ключевые точки" color={C.mustard} marker="·" items={t.cues} />
      <List title="Частые ошибки" color={C.redText} marker="×" items={t.mistakes} />
    </div>
  );
}

function ExerciseInfo({ name, onClose, days, onAddToDay, conditions = [] }) {
  const [shown, setShown] = useState(name);
  useEffect(() => setShown(name), [name]);
  const info = EXDB[shown];
  const [pick, setPick] = useState(false);
  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>
        {shown}
        {shown !== name && (
          <button onClick={() => setShown(name)} className="tap-inline f-body text-xs ml-2 align-middle underline" style={{ color: C.blueText }}>← назад</button>
        )}
      </div>
      {info ? (<>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="f-body text-xs rounded-full px-2 py-0.5" style={{ background: C.red, color: C.chalk }}>{info.m}</span>
          <span className="f-body text-xs rounded-full px-2 py-0.5" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>{info.g}</span>
          <span className="f-body text-xs rounded-full px-2 py-0.5" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>{info.eq}</span>
          {info.uni && <span className="f-body text-xs rounded-full px-2 py-0.5" style={{ background: C.blue, color: C.chalk }}>одностороннее</span>}
        </div>
        <RiskPanel name={shown} conditions={conditions} onOpen={setShown} />
        <div className="f-body text-sm leading-relaxed mb-3" style={{ color: C.chalk }}>{info.d}</div>
        <TechniqueBlock name={shown} fallbackCue={info.cue} />
        {info.uni && <div className="f-body text-xs mb-3" style={{ color: C.blueText }}>Одностороннее: записывай один подход — приложение считает обе стороны, тоннаж умножается на два.</div>}
      </>) : <div className="f-body text-sm mb-3" style={{ color: C.dim }}>Своё упражнение — описания пока нет.</div>}

      <a href={ytLink(shown)} target="_blank" rel="noopener noreferrer" className="f-body flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
        <ExternalLink size={15} /> Разборы техники на YouTube
      </a>

      {onAddToDay && days && (pick ? (
        <div className="mt-2 space-y-1.5">
          <div className="f-body text-xs" style={{ color: C.dim }}>В какой день добавить?</div>
          {days.map((d) => (
            <button key={d.id} onClick={() => { onAddToDay(d.id, shown); onClose(); }} className="f-body w-full text-left rounded-lg px-3 py-2.5 text-sm" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              {d.name}{d.exercises.includes(shown) && <span style={{ color: C.mossText }}> · уже есть</span>}
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setPick(true)} className="f-body w-full mt-2 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
          <Plus size={15} /> Добавить в день
        </button>
      ))}
      <button onClick={onClose} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
    </Sheet>
  );
}

/* ============ общее для сессии и записи задним числом ============ */

/** Последний раз, когда это упражнение делали. */
function lastExerciseOf(workouts, name) {
  for (const w of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
    const ex = w.exercises.find((e) => e.name === name);
    if (ex) return { date: w.date, ex };
  }
  return null;
}

/** Заготовка упражнения: число подходов и веса берутся из прошлого раза. */
/* Вес подхода при сохранении. Своим весом поле означает утяжеление
   и остаётся пустым, если его не было, — тогда пишем null, а не ноль:
   ноль в записи выглядит как «поднял ноль килограммов». */
function setWeight(ex, set) {
  if (!ex.bodyweight) return +set.weight;
  return set.weight === "" || set.weight == null ? null : +set.weight;
}

function draftExercise(name, workouts) {
  const prev = lastExerciseOf(workouts, name);
  const bw = isBW(name);
  const nSets = prev ? prev.ex.sets.length : 3;
  return {
    name,
    bodyweight: bw,
    uni: isUni(name),
    sets: Array.from({ length: nSets }, (_, i) => ({
      reps: "",
      weight: prev?.ex.sets[i]?.weight ?? prev?.ex.sets[0]?.weight ?? "",
      done: false,
    })),
  };
}

/* ============ SESSION ============ */
const elapsedMs = (s, now) => (s.accumMs || 0) + (s.paused ? 0 : now - (s.resumedAt || s.startedAt || now));
const fmtClock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

/** Секунда тика живёт здесь, а не в SessionTab — иначе каждую секунду
    перерисовывались бы все упражнения вместе с полями ввода. */
function useTicker(active) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [active]);
}

/** Часы тренировки: крупная цифра, её видно с вытянутой руки. */
function Elapsed({ session, doneSets, live }) {
  useTicker(!session.paused);
  return (
    <div>
      <div className="f-num text-3xl font-bold leading-none tabular-nums" style={{ color: session.paused ? C.mustard : C.chalk }}>
        {fmtClock(elapsedMs(session, Date.now()))}
      </div>
      <div className="f-body text-xs mt-1" style={{ color: C.dim }}>
        {doneSets} подх. · {live.toLocaleString("ru-RU")} кг
      </div>
    </div>
  );
}

/* Отдых считается от метки времени в самой сессии, а сессия сохраняется —
   поэтому таймер переживает сворачивание и перезапуск приложения. */

/**
 * Полоса отдыха во всю ширину: крупный счётчик, убывающая заливка,
 * подстройка длительности на месте и сигнал в конце.
 */
function RestBar({ rest, onDone, onAdjust, onSkip, muted }) {
  useTicker(true);
  const { until, total, exName } = rest;
  const leftMs = until - Date.now();
  const left = Math.max(0, Math.ceil(leftMs / 1000));
  const done = leftMs <= 0;

  /* Звук планируется заранее, а не играется по тику: часы Web Audio идут,
     даже когда приложение свёрнуто и таймеры JavaScript заморожены.
     Эффект перезапускается при правке времени и при возврате в приложение
     после перезагрузки — поэтому сигнал не теряется. */
  useEffect(() => {
    if (muted) return;
    const delay = (until - Date.now()) / 1000;
    if (delay <= 0) return;
    scheduleRestOver(delay);
    return cancelScheduled;
  }, [until, muted]);

  /* вибрация планированию не поддаётся — её даём по факту */
  const buzzed = useRef(false);
  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      if (!muted) vibrate();
    }
  }, [done, muted]);

  const pct = total > 0 ? Math.max(0, Math.min(100, (leftMs / (total * 1000)) * 100)) : 0;
  const accent = done ? C.moss : left <= 10 ? C.mustard : C.red;

  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ background: C.surface, border: `1px solid ${accent}` }}>
      <div className="px-3.5 pt-3 pb-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="f-body text-2xs uppercase tracking-wide flex items-center gap-1" style={{ color: accent }}>
            <Timer size={12} /> {done ? "Отдых окончен" : "Отдых"}
          </div>
          <div className="f-body text-xs mt-0.5" style={{ color: C.dim }}>{exName}</div>
        </div>
        <div className="f-num text-4xl font-bold leading-none tabular-nums shrink-0" style={{ color: accent }}>
          {done ? "0:00" : fmtClock(left * 1000)}
        </div>
      </div>

      <div className="h-1.5 mx-3.5 rounded-full overflow-hidden" style={{ background: C.line }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent, transition: "width 1s linear" }} />
      </div>

      <div className="flex gap-1.5 p-3">
        <button onClick={() => onAdjust(-1)} className="f-num flex-1 rounded-lg py-2 text-xs font-semibold" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>−15</button>
        <button onClick={() => onAdjust(1)} className="f-num flex-1 rounded-lg py-2 text-xs font-semibold" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>+15</button>
        <button onClick={done ? onDone : onSkip} className="f-body flex-[1.6] rounded-lg py-2 text-xs font-medium" style={{ background: done ? accent : C.surfaceHi, color: done ? C.bg : C.dim, border: `1px solid ${done ? accent : C.line}` }}>
          {done ? "Продолжить" : "Пропустить"}
        </button>
      </div>
    </div>
  );
}

function SessionTab({ session, setSession, workouts, days, onFinish, goToDays, conditions, restOverrides, setRestOverride, muted, bodyAt }) {
  const [pickDay, setPickDay] = useState(days[0]?.id);
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const [info, setInfo] = useState(null);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);

  const day = days.find((d) => d.id === pickDay) || days[0];
  useEffect(() => { if (day) setPicked(day.exercises); }, [pickDay, days.length]); // eslint-disable-line

  /* объявлено до раннего возврата ниже — хуки нельзя вызывать под условием */
  const clearRest = useCallback(() => setSession((s) => (s?.rest ? { ...s, rest: null } : s)), [setSession]);

  /* пока идёт тренировка, экран не гаснет */
  useWakeLock(!!session);

  /** ±15 секунд: правит текущий отсчёт и запоминает новое время для упражнения */
  const adjustRest = useCallback((dir) => {
    setSession((s) => {
      if (!s?.rest) return s;
      const total = stepRest(s.rest.total, dir);
      const delta = (total - s.rest.total) * 1000;
      return { ...s, rest: { ...s.rest, total, until: s.rest.until + delta } };
    });
  }, [setSession]);

  const lastFor = useCallback((name) => lastExerciseOf(workouts, name), [workouts]);

  /* «8×60» — восемь по шестьдесят; «8+10» — восемь своим весом с блином
     на десять; просто «8» — восемь без утяжеления. */
  const setsLine = (ex) => ex.sets.map((s) => (ex.bodyweight ? (+s.weight ? `${s.reps}+${s.weight}` : s.reps) : `${s.reps}×${s.weight}`)).join(" · ");

  const blankExercise = useCallback((n) => draftExercise(n, workouts), [workouts]);

  /** Последняя тренировка этого дня — для кнопки «повторить». */
  const lastWorkoutOfDay = useMemo(() => {
    if (!day) return null;
    return [...workouts].sort((a, b) => b.date.localeCompare(a.date)).find((w) => w.dayId === day.id) || null;
  }, [workouts, day]);

  if (!session) {
    if (!days.length) return <div className="px-4 py-16 text-center f-body text-sm" style={{ color: C.dim }}>Нет ни одного дня. Создай его во вкладке «База».</div>;
    const toggle = (n) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
    const start = (names = picked) => {
      if (!names.length) return;
      primeAudio(); /* касание пользователя — момент, когда iOS разрешает звук */
      setSession({
        id: uid(), date: today(), dayId: day.id, dayLabel: day.name,
        startedAt: Date.now(), resumedAt: Date.now(), accumMs: 0, paused: false, note: "",
        exercises: names.map(blankExercise),
      });
    };
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="f-body text-xs" style={{ color: C.dim }}>Собери тренировку</span>
          <button onClick={goToDays} className="f-body text-xs flex items-center gap-1 px-2" style={{ color: C.blueText }}><Pencil size={14} /> дни</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button key={d.id} onClick={() => setPickDay(d.id)} className="f-body shrink-0 rounded-full px-3 py-1.5 text-xs font-medium max-w-[60vw] truncate"
              style={{ background: day?.id === d.id ? C.red : C.surface, color: day?.id === d.id ? C.chalk : C.dim, border: `1px solid ${day?.id === d.id ? C.red : C.line}` }}>{d.name}</button>
          ))}
        </div>
        <div className="space-y-1.5 mt-3">
          {[...new Set([...(day?.exercises || []), ...picked])].map((n) => {
            const on = picked.includes(n); const prev = lastFor(n);
            const up = prev && readyToAdd(prev.ex);
            return (
              <div key={n} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${on ? C.moss : C.line}` }}>
                <button onClick={() => toggle(n)} aria-label={`${n}: ${on ? "убрать из тренировки" : "добавить в тренировку"}`} aria-pressed={on} className="shrink-0 flex items-center justify-center">
                  <span className="w-6 h-6 rounded flex items-center justify-center" style={{ background: on ? C.moss : "transparent", border: `1px solid ${on ? C.moss : C.line}` }}>
                    {on && <Check size={16} color={C.chalk} />}
                  </span>
                </button>
                <button onClick={() => toggle(n)} className="flex-1 text-left min-w-0">
                  <div className="f-body text-sm" style={{ color: on ? C.chalk : C.dim }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                  {prev && <div className="f-num text-2xs truncate" style={{ color: C.dim }}>{fmtDate(prev.date)}: {setsLine(prev.ex)}</div>}
                  {up && <div className="f-body text-2xs" style={{ color: C.mustard }}>{isBW(n) ? "выбил верх диапазона — пробуй с утяжелением" : "выбил верх диапазона — пробуй +2.5 кг"}</div>}
                </button>
                <button onClick={() => setInfo(n)} aria-label={`Об упражнении «${n}»`} className="shrink-0 flex items-center justify-center"><Info size={18} color={C.dim} /></button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Разовое упражнение…" aria-label="Название разового упражнения" className="f-body flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
          <button onClick={() => { if (custom.trim()) { setPicked((p) => [...p, custom.trim()]); setCustom(""); } }} aria-label="Добавить разовое упражнение" className="rounded-lg px-3 flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}`, color: C.chalk }}><Plus size={18} /></button>
        </div>
        <button onClick={() => start()} disabled={!picked.length} className="f-display w-full mt-5 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: picked.length ? C.red : C.surface, color: picked.length ? C.chalk : C.dim }}>
          <Play size={18} /> Начать тренировку ({picked.length})
        </button>

        {lastWorkoutOfDay && (
          <button
            onClick={() => start(lastWorkoutOfDay.exercises.map((e) => e.name))}
            className="f-body w-full mt-2 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
            style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }}>
            <RotateCcw size={15} color={C.dim} />
            Повторить прошлую ({fmtDate(lastWorkoutOfDay.date)}, {lastWorkoutOfDay.exercises.length} упр.)
          </button>
        )}
        {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} conditions={conditions} />}
      </div>
    );
  }

  /* активная */
  const upd = (i, j, f, v) => setSession((s) => {
    const ex = [...s.exercises]; const e = { ...ex[i], sets: [...ex[i].sets] };
    e.sets[j] = { ...e.sets[j], [f]: v }; ex[i] = e; return { ...s, exercises: ex };
  });
  const markDone = (i, j) => {
    const ex = session.exercises[i];
    const s = ex.sets[j];
    tapBuzz();
    if (!s.done && s.reps) {
      /* касание пользователя — единственный момент, когда iOS разрешает включить звук */
      primeAudio();
      const total = restFor(ex.name, restOverrides);
      setSession((prev) => ({ ...prev, rest: { until: Date.now() + total * 1000, total, exName: ex.name } }));
    }
    upd(i, j, "done", !s.done);
  };
  const addSet = (i) => setSession((s) => {
    const ex = [...s.exercises]; const e = { ...ex[i] };
    const last = e.sets[e.sets.length - 1] || { reps: "", weight: "" };
    e.sets = [...e.sets, { reps: "", weight: last.weight, done: false }]; ex[i] = e; return { ...s, exercises: ex };
  });
  const rmExercise = (i) => setSession((s) => ({ ...s, exercises: s.exercises.filter((_, k) => k !== i) }));
  /* решил доделать что-то сверх плана — добавляем прямо на ходу */
  const addExercise = (n) => setSession((s) =>
    s.exercises.some((e) => e.name === n) ? s : { ...s, exercises: [...s.exercises, blankExercise(n)] });
  const togglePause = () => setSession((s) => s.paused
    ? { ...s, paused: false, resumedAt: Date.now() }
    : { ...s, paused: true, accumMs: (s.accumMs || 0) + (Date.now() - (s.resumedAt || s.startedAt)) });

  const live = workoutTonnage({ exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })) }, bodyAt?.(session.date));
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const finish = () => {
    const cleaned = session.exercises.map((e) => ({
      name: e.name, bodyweight: e.bodyweight, uni: !!e.uni,
      sets: e.sets.filter((s) => s.reps !== "" && (e.bodyweight || s.weight !== "")).map((s) => ({ reps: +s.reps, weight: setWeight(e, s) })),
    })).filter((e) => e.sets.length);
    setMenu(false);
    if (!cleaned.length) { setSession(null); return; }
    const ms = elapsedMs(session, Date.now());
    onFinish({ id: session.id, date: session.date, dayId: session.dayId, dayLabel: session.dayLabel, note: session.note, durationMin: Math.max(1, Math.round(ms / 60000)), exercises: cleaned });
  };

  return (
    <div className="px-4 pt-3 pb-10">
      {session.rest && (
        <RestBar
          rest={session.rest}
          muted={muted}
          onDone={clearRest}
          onSkip={clearRest}
          onAdjust={(dir) => {
            adjustRest(dir);
            setRestOverride(session.rest.exName, stepRest(session.rest.total, dir));
          }}
        />
      )}

      <div className="rounded-xl px-3.5 py-3" style={{ background: C.surfaceHi, border: `1px solid ${session.paused ? C.mustard : C.line}` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="f-display text-sm font-semibold mb-1.5" style={{ color: C.chalk }}>{session.dayLabel}</div>
            <Elapsed session={session} doneSets={doneSets} live={live} />
          </div>
          <button onClick={togglePause} className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.surface, border: `1px solid ${session.paused ? C.mustard : C.line}` }}>
            {session.paused ? <Play size={20} color={C.mustard} /> : <Pause size={20} color={C.dim} />}
          </button>
        </div>
        <div className="flex gap-2 mt-2.5">
          <button onClick={finish} className="f-display flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => setMenu(true)} aria-label="Ещё действия" className="w-11 rounded-lg flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}` }}><MoreHorizontal size={20} color={C.dim} /></button>
        </div>
        {session.paused && <div className="f-body text-xs mt-2" style={{ color: C.mustard }}>Пауза — время не идёт. Можно закрыть приложение и вернуться.</div>}
      </div>

      <div className="mt-3 space-y-3">
        {session.exercises.map((ex, i) => {
          const prev = lastFor(ex.name);
          return (
            <div key={i} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="f-body text-sm font-medium" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}<RiskMark name={ex.name} conditions={conditions} /></div>
                  {ex.uni && <div className="f-body text-2xs" style={{ color: C.blueText }}>вводи один подход — считается за обе стороны</div>}
                  {prev && <div className="f-num text-2xs truncate" style={{ color: C.dim }}>прошлый раз: {setsLine(prev.ex)}</div>}
                  <div className="f-body text-2xs flex items-center gap-1 mt-0.5" style={{ color: C.dim }}>
                    <Timer size={10} /> отдых {fmtRest(restFor(ex.name, restOverrides))}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setInfo(ex.name)} aria-label={`Об упражнении «${ex.name}»`} className="flex items-center justify-center"><Info size={18} color={C.dim} /></button>
                  <button onClick={() => rmExercise(i)} aria-label={`Убрать «${ex.name}» из тренировки`} className="flex items-center justify-center"><Trash2 size={18} color={C.dim} /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {ex.sets.map((s, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="f-num text-xs w-3" style={{ color: C.dim }}>{j + 1}</span>
                    <input type="number" inputMode="numeric" placeholder="повт" aria-label={`${ex.name}, подход ${j + 1}: повторения`} value={s.reps} onChange={(e) => upd(i, j, "reps", e.target.value)} className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${C.line}` }} />
                    {/* Своим весом поле не прячем: подтягивания делают и с блином
                        на поясе, икры — с гантелью. Пустое поле значит «без утяжеления». */}
                    <span className="f-body text-xs" aria-hidden="true" style={{ color: C.dim }}>{ex.bodyweight ? "+" : "×"}</span>
                    <input type="number" inputMode="decimal" placeholder={ex.bodyweight ? "+кг" : "кг"}
                      aria-label={`${ex.name}, подход ${j + 1}: ${ex.bodyweight ? "утяжеление в килограммах" : "вес в килограммах"}`}
                      value={s.weight ?? ""} onChange={(e) => upd(i, j, "weight", e.target.value)}
                      className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0"
                      style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${C.line}` }} />
                    <button onClick={() => markDone(i, j)} aria-label={`Подход ${j + 1}: ${s.done ? "снять отметку" : "выполнен"}`} aria-pressed={!!s.done} className="shrink-0 rounded-lg flex items-center justify-center" style={{ background: s.done ? C.moss : C.surfaceHi, border: `1px solid ${s.done ? C.moss : C.line}` }}>
                      <Check size={20} color={s.done ? C.chalk : C.dim} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => addSet(i)} className="f-body mt-2 text-xs" style={{ color: C.mossText }}>+ подход</button>
            </div>
          );
        })}
      </div>

      <button onClick={() => setAdding(true)} className="f-body w-full mt-3 rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surface, color: C.mossText, border: `1px solid ${C.line}` }}>
        <Plus size={15} /> Добавить упражнение
      </button>

      <textarea value={session.note} onChange={(e) => setSession((s) => ({ ...s, note: e.target.value }))} placeholder="Заметка: самочувствие, плечо, сон, что тянуло…" aria-label="Заметка к тренировке" rows={2}
        className="f-body w-full mt-3 rounded-xl px-3 py-2.5 text-sm resize-none" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
      <button onClick={finish} className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={18} /> Завершить и сохранить</button>

      {adding && (
        <ExercisePicker
          title="Добавить в тренировку"
          conditions={conditions}
          has={(n) => session.exercises.some((e) => e.name === n)}
          onPick={addExercise}
          onClose={() => setAdding(false)}
        />
      )}

      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <div className="f-display text-base font-semibold mb-3" style={{ color: C.chalk }}>Тренировка</div>
          <button onClick={finish} className="f-body w-full rounded-xl py-3 text-sm font-medium mb-2 flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => { togglePause(); setMenu(false); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            {session.paused ? <><Play size={15} /> Продолжить</> : <><Pause size={15} /> Пауза</>}
          </button>
          <div className="f-body text-xs mb-1 mt-3" style={{ color: C.dim }}>Прервать — тренировка не сохранится в журнал.</div>
          <ConfirmButton onConfirm={() => { setSession(null); setMenu(false); }} question="Тренировка не сохранится" className="f-body w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Прервать без сохранения</ConfirmButton>
          <button onClick={() => setMenu(false)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}
      {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} conditions={conditions} />}
    </div>
  );
}

/* ============ CATALOG / DAYS ============ */
function Catalog({ days, onAddToDay, conditions }) {
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState(null);
  const [openM, setOpenM] = useState(null);
  const [info, setInfo] = useState(null);

  const found = q.trim().length > 1
    ? Object.keys(EXDB).filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()) || EXDB[n].m.toLowerCase().includes(q.trim().toLowerCase()))
    : null;

  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск среди ${Object.keys(EXDB).length} упражнений…`} aria-label="Поиск по базе упражнений"
          className="f-body w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
      </div>

      {found ? (
        <div className="space-y-1.5">
          {!found.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Ничего не нашлось.</div>}
          {found.map((n) => (
            <button key={n} onClick={() => setInfo(n)} className="w-full text-left rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="f-body text-sm" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
              <div className="f-body text-2xs" style={{ color: C.dim }}>{EXDB[n].m} · {EXDB[n].eq}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {GROUPS.map((g) => {
            const count = g.muscles.reduce((s, m) => s + m.list.length, 0);
            const open = openG === g.name;
            return (
              <div key={g.name} className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <button onClick={() => { setOpenG(open ? null : g.name); setOpenM(null); }} className="w-full flex items-center justify-between px-3.5 py-3">
                  <span className="f-display text-sm font-semibold" style={{ color: C.chalk }}>{g.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="f-num text-xs" style={{ color: C.dim }}>{count}</span>
                    {open ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
                  </span>
                </button>
                {open && (
                  <div className="px-2 pb-2 space-y-1">
                    {g.muscles.map((m) => {
                      const mo = openM === m.name;
                      return (
                        <div key={m.name} className="rounded-lg overflow-hidden" style={{ background: C.surfaceHi }}>
                          <button onClick={() => setOpenM(mo ? null : m.name)} className="w-full flex items-center justify-between px-3 py-2">
                            <span className="f-body text-xs font-medium" style={{ color: mo ? C.red : C.chalk }}>{m.name}</span>
                            <span className="f-num text-2xs" style={{ color: C.dim }}>{m.list.length}</span>
                          </button>
                          {mo && (
                            <div className="pb-1">
                              {m.list.map((n) => (
                                <button key={n} onClick={() => setInfo(n)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                                  <span className="f-body text-xs min-w-0" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
                                  <span className="f-body text-2xs shrink-0" style={{ color: C.dim }}>{EXDB[n].eq}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} days={days} onAddToDay={onAddToDay} conditions={conditions} />}
    </div>
  );
}

function DaysEditor({ days, setDays, conditions }) {
  const [open, setOpen] = useState(null);
  const [pickFor, setPickFor] = useState(null);
  const [presets, setPresets] = useState(false);

  const rename = (id, name) => setDays(days.map((d) => (d.id === id ? { ...d, name } : d)));
  const removeEx = (id, n) => setDays(days.map((d) => (d.id === id ? { ...d, exercises: d.exercises.filter((x) => x !== n) } : d)));
  const move = (id, i, dir) => setDays(days.map((d) => {
    if (d.id !== id) return d;
    const arr = [...d.exercises]; const j = i + dir;
    if (j < 0 || j >= arr.length) return d;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...d, exercises: arr };
  }));
  const addEx = (id, n) => setDays(days.map((d) => (d.id === id && !d.exercises.includes(n) ? { ...d, exercises: [...d.exercises, n] } : d)));
  const delDay = (id) => setDays(days.filter((d) => d.id !== id));
  const newDay = () => { const id = uid(); setDays([...days, { id, name: "Новый день", exercises: [] }]); setOpen(id); };
  const applyPreset = (key) => {
    const p = PRESETS[key];
    setDays([...days, ...p.days.map((d) => ({ id: uid(), name: d.name, exercises: d.ex }))]);
    setPresets(false);
  };


  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button onClick={newDay} className="f-body flex-1 rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5" style={{ background: C.red, color: C.chalk }}><Plus size={15} /> Новый день</button>
        <button onClick={() => setPresets(true)} className="f-body flex-1 rounded-xl py-2.5 text-sm flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Layers size={15} /> Готовый сплит</button>
      </div>

      <div className="space-y-2">
        {days.map((d) => {
          const o = open === d.id;
          const warn = dayWarnings(d.exercises, conditions);
          return (
            <div key={d.id} className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <button onClick={() => setOpen(o ? null : d.id)} className="w-full flex items-center justify-between px-3.5 py-3">
                <div className="min-w-0 text-left">
                  <div className="f-display text-sm font-semibold truncate" style={{ color: C.chalk }}>{d.name}</div>
                  <div className="f-body text-xs flex items-center gap-2" style={{ color: C.dim }}>
                    <span>{d.exercises.length} упражнений</span>
                    {warn.avoid > 0 && <span className="flex items-center gap-0.5" style={{ color: C.redText }}><ShieldAlert size={11} />{warn.avoid}</span>}
                    {warn.care > 0 && <span className="flex items-center gap-0.5" style={{ color: C.mustard }}><TriangleAlert size={11} />{warn.care}</span>}
                  </div>
                </div>
                {o ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
              </button>
              {o && (
                <div className="px-3 pb-3">
                  <input value={d.name} onChange={(e) => rename(d.id, e.target.value)} aria-label="Название дня" className="f-body w-full rounded-lg px-3 py-2 text-sm mb-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
                  <div className="space-y-1">
                    {d.exercises.map((n, i) => (
                      <div key={n} className="flex items-center gap-1 rounded-lg pl-2.5 py-1" style={{ background: C.surfaceHi }}>
                        <div className="flex-1 min-w-0 py-1">
                          <div className="f-body text-xs" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                          {EXDB[n] && <div className="f-body text-2xs" style={{ color: C.dim }}>{EXDB[n].m}</div>}
                        </div>
                        {/* стрелки в ряд, а не стопкой: стопка из двух целей по 44px
                            растянула бы строку вдвое */}
                        <button onClick={() => move(d.id, i, -1)} disabled={i === 0}
                          aria-label={`Переместить «${n}» выше`}
                          className="shrink-0 flex items-center justify-center" style={{ opacity: i === 0 ? 0.3 : 1 }}>
                          <ChevronUp size={18} color={C.dim} />
                        </button>
                        <button onClick={() => move(d.id, i, 1)} disabled={i === d.exercises.length - 1}
                          aria-label={`Переместить «${n}» ниже`}
                          className="shrink-0 flex items-center justify-center" style={{ opacity: i === d.exercises.length - 1 ? 0.3 : 1 }}>
                          <ChevronDown size={18} color={C.dim} />
                        </button>
                        <button onClick={() => removeEx(d.id, n)} aria-label={`Убрать «${n}» из дня`}
                          className="shrink-0 flex items-center justify-center"><X size={18} color={C.dim} /></button>
                      </div>
                    ))}
                    {!d.exercises.length && <div className="f-body text-xs text-center py-3" style={{ color: C.dim }}>Пока пусто — добавь упражнения.</div>}
                  </div>
                  <button onClick={() => setPickFor(d.id)} className="f-body w-full mt-2 rounded-lg py-2.5 text-sm flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.mossText, border: `1px solid ${C.line}` }}><Plus size={14} /> Добавить упражнение</button>
                  <div className="mt-1.5"><ConfirmButton onConfirm={() => delDay(d.id)} question="Удалить день целиком?" className="f-body w-full py-2 text-xs flex items-center justify-center gap-1.5" style={{ color: C.redText }}><Trash2 size={12} /> Удалить день</ConfirmButton></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pickFor && (
        <ExercisePicker
          title={`Добавить в «${days.find((d) => d.id === pickFor)?.name}»`}
          conditions={conditions}
          has={(n) => !!days.find((d) => d.id === pickFor)?.exercises.includes(n)}
          onPick={(n) => addEx(pickFor, n)}
          onClose={() => setPickFor(null)}
        />
      )}

      {presets && (
        <Sheet onClose={() => setPresets(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Готовые сплиты</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Дни добавятся к существующим — старые не удалятся.</div>
          <div className="space-y-2">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => applyPreset(k)} className="w-full text-left rounded-xl p-3" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
                <div className="f-display text-sm font-semibold" style={{ color: C.chalk }}>{p.name}</div>
                <div className="f-body text-xs mb-1.5" style={{ color: C.dim }}>{p.desc}</div>
                <div className="f-body text-2xs" style={{ color: C.blueText }}>{p.days.map((d) => d.name.split(" (")[0]).join(" · ")}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPresets(false)} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}
    </div>
  );
}

function BaseTab({ days, setDays, initialView, conditions }) {
  const [view, setView] = useState(initialView || "catalog");
  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);
  const addToDay = (id, n) => setDays(days.map((d) => (d.id === id && !d.exercises.includes(n) ? { ...d, exercises: [...d.exercises, n] } : d)));
  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${C.line}` }}>
        {[["catalog", "Упражнения"], ["days", "Мои дни"]].map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} className="f-body flex-1 text-xs py-2" style={{ background: view === id ? C.red : C.surface, color: view === id ? C.chalk : C.dim }}>{l}</button>
        ))}
      </div>
      {view === "catalog" ? <Catalog days={days} onAddToDay={addToDay} conditions={conditions} /> : <DaysEditor days={days} setDays={setDays} conditions={conditions} />}
    </div>
  );
}

/* ============ JOURNAL ============ */
/**
 * Форма тренировки: правка записанной и запись задним числом — одно и то же.
 * Разница только в заголовке и в том, куда уходит результат.
 */
function EditWorkout({ workout, onSave, onClose, workouts = [], conditions = [], isNew = false, bodyAt }) {
  const [adding, setAdding] = useState(false);
  /* работаем на копии — «Отмена» должна оставлять запись нетронутой */
  const [draft, setDraft] = useState(() => ({
    ...workout,
    exercises: workout.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })),
  }));

  const setField = (f, v) => setDraft((d) => ({ ...d, [f]: v }));
  const updSet = (i, j, f, v) => setDraft((d) => {
    const ex = [...d.exercises];
    const e = { ...ex[i], sets: [...ex[i].sets] };
    e.sets[j] = { ...e.sets[j], [f]: v };
    ex[i] = e;
    return { ...d, exercises: ex };
  });
  const addSet = (i) => setDraft((d) => {
    const ex = [...d.exercises];
    const e = { ...ex[i] };
    const last = e.sets[e.sets.length - 1] || { reps: 8, weight: 0 };
    e.sets = [...e.sets, { reps: last.reps, weight: last.weight }];
    ex[i] = e;
    return { ...d, exercises: ex };
  });
  const rmSet = (i, j) => setDraft((d) => {
    const ex = [...d.exercises];
    ex[i] = { ...ex[i], sets: ex[i].sets.filter((_, k) => k !== j) };
    return { ...d, exercises: ex };
  });
  const rmExercise = (i) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, k) => k !== i) }));
  const addExercise = (n) =>
    setDraft((d) => (d.exercises.some((e) => e.name === n) ? d : { ...d, exercises: [...d.exercises, draftExercise(n, workouts)] }));

  /* пустые поля и подходы отбрасываем, иначе в статистику попадут нули */
  const save = () => {
    const exercises = draft.exercises
      .map((e) => ({
        ...e,
        sets: e.sets
          .filter((s) => s.reps !== "" && s.reps != null && (e.bodyweight || (s.weight !== "" && s.weight != null)))
          .map((s) => ({ reps: +s.reps, weight: setWeight(e, s) })),
      }))
      .filter((e) => e.sets.length);
    onSave({ ...draft, exercises });
  };

  const inp = { background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` };
  const total = workoutTonnage({
    exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps && (e.bodyweight || s.weight)) })),
  }, bodyAt?.(draft.date));

  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>
        {isNew ? "Записать тренировку" : "Правка тренировки"}
      </div>
      <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
        {draft.dayLabel} · сейчас {total.toLocaleString("ru-RU")} кг
      </div>

      <div className="flex gap-2 mb-3">
        <label className="flex-1 min-w-0">
          <span className="f-body text-2xs block mb-1" style={{ color: C.dim }}>Дата тренировки</span>
          <input type="date" value={draft.date} max={today()} onChange={(e) => setField("date", e.target.value)}
            className="f-num w-full rounded-lg px-3 py-2 text-sm" style={inp} />
        </label>
        <label className="w-24 shrink-0">
          <span className="f-body text-2xs block mb-1" style={{ color: C.dim }}>Минут</span>
          <input type="number" inputMode="numeric" value={draft.durationMin ?? ""} onChange={(e) => setField("durationMin", e.target.value === "" ? null : +e.target.value)}
            placeholder="—" className="f-num w-full rounded-lg px-2 py-2 text-sm text-center" style={inp} />
        </label>
      </div>

      <div className="space-y-2.5">
        {draft.exercises.map((ex, i) => (
          <div key={i} className="rounded-xl p-3" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="f-body text-sm min-w-0" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}</div>
              <button onClick={() => rmExercise(i)} aria-label={`Убрать «${ex.name}» из записи`} className="shrink-0 flex items-center justify-center"><Trash2 size={16} color={C.dim} /></button>
            </div>
            <div className="space-y-1.5">
              {ex.sets.map((s, j) => (
                <div key={j} className="flex items-center gap-2">
                  <span className="f-num text-xs w-3" style={{ color: C.dim }}>{j + 1}</span>
                  <input type="number" inputMode="numeric" value={s.reps ?? ""} onChange={(e) => updSet(i, j, "reps", e.target.value)} placeholder="повт" aria-label={`${ex.name}, подход ${j + 1}: повторения`} className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={inp} />
                  <span className="f-body text-xs" aria-hidden="true" style={{ color: C.dim }}>{ex.bodyweight ? "+" : "×"}</span>
                  <input type="number" inputMode="decimal" value={s.weight ?? ""} onChange={(e) => updSet(i, j, "weight", e.target.value)}
                    placeholder={ex.bodyweight ? "+кг" : "кг"}
                    aria-label={`${ex.name}, подход ${j + 1}: ${ex.bodyweight ? "утяжеление в килограммах" : "вес в килограммах"}`}
                    className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={inp} />
                  <button onClick={() => rmSet(i, j)} aria-label={`Удалить подход ${j + 1}`} className="shrink-0 rounded-lg flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                    <X size={14} color={C.dim} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addSet(i)} className="f-body mt-2 text-xs" style={{ color: C.mossText }}>+ подход</button>
          </div>
        ))}
        {!draft.exercises.length && (
          <div className="f-body text-sm text-center py-6" style={{ color: C.redText }}>
            Не осталось ни одного упражнения — сохранение удалит запись.
          </div>
        )}
      </div>

      <button onClick={() => setAdding(true)} className="f-body w-full mt-2.5 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
        style={{ background: C.surfaceHi, color: C.mossText, border: `1px solid ${C.line}` }}>
        <Plus size={16} /> Добавить упражнение
      </button>

      <textarea value={draft.note || ""} onChange={(e) => setField("note", e.target.value)} rows={2} placeholder="Заметка…" aria-label="Заметка к тренировке"
        className="f-body w-full mt-3 rounded-xl px-3 py-2.5 text-sm resize-none" style={inp} />

      <button onClick={save} disabled={!draft.exercises.length}
        className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2"
        style={{ background: draft.exercises.length ? C.red : C.surfaceHi, color: draft.exercises.length ? C.chalk : C.dim }}>
        <Check size={18} /> {isNew ? "Записать в журнал" : "Сохранить изменения"}
      </button>
      <button onClick={onClose} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>

      {adding && (
        <ExercisePicker
          title="Добавить упражнение"
          conditions={conditions}
          has={(n) => draft.exercises.some((e) => e.name === n)}
          onPick={addExercise}
          onClose={() => setAdding(false)}
        />
      )}
    </Sheet>
  );
}

function WorkoutCard({ w, isPR, onDelete, onEdit, bodyAt }) {
  const [open, setOpen] = useState(false);
  /* Вес тела на дату тренировки: без него подтягивания не попадают в тоннаж. */
  const body = bodyAt?.(w.date) || 0;
  const t = workoutTonnage(w, body);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="f-display text-sm font-semibold truncate" style={{ color: C.chalk }}>{w.dayLabel}</div>
            <div className="f-body text-xs mt-0.5" style={{ color: C.dim }}>{fmtDate(w.date)}{w.durationMin ? ` · ${w.durationMin} мин` : ""}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="f-num text-sm font-semibold" style={{ color: C.chalk }}>{t.toLocaleString("ru-RU")} кг</div>
              {isPR && <div className="f-body text-2xs flex items-center gap-0.5 justify-end" style={{ color: C.mustard }}><Flame size={10} /> PR</div>}
            </div>
            {open ? <ChevronUp size={16} color={C.dim} /> : <ChevronDown size={16} color={C.dim} />}
          </div>
        </div>
        <div className="flex w-full h-2 rounded-full overflow-hidden mt-2.5" style={{ background: C.line }}>
          {w.exercises.filter((e) => exTonnage(e, body) > 0).map((e, i) => <div key={i} style={{ width: `${(exTonnage(e, body) / (t || 1)) * 100}%`, background: plateColor(perRepKg(e, body)) }} />)}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3">
          {w.exercises.map((ex, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs f-body py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
              <span style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}</span>
              <span className="f-num text-right shrink-0" style={{ color: C.dim }}>
                {ex.sets.map((s) => (ex.bodyweight ? (+s.weight ? `${s.reps}+${s.weight}` : s.reps) : `${s.reps}×${s.weight}`)).join(" · ")}
                {/* Своим весом непонятно, откуда взялись килограммы в тоннаже —
                    подписываем, во что оценён один повтор. */}
                {ex.bodyweight && bwKg(ex.name, body) && (
                  <span className="f-body block text-2xs">
                    свой вес ~{bwKg(ex.name, body)} кг{addedKg(ex) ? ` + ${addedKg(ex)} кг` : ""}
                  </span>
                )}
              </span>
            </div>
          ))}
          {w.note && <div className="f-body text-xs pt-2" style={{ color: C.mustard }}>{w.note}</div>}
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => onEdit(w)} className="f-body flex-1 rounded-lg py-2 text-xs flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              <Pencil size={12} /> Изменить
            </button>
            <ConfirmButton onConfirm={() => onDelete(w.id)} question="Удалить тренировку?" className="f-body rounded-lg px-3 py-2 text-xs flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}>
              <Trash2 size={12} /> Удалить
            </ConfirmButton>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalTab({ workouts, onDelete, onExport, onUpdate, onAdd, days, conditions, bodyAt }) {
  const [editing, setEditing] = useState(null);
  /* запись задним числом: сначала выбираем день, потом заполняем ту же форму */
  const [pickDay, setPickDay] = useState(false);
  const [creating, setCreating] = useState(null);

  const startBackdated = (day) => {
    setPickDay(false);
    setCreating({
      id: uid(),
      date: daysAgo(1),
      dayId: day?.id ?? null,
      dayLabel: day?.name || "Своя тренировка",
      note: "",
      durationMin: null,
      exercises: (day?.exercises || []).map((n) => draftExercise(n, workouts)),
    });
  };

  /* Всё это считается по всей истории тренировок. Без запоминания пересчёт
     шёл при каждой отрисовке и задерживал открытие вкладки. */
  const { sorted, monthT, allT, prs, cells } = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
    const mk = today().slice(0, 7);
    const monthT = workouts.filter((w) => w.date.startsWith(mk)).reduce((s, w) => s + workoutTonnage(w, bodyAt?.(w.date)), 0);
    const allT = workouts.reduce((s, w) => s + workoutTonnage(w, bodyAt?.(w.date)), 0);

    const best = {};
    const prs = new Set();
    [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
      let hit = false;
      w.exercises.forEach((ex) => {
        const v = ex.bodyweight ? topReps(ex) : topWeight(ex);
        if (best[ex.name] !== undefined && v > best[ex.name]) hit = true;
        if (best[ex.name] === undefined || v > best[ex.name]) best[ex.name] = v;
      });
      if (hit) prs.add(w.id);
    });

    /* календарь последних 5 недель */
    const dayset = new Set(workouts.map((w) => w.date));
    const cells = Array.from({ length: 35 }, (_, i) => {
      const key = daysAgo(34 - i);
      return { key, on: dayset.has(key) };
    });

    return { sorted, monthT, allT, prs, cells };
  }, [workouts]);

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex gap-2">
        <Chip label="тоннаж за месяц" value={monthT.toLocaleString("ru-RU")} sub="кг" />
        <Chip label="всего тренировок" value={workouts.length} sub={`${allT.toLocaleString("ru-RU")} кг`} />
      </div>
      {workouts.length > 0 && (
        <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
          <div className="f-body text-2xs uppercase tracking-wide mb-1.5" style={{ color: C.dim }}>последние 5 недель</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => <div key={c.key} className="aspect-square rounded-sm" style={{ background: c.on ? C.red : C.surfaceHi }} />)}
          </div>
        </div>
      )}
      <button onClick={() => setPickDay(true)} className="f-body w-full mt-2 rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
        <CalendarPlus size={16} /> Записать прошлую тренировку
      </button>
      <button onClick={onExport} className="f-body w-full mt-2 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
        <Share2 size={15} /> Выгрузить дневник текстом
      </button>
      <div className="mt-4 space-y-2.5">
        {!sorted.length && <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Пусто. Собери первую тренировку во вкладке «Сессия».</div>}
        {sorted.map((w) => <WorkoutCard key={w.id} w={w} isPR={prs.has(w.id)} onDelete={onDelete} onEdit={setEditing} bodyAt={bodyAt} />)}
      </div>

      {editing && (
        <EditWorkout
          workout={editing}
          workouts={workouts}
          conditions={conditions}
          bodyAt={bodyAt}
          onClose={() => setEditing(null)}
          onSave={(w) => { onUpdate(w); setEditing(null); }}
        />
      )}

      {pickDay && (
        <Sheet onClose={() => setPickDay(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Какой это был день?</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
            Упражнения подставятся из выбранного дня — останется вписать подходы и поправить дату.
          </div>
          <div className="space-y-1.5">
            {days.map((d) => (
              <button key={d.id} onClick={() => startBackdated(d)} className="f-body w-full text-left rounded-lg px-3 py-3 text-sm"
                style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
                {d.name}
                <span className="f-body text-2xs block" style={{ color: C.dim }}>{d.exercises.length} упражнений</span>
              </button>
            ))}
            <button onClick={() => startBackdated(null)} className="f-body w-full text-left rounded-lg px-3 py-3 text-sm"
              style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              Своя тренировка
              <span className="f-body text-2xs block" style={{ color: C.dim }}>начать с пустого списка</span>
            </button>
          </div>
          <button onClick={() => setPickDay(false)} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}

      {creating && (
        <EditWorkout
          workout={creating}
          workouts={workouts}
          conditions={conditions}
          bodyAt={bodyAt}
          isNew
          onClose={() => setCreating(null)}
          onSave={(w) => { onAdd(w); setCreating(null); }}
        />
      )}
    </div>
  );
}

/* ============ PROGRESS ============ */
const METRICS = [
  { id: "weight", label: "Рабочий вес", unit: "кг" },
  { id: "e1rm", label: "Расч. 1ПМ", unit: "кг" },
  { id: "tonnage", label: "Тоннаж", unit: "кг" },
  { id: "reps", label: "Повторения", unit: "" },
];
const RANGES = [{ id: 30, label: "30 дн" }, { id: 90, label: "90 дн" }, { id: 9999, label: "всё" }];

function ProgressTab({ workouts, bodyAt }) {
  const [view, setView] = useState("exercise");
  const names = useMemo(() => { const s = new Set(); workouts.forEach((w) => w.exercises.forEach((e) => s.add(e.name))); return [...s].sort(); }, [workouts]);
  const [sel, setSel] = useState("");
  const [metric, setMetric] = useState("weight");
  const [range, setRange] = useState(90);
  useEffect(() => { if (!sel && names.length) setSel(names[0]); }, [names, sel]);

  const cutoff = useMemo(() => daysAgo(range), [range]);
  const series = useMemo(() => [...workouts].filter((w) => w.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => { const ex = w.exercises.find((e) => e.name === sel); return ex ? { date: fmtDate(w.date), weight: topWeight(ex), e1rm: est1RM(ex), tonnage: exTonnage(ex, bodyAt?.(w.date)) || null, reps: totalReps(ex) } : null; })
    .filter(Boolean), [workouts, sel, cutoff]);
  const totalSeries = useMemo(() => [...workouts].filter((w) => w.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ date: fmtDate(w.date), tonnage: workoutTonnage(w, bodyAt?.(w.date)) })), [workouts, cutoff, bodyAt]);

  const volume = useMemo(() => {
    const cur = daysAgo(7);
    const prev = daysAgo(14);
    const acc = {}; ALL_MUSCLES.forEach((m) => (acc[m] = { now: 0, before: 0 }));
    let push = 0, pull = 0;
    workouts.forEach((w) => {
      const b = w.date >= cur ? "now" : w.date >= prev ? "before" : null; if (!b) return;
      w.exercises.forEach((ex) => {
        const m = EXDB[ex.name]?.m; if (!m || !acc[m]) return;
        acc[m][b] += ex.sets.length;
        if (b === "now") { if (PUSH_M.has(m)) push += ex.sets.length; if (PULL_M.has(m)) pull += ex.sets.length; }
      });
    });
    return { rows: ALL_MUSCLES.map((m) => ({ m, ...acc[m] })).filter((r) => r.now || r.before), push, pull };
  }, [workouts]);

  const records = useMemo(() => {
    const map = {};
    [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
      w.exercises.forEach((ex) => {
        const v = ex.bodyweight ? topReps(ex) : topWeight(ex);
        const rm = est1RM(ex);
        const cur = map[ex.name];
        if (!cur || v > cur.v) map[ex.name] = { name: ex.name, v, date: w.date, bw: ex.bodyweight, rm, reps: topReps(ex) };
      });
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [workouts]);

  const m = METRICS.find((x) => x.id === metric);
  const valid = series.filter((r) => r[metric] != null);
  const first = valid[0], last = valid[valid.length - 1];
  const delta = first && last ? last[metric] - first[metric] : null;

  if (!workouts.length) return <div className="f-body text-sm text-center py-20 px-4" style={{ color: C.dim }}>Графики появятся после первой записанной тренировки.</div>;

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${C.line}` }}>
        {[["exercise", "Упражнение"], ["total", "Тоннаж"], ["volume", "Объём"], ["pr", "Рекорды"]].map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} className="f-body flex-1 text-xs py-2" style={{ background: view === id ? C.red : C.surface, color: view === id ? C.chalk : C.dim }}>{l}</button>
        ))}
      </div>
      {(view === "exercise" || view === "total") && (
        <div className="flex gap-1.5 mb-3">
          {RANGES.map((r) => <button key={r.id} onClick={() => setRange(r.id)} className="f-body rounded-full px-3 py-1 text-xs" style={{ background: range === r.id ? C.surfaceHi : "transparent", color: range === r.id ? C.chalk : C.dim, border: `1px solid ${C.line}` }}>{r.label}</button>)}
        </div>
      )}

      {view === "exercise" && (<>
        <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Упражнение для графика" className="f-body w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
          {METRICS.map((x) => <button key={x.id} onClick={() => setMetric(x.id)} className="f-body shrink-0 rounded-full px-3 py-1 text-xs" style={{ background: metric === x.id ? C.blue : C.surface, color: metric === x.id ? C.chalk : C.dim, border: `1px solid ${metric === x.id ? C.blue : C.line}` }}>{x.label}</button>)}
        </div>
        {valid.length ? (<>
          <div className="flex gap-2 mt-3">
            <Chip label={m.label} value={`${last[metric]}${m.unit ? " " + m.unit : ""}`} sub={delta ? `${delta > 0 ? "+" : ""}${r1(delta)} за период` : undefined} />
            <Chip label="сессий" value={valid.length} />
          </div>
          <ChartFrame>
            <LineByDate data={series} dataKey={metric} name={m.label} />
          </ChartFrame>
        </>) : <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Нет данных за период.</div>}
      </>)}

      {view === "total" && (
        <ChartFrame>
          <BarByDate data={totalSeries} dataKey="tonnage" name="тоннаж, кг" />
        </ChartFrame>
      )}

      {view === "volume" && (<div>
        <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Рабочих подходов за 7 дней. Ориентир для роста — 10–20 на мышцу.</div>
        {(volume.push > 0 || volume.pull > 0) && (
          <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
            <div className="flex justify-between f-body text-xs mb-1.5">
              <span style={{ color: C.chalk }}>Жимы / тяги</span>
              <span className="f-num" style={{ color: volume.pull >= volume.push ? C.moss : C.mustard }}>{volume.push} / {volume.pull}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
              <div style={{ width: `${(volume.push / (volume.push + volume.pull)) * 100}%`, background: C.red }} />
              <div style={{ width: `${(volume.pull / (volume.push + volume.pull)) * 100}%`, background: C.blue }} />
            </div>
            <div className="f-body text-2xs mt-1.5" style={{ color: C.dim }}>{volume.pull >= volume.push ? "Тяг не меньше жимов — так плечевой сустав держится ровно." : "Жимов больше, чем тяг. Перекос в жимы стягивает плечи вперёд; тяг стоит делать не меньше."}</div>
          </div>
        )}
        {!volume.rows.length && <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Нет тренировок за последние 2 недели.</div>}
        <div className="space-y-2.5">
          {volume.rows.map((r) => (
            <div key={r.m}>
              <div className="flex justify-between f-body text-xs mb-1">
                <span style={{ color: C.chalk }}>{r.m}</span>
                <span className="f-num" style={{ color: r.now >= 10 && r.now <= 20 ? C.moss : C.dim }}>{r.now}{r.before ? ` (было ${r.before})` : ""}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (r.now / 22) * 100)}%`, background: r.now >= 10 && r.now <= 20 ? C.moss : r.now > 20 ? C.red : C.mustard }} />
              </div>
            </div>
          ))}
        </div>
      </div>)}

      {view === "pr" && (
        <div className="space-y-1.5">
          {!records.length && <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Рекордов пока нет.</div>}
          {records.map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="min-w-0">
                <div className="f-body text-xs truncate" style={{ color: C.chalk }}>{r.name}</div>
                <div className="f-body text-2xs" style={{ color: C.dim }}>{fmtDate(r.date)}{EXDB[r.name] ? ` · ${EXDB[r.name].m}` : ""}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="f-num text-sm font-semibold" style={{ color: C.mustard }}>{r.bw ? `${r.v} повт` : `${r.v} кг`}</div>
                {!r.bw && r.rm && <div className="f-num text-2xs" style={{ color: C.dim }}>1ПМ ~{r.rm}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ BODY ============ */
const MEASURES = [
  { k: "weight", l: "Вес", u: "кг", req: true },
  { k: "waist", l: "Талия", u: "см", hint: "на уровне пупка" },
  { k: "neck", l: "Шея", u: "см", hint: "под кадыком" },
  { k: "hips", l: "Бёдра", u: "см", hint: "по самой широкой точке" },
  { k: "chest", l: "Грудь", u: "см" },
  { k: "arm", l: "Бицепс", u: "см", hint: "в напряжении" },
  { k: "thigh", l: "Бедро", u: "см" },
  { k: "calf", l: "Икра", u: "см" },
];
const PCT = [[100, 1], [95, 2], [92, 3], [90, 4], [87, 5], [85, 6], [83, 7], [80, 8], [77, 9], [75, 10], [70, 12], [65, 15]];

/** Откуда взялась длительность тренировки в расчёте расхода. */
const DUR_SOURCE = {
  timer: "по таймеру тренировки",
  estimate: "оценка по подходам и отдыху — таймер не записал",
  fixed: "записанное время меньше времени под нагрузкой — считаем по подходам",
};

/** Выбор своих травм и состояний. Отсюда берутся предупреждения по всему приложению. */
function ConditionsCard({ profile, setProfile }) {
  const [open, setOpen] = useState(false);
  const picked = profile.conditions || [];
  const toggle = (id) =>
    setProfile({ ...profile, conditions: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });

  return (
    <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${picked.length ? C.mustard : C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2">
        <div className="min-w-0 text-left">
          <div className="f-display text-sm font-semibold flex items-center gap-1.5" style={{ color: C.chalk }}>
            <ShieldAlert size={14} color={picked.length ? C.mustard : C.dim} /> Травмы и ограничения
          </div>
          <div className="f-body text-xs truncate" style={{ color: C.dim }}>
            {picked.length ? picked.map((id) => CONDITION_BY_ID[id]?.name).filter(Boolean).join(", ") : "не выбрано — предупреждений не будет"}
          </div>
        </div>
        {open ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
      </button>

      {open && (
        <div className="mt-3">
          <div className="f-body text-xs mb-2.5" style={{ color: C.dim }}>
            Отметь свои проблемные места. В базе упражнений появятся предупреждения и подсказки, чем заменить.
          </div>
          <div className="space-y-1.5">
            {CONDITIONS.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggle(c.id)} className="w-full flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left"
                  style={{ background: C.surfaceHi, border: `1px solid ${on ? C.mustard : C.line}` }}>
                  <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
                    style={{ background: on ? C.mustard : "transparent", border: `1px solid ${on ? C.mustard : C.line}` }}>
                    {on && <Check size={13} color={C.bg} />}
                  </span>
                  <span className="min-w-0">
                    <span className="f-body text-sm block" style={{ color: on ? C.chalk : C.dim }}>{c.name}</span>
                    <span className="f-body text-2xs block" style={{ color: C.dim }}>{c.hint}</span>
                    {on && (
                      <>
                        <span className="f-body text-xs block mt-1.5 leading-relaxed" style={{ color: C.chalk }}>{c.guide}</span>
                        <span className="f-body text-xs block mt-2 leading-relaxed" style={{ color: C.redText }}>
                          Не в зал, а к врачу: {c.stop}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="f-body text-2xs mt-3 leading-relaxed" style={{ color: C.dim }}>
            Это не медицинские предписания, а ориентиры по механике движений. Приложение не знает твоего диагноза:
            «не рекомендуется» значит «у движения известны проблемы при таком состоянии», а не запрет. При настоящей
            травме порядок обратный — сначала врач, потом приложение.
          </div>
        </div>
      )}
    </div>
  );
}

function BodyTab({ metrics, profile, setProfile, onAdd, onDelete, workouts, restOverrides }) {
  const [form, setForm] = useState({ date: today() });
  const [showForm, setShowForm] = useState(false);
  const [chartKey, setChartKey] = useState("weight");
  const [showHistory, setShowHistory] = useState(false);
  const [w1, setW1] = useState(""); const [r1v, setR1v] = useState("");
  const [energyId, setEnergyId] = useState(null);

  const sorted = useMemo(() => [...metrics].sort((a, b) => a.date.localeCompare(b.date)), [metrics]);
  const latest = sorted[sorted.length - 1];
  const firstEntry = sorted[0];
  const bf = bodyFatNavy(latest, profile);
  const bodyW = +latest?.weight || 0;
  const bmi = bmiOf(bodyW, +profile.height);
  const lbm = lbmOf(bodyW, bf);
  const ffmi = ffmiOf(lbm, +profile.height);
  const whtr = latest?.waist && profile.height ? Math.round((+latest.waist / +profile.height) * 100) / 100 : null;

  const chartData = sorted.filter((m) => m[chartKey] != null && m[chartKey] !== "").map((m) => ({ date: fmtDate(m.date), v: +m[chartKey] }));
  const availableKeys = MEASURES.filter((mm) => sorted.some((s) => s[mm.k] != null && s[mm.k] !== ""));
  const diff = (k) => { if (!latest || !firstEntry || latest === firstEntry) return null; const a = +latest[k], b = +firstEntry[k]; return a && b ? r1(a - b) : null; };

  const oneRM = useMemo(() => {
    const W = +w1, R = +r1v;
    if (!W || !R || R > 15) return null;
    return { epley: r1(epley(W, R)), brzycki: r1(brzycki(W, R)), avg: r1((epley(W, R) + brzycki(W, R)) / 2) };
  }, [w1, r1v]);

  const tier = lbm ? 3 : bodyW && profile.height && profile.age ? 2 : bodyW ? 1 : 0;
  const bmr = useMemo(() => {
    if (lbm) return Math.round(370 + 21.6 * lbm);
    if (bodyW && profile.height && profile.age) {
      const base = 10 * bodyW + 6.25 * +profile.height - 5 * +profile.age;
      return Math.round(profile.sex === "f" ? base - 161 : base + 5);
    }
    return null;
  }, [lbm, bodyW, profile]);
  const tdee = bmr ? Math.round(bmr * +profile.activity) : null;

  /* Расход считается по конкретной записи из журнала. По умолчанию —
     последняя: чаще всего спрашивают именно про неё. */
  const recent = useMemo(() => [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [workouts]);
  const picked = recent.find((w) => w.id === energyId) || recent[0] || null;
  const energy = useMemo(
    () => workoutEnergy(picked, { metrics, bmr, restOverrides }),
    [picked, metrics, bmr, restOverrides],
  );
  const met = energy ? energy.level.met.toFixed(1).replace(".", ",") : "";
  const tierInfo = [
    { l: "Нет данных", d: "Добавь замер веса." },
    { l: "Базовый (±30%)", d: "Только вес тела. Добавь рост и возраст." },
    { l: "Средний (±25%)", d: "Миффлин-Сан Жеор. Добавь талию и шею — перейдёт на формулу по сухой массе." },
    { l: "Точный (±20%)", d: "Кетч-Макардл по сухой массе — надёжнее всего без лаборатории." },
  ][tier];

  const submit = () => {
    if (!form.weight) return;
    const e = { id: uid(), date: form.date || today() };
    MEASURES.forEach((mm) => { if (form[mm.k] !== undefined && form[mm.k] !== "") e[mm.k] = +form[mm.k]; });
    onAdd(e); setForm({ date: today() }); setShowForm(false);
  };
  const inp = { background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` };

  return (
    <div className="px-4 pt-4 pb-8 space-y-5">
      <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
        <div className="f-display text-sm font-semibold mb-2" style={{ color: C.chalk }}>Профиль</div>
        <div className="flex gap-2">
          <input type="number" placeholder="рост, см" aria-label="Рост в сантиметрах" value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })} className="f-num flex-1 rounded-lg px-2.5 py-2 text-sm min-w-0" style={inp} />
          <input type="number" placeholder="возраст" aria-label="Возраст, лет" value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })} className="f-num flex-1 rounded-lg px-2.5 py-2 text-sm min-w-0" style={inp} />
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.line}` }}>
            {[["m", "М"], ["f", "Ж"]].map(([v, l]) => <button key={v} onClick={() => setProfile({ ...profile, sex: v })} className="f-body text-xs px-3" style={{ background: profile.sex === v ? C.red : C.surfaceHi, color: profile.sex === v ? C.chalk : C.dim }}>{l}</button>)}
          </div>
        </div>
        <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value })} aria-label="Повседневная активность" className="f-body w-full rounded-lg px-3 py-2 text-sm mt-2" style={inp}>
          <option value="1.2">Сидячий образ жизни</option>
          <option value="1.375">Лёгкая активность (1–3 трен/нед)</option>
          <option value="1.55">Средняя (3–5 трен/нед)</option>
          <option value="1.725">Высокая (6–7 трен/нед)</option>
        </select>
      </div>

      <ConditionsCard profile={profile} setProfile={setProfile} />

      {latest ? (
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="f-display text-sm font-semibold" style={{ color: C.chalk }}>Текущее состояние</span>
            <span className="f-body text-xs" style={{ color: C.dim }}>замер {fmtDate(latest.date)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Chip label="вес" value={`${latest.weight} кг`} sub={diff("weight") != null ? `${diff("weight") > 0 ? "+" : ""}${diff("weight")} с начала` : undefined} />
            <Chip label="% жира (Navy)" value={bf != null ? `${bf}%` : "—"} sub={bf == null ? "нужны талия и шея" : "оценка по обхватам"} accent={bf != null ? C.mustard : C.dim} />
            <Chip label="сухая масса" value={lbm != null ? `${lbm} кг` : "—"} sub={lbm != null ? "мышцы, кости, вода" : "нужен % жира"} accent={lbm != null ? C.moss : C.dim} />
            <Chip label="ИМТ" value={bmi ?? "—"} sub={bmi ? "не учитывает мышцы" : "нужен рост"} />
            <Chip label="FFMI" value={ffmi ?? "—"} sub={ffmi ? (ffmi < 20 ? "средний" : ffmi < 22 ? "хорошо развит" : "высокий") : "нужен % жира"} accent={ffmi ? C.blue : C.dim} />
            <Chip label="талия / рост" value={whtr ?? "—"} sub={whtr ? (whtr < 0.5 ? "здоровый диапазон" : "выше 0.5 — риск") : "нужна талия"} accent={whtr ? (whtr < 0.5 ? C.moss : C.mustard) : C.dim} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-6 text-center" style={{ background: C.surface, border: `1px dashed ${C.line}` }}>
          <div className="f-body text-sm mb-1" style={{ color: C.chalk }}>Замеров пока нет</div>
          <div className="f-body text-xs" style={{ color: C.dim }}>Обязателен только вес. Талия и шея добавят процент жира и сухую массу.</div>
        </div>
      )}

      {availableKeys.length > 0 && (
        <div>
          <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
            {availableKeys.map((mm) => <button key={mm.k} onClick={() => setChartKey(mm.k)} className="f-body shrink-0 rounded-full px-3 py-1 text-xs" style={{ background: chartKey === mm.k ? C.blue : C.surface, color: chartKey === mm.k ? C.chalk : C.dim, border: `1px solid ${chartKey === mm.k ? C.blue : C.line}` }}>{mm.l}</button>)}
          </div>
          {chartData.length > 1 ? (
            <ChartFrame height={160}>
              <LineByDate data={chartData} dataKey="v" name={MEASURES.find((x) => x.k === chartKey)?.l}
                color={C.mustard} height={160} domain={["dataMin - 2", "dataMax + 2"]} />
            </ChartFrame>
          ) : <div className="f-body text-xs text-center py-6" style={{ color: C.dim }}>Нужно минимум два замера для графика.</div>}
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="f-display w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Plus size={17} /> Новый замер</button>

      {sorted.length > 0 && (
        <div>
          <button onClick={() => setShowHistory(!showHistory)} className="f-body w-full flex items-center justify-between py-2 text-xs" style={{ color: C.dim }}>
            <span>История замеров ({sorted.length})</span>{showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showHistory && [...sorted].reverse().map((m) => (
            <div key={m.id} className="rounded-lg px-3 py-2 mb-1.5 flex items-start justify-between gap-2" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="min-w-0">
                <div className="f-num text-xs" style={{ color: C.chalk }}>{fmtDate(m.date)}</div>
                <div className="f-num text-2xs" style={{ color: C.dim }}>{MEASURES.filter((x) => m[x.k] != null).map((x) => `${x.l} ${m[x.k]}`).join(" · ")}</div>
              </div>
              <button onClick={() => onDelete(m.id)} className="shrink-0"><Trash2 size={13} color={C.dim} /></button>
            </div>
          ))}
        </div>
      )}

      {/* 1ПМ */}
      <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
        <div className="f-display text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: C.chalk }}><Calculator size={15} /> Одноповторный максимум</div>
        <div className="flex gap-2">
          <input type="number" inputMode="decimal" placeholder="вес, кг" aria-label="Вес в килограммах" value={w1} onChange={(e) => setW1(e.target.value)} className="f-num flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={inp} />
          <input type="number" inputMode="numeric" placeholder="повт" aria-label="Число повторений" value={r1v} onChange={(e) => setR1v(e.target.value)} className="f-num flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={inp} />
        </div>
        {oneRM && (<>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="f-num text-2xl font-bold" style={{ color: C.redText }}>{oneRM.avg}</span>
            <span className="f-body text-xs" style={{ color: C.dim }}>кг · Эпли {oneRM.epley} / Бжицки {oneRM.brzycki}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {PCT.map(([p, reps]) => (
              <div key={p} className="rounded-lg py-1.5 text-center" style={{ background: C.surfaceHi }}>
                <div className="f-num text-xs font-semibold" style={{ color: C.chalk }}>{Math.round(oneRM.avg * p / 100 * 2) / 2}</div>
                <div className="f-body text-2xs" style={{ color: C.dim }}>{reps} повт</div>
              </div>
            ))}
          </div>
        </>)}
        <div className="f-body text-xs mt-2" style={{ color: C.dim }}>Формулы точны до ~10 повторений. Это оценка, а не повод идти проверять на практике — тем более если на вкладке отмечены ограничения.</div>
      </div>

      {/* энергия */}
      <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
        <div className="f-display text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: C.chalk }}><Activity size={15} /> Энергия и калории</div>
        <div className="rounded-lg px-2.5 py-2 mb-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${tier === 3 ? C.moss : tier === 2 ? C.mustard : C.red}` }}>
          <div className="f-body text-xs font-medium" style={{ color: tier === 3 ? C.moss : tier === 2 ? C.mustard : C.red }}>Точность: {tierInfo.l}</div>
          <div className="f-body text-xs" style={{ color: C.dim }}>{tierInfo.d}</div>
        </div>
        {tdee ? (
          <div className="flex gap-2"><Chip label="базовый обмен" value={bmr} sub="ккал/сут" /><Chip label="поддержание" value={tdee} sub="ккал/сут" /></div>
        ) : <div className="f-body text-xs" style={{ color: C.dim }}>Заполни профиль и добавь замер веса.</div>}
        <div className="f-body text-xs uppercase tracking-wide mt-4 mb-2" style={{ color: C.dim }}>Расход за тренировку</div>
        {!recent.length ? (
          <div className="f-body text-xs" style={{ color: C.dim }}>Пока нечего считать: расход берётся из записи в журнале.</div>
        ) : (<>
          <select value={picked?.id || ""} onChange={(e) => setEnergyId(e.target.value)} aria-label="Тренировка для расчёта расхода"
            className="f-body w-full rounded-lg px-3 py-2.5 text-sm" style={inp}>
            {recent.map((w) => (
              <option key={w.id} value={w.id}>{fmtDate(w.date)} · {w.dayLabel}</option>
            ))}
          </select>

          {!energy ? (
            <div className="f-body text-xs mt-2" style={{ color: C.dim }}>Нужен хотя бы один замер веса — без веса тела расход не посчитать.</div>
          ) : (<>
            <div className="flex gap-2 mt-3">
              <Chip label="всего сожжено" value={`~${energy.gross}`} sub="ккал" accent={C.mustard} />
              {energy.rest > 0 && <Chip label="сверх покоя" value={`~${energy.net}`} sub="ккал" accent={C.moss} />}
            </div>

            {/* Откуда взялись эти числа. Без этого цифра выглядит взятой
                с потолка, а она собрана из того, что записано в журнале. */}
            <div className="mt-3">
              <div className="f-body text-xs uppercase tracking-wide mb-1" style={{ color: C.dim }}>Как посчитано</div>
              <CalcLine k="Длительность" v={`${energy.minutes} мин`} hint={DUR_SOURCE[energy.source]} />
              <CalcLine k="Под нагрузкой" v={`${energy.workMin} мин`}
                hint={`${Math.round(energy.density * 100)}% времени — ${energy.level.label}, ${met} МЕТ`} />
              <CalcLine k="Вес тела" v={`${energy.bodyKg} кг`} hint={`замер ${fmtDate(energy.weightDate)}`} />
              <CalcLine k="Всего" v={`${energy.gross} ккал`}
                hint={`${met} × 3,5 × ${energy.bodyKg} ÷ 200 × ${energy.minutes}`} />
              {energy.rest > 0 && (
                <CalcLine k="Минус покой" v={`−${energy.rest} ккал`} hint="столько сгорело бы просто лёжа за это же время" />
              )}
            </div>

            <div className="f-body text-xs mt-3" style={{ color: C.dim }}>
              МЕТ — во сколько раз движение затратнее лежания; плотность берётся
              из самой записи, поэтому час с долгими паузами и час без передышки
              считаются по-разному. «Сверх покоя» — честная прибавка к суточному
              расходу: обмен веществ идёт и без тренировки, и дважды его считать
              нельзя. Разброс между людьми одного веса доходит до трети,
              так что главный ориентир на дефиците — динамика веса и талии.
            </div>
          </>)}
        </>)}
      </div>

      {showForm && (
        <Sheet onClose={() => setShowForm(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Новый замер</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Обязателен только вес. Чем больше заполнишь — тем точнее расчёты.</div>
          <input type="date" value={form.date || today()} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Дата замера" className="f-num w-full rounded-lg px-3 py-2 text-sm mb-3" style={inp} />
          <div className="space-y-2">
            {MEASURES.map((mm) => (
              <div key={mm.k} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="f-body text-sm" style={{ color: mm.req ? C.chalk : C.dim }}>{mm.l}{mm.req && <span style={{ color: C.redText }}> *</span>}</div>
                  {mm.hint && <div className="f-body text-2xs" style={{ color: C.dim }}>{mm.hint}</div>}
                </div>
                <input type="number" inputMode="decimal" placeholder={mm.u} aria-label={`${mm.l}, ${mm.u}`} value={form[mm.k] ?? ""} onChange={(e) => setForm({ ...form, [mm.k]: e.target.value })} className="f-num w-24 rounded-lg px-2 py-2 text-sm text-center shrink-0" style={inp} />
              </div>
            ))}
          </div>
          <button onClick={submit} disabled={!form.weight} className="f-display w-full mt-4 rounded-xl py-3 text-sm font-semibold" style={{ background: form.weight ? C.red : C.surfaceHi, color: form.weight ? C.chalk : C.dim }}>Сохранить замер</button>
          <button onClick={() => setShowForm(false)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}
    </div>
  );
}

/* ============ APP ============ */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("session");
  /* Подсветка вкладки рисуется по tab и отвечает на нажатие мгновенно,
     а тяжёлое содержимое — по отложенному значению. Без этого и то и другое
     попадало в один коммит: на 0.1–0.2 с экран замирал со старой вкладкой,
     и это читалось как «мелькнула предыдущая». */
  const shownTab = useDeferredValue(tab);
  /* Прокрутка одна на все вкладки: без сброса переход в «Базу» из середины
     длинного журнала открывался с середины базы. Каждый раздел начинается
     сверху — так же, как если бы его открыли впервые. */
  const scroller = useRef(null);
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [shownTab]);
  const [baseView, setBaseView] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [days, setDaysState] = useState([]);
  const [session, setSessionState] = useState(null);
  const [profile, setProfileState] = useState({ height: "", age: "", sex: "m", activity: "1.55", conditions: [] });
  const [showSettings, setShowSettings] = useState(false);
  const [exportText, setExportText] = useState(null);
  const [importText, setImportText] = useState(null);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState(null);
  const [toast, setToast] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);
  const [accepted, setAccepted] = useState(null); // null — ещё не прочитали из хранилища
  const [setupSeen, setSetupSeen] = useState(true); // до чтения из хранилища не мигаем экраном
  const [showTerms, setShowTerms] = useState(false);
  const [updating, setUpdating] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    (async () => {
      setWorkouts((await loadKey("workouts")) || []);
      setMetrics((await loadKey("metrics")) || []);
      const d = await loadKey("days");
      if (d && d.length) setDaysState(d); else { setDaysState(DEFAULT_DAYS); saveKey("days", DEFAULT_DAYS); }
      setSessionState(await loadKey("session"));
      const p = await loadKey("profile"); if (p) setProfileState(p);
      setAccepted(!!(await loadKey("accepted")));
      setSetupSeen(!!(await loadKey("setup")));
      setLoading(false);
      /* просим браузер закрепить хранилище, чтобы он не вычистил дневник при нехватке места */
      const persisted = await requestPersistence();
      setStorageInfo({ persisted, ...((await storageEstimate()) || {}) });
    })();
  }, []);

  /* короткое сообщение внизу экрана вместо блокирующего alert */
  const say = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  }, []);

  const setDays = useCallback((d) => { setDaysState(d); saveKey("days", d); }, []);
  const setSession = useCallback((v) => setSessionState((prev) => { const next = typeof v === "function" ? v(prev) : v; saveKey("session", next); return next; }), []);
  /* принимает и объект, и функцию — как обычный сеттер состояния */
  const setProfile = useCallback((v) => setProfileState((prev) => {
    const next = typeof v === "function" ? v(prev) : v;
    saveKey("profile", next);
    return next;
  }), []);
  const finishSession = useCallback((w) => { setWorkouts((prev) => { const next = [w, ...prev]; saveKey("workouts", next); return next; }); setSession(null); setTab("journal"); }, [setSession]);
  const deleteWorkout = useCallback((id) => setWorkouts((prev) => { const next = prev.filter((w) => w.id !== id); saveKey("workouts", next); return next; }), []);
  /* правка записи: пустая тренировка после удаления всех упражнений исчезает из журнала */
  /* запись задним числом: тренировка приходит уже готовой, без живой сессии */
  const addWorkout = useCallback((w) => setWorkouts((prev) => {
    const next = [w, ...prev];
    saveKey("workouts", next);
    return next;
  }), []);
  const updateWorkout = useCallback((w) => setWorkouts((prev) => {
    const next = w.exercises.length ? prev.map((x) => (x.id === w.id ? w : x)) : prev.filter((x) => x.id !== w.id);
    saveKey("workouts", next);
    return next;
  }), []);
  const addMetric = useCallback((m) => setMetrics((prev) => { const next = [...prev, m]; saveKey("metrics", next); return next; }), []);
  const deleteMetric = useCallback((id) => setMetrics((prev) => { const next = prev.filter((m) => m.id !== id); saveKey("metrics", next); return next; }), []);

  /* Вес тела на любую дату. Нужен и тоннажу (подтягивания), и расходу
     калорий. Берётся ближайший замер, а не последний: тренировка трёхмесячной
     давности не должна считаться по сегодняшнему весу. */
  const bodyAt = useCallback((date) => weightNear(metrics, date)?.kg || 0, [metrics]);

  const buildExport = () => {
    const lines = ["# Тренировочный дневник — выгрузка", ""];
    if (profile.height) lines.push(`Профиль: рост ${profile.height} см, возраст ${profile.age || "—"}`, "");
    if (metrics.length) {
      lines.push("## Замеры тела");
      [...metrics].sort((a, b) => a.date.localeCompare(b.date)).forEach((m) => {
        const parts = MEASURES.filter((x) => m[x.k] != null).map((x) => `${x.l} ${m[x.k]}`);
        const f = bodyFatNavy(m, profile);
        lines.push(`${m.date}: ${parts.join(", ")}${f != null ? ` (жир ~${f}%)` : ""}`);
      });
      lines.push("");
    }
    lines.push("## Тренировки");
    [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
      lines.push("", `### ${w.date} — ${w.dayLabel} — тоннаж ${workoutTonnage(w, bodyAt(w.date))} кг${w.durationMin ? `, ${w.durationMin} мин` : ""}`);
      w.exercises.forEach((ex) => {
        const s = ex.sets.map((x) => (ex.bodyweight ? (+x.weight ? `${x.reps}+${x.weight}кг` : `${x.reps}`) : `${x.reps}×${x.weight}`)).join(", ");
        const rm = est1RM(ex);
        const own = ex.bodyweight ? bwKg(ex.name, bodyAt(w.date)) : null;
        lines.push(`- ${ex.name}${ex.uni ? " [каждой стороной]" : ""}: ${s}${own ? ` [свой вес ~${own} кг]` : ""}${rm ? ` (расч.1ПМ ${rm})` : ""}`);
      });
      if (w.note) lines.push(`- заметка: ${w.note}`);
    });
    setExportText(lines.join("\n")); setCopied(false);
  };

  /** Состояния здоровья — из них берутся предупреждения по всему приложению. */
  const conditions = useMemo(() => profile.conditions || [], [profile.conditions]);

  /* размер текста и величина кнопок из профиля */
  useAppearance(profile);

  /* тренировка кончилась — отпускаем медиасессию, она держала звук наготове */
  useEffect(() => { if (!session) releaseAudio(); }, [session]);

  /** Правки времени отдыха, сделанные прямо на тренировке */
  const restOverrides = useMemo(() => profile.restOverrides || {}, [profile.restOverrides]);
  const setRestOverride = useCallback((name, sec) => {
    setProfile((p) => ({ ...p, restOverrides: { ...(p.restOverrides || {}), [name]: sec } }));
  }, [setProfile]);
  const muted = !!profile.muted;

  const backupJSON = () => JSON.stringify({ v: 1, workouts, metrics, days, profile }, null, 0);

  const doImport = (txt) => {
    let o;
    try {
      o = JSON.parse(txt);
    } catch {
      setImportError("Это не похоже на резервную копию. Нужен файл целиком или весь скопированный текст.");
      return;
    }
    if (!o || typeof o !== "object" || !(o.workouts || o.metrics || o.days || o.profile)) {
      setImportError("Файл прочитался, но записей дневника в нём нет.");
      return;
    }
    if (o.workouts) { setWorkouts(o.workouts); saveKey("workouts", o.workouts); }
    if (o.metrics) { setMetrics(o.metrics); saveKey("metrics", o.metrics); }
    if (o.days) { setDaysState(o.days); saveKey("days", o.days); }
    if (o.profile) { setProfileState(o.profile); saveKey("profile", o.profile); }
    setImportError(null); setImportText(null); setShowSettings(false);
    say(`Восстановлено: тренировок ${o.workouts?.length || 0}, замеров ${o.metrics?.length || 0}`);
  };

  /* Сохранение копии файлом: на iPhone открывается системное «Поделиться» → «Сохранить в Файлы» */
  const saveBackupFile = async () => {
    const res = await shareOrDownload(backupName("json"), backupJSON());
    if (res === "downloaded") say("Файл сохранён в загрузки");
    else if (res === "copied") say("Файл не поддерживается — копия в буфере обмена");
    else if (res === "failed") { setShowSettings(false); setExportText(backupJSON()); say("Скопируй текст вручную"); }
  };

  /* Панель настроек рисуется поверх остальных листов, поэтому её нужно
     закрыть, иначе открытый из неё лист окажется под ней и не нажмётся. */
  const openImport = () => { setShowSettings(false); setImportError(null); setImportText(""); };

  const pickBackupFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      doImport(await readFileAsText(f));
    } catch {
      setImportError("Не получилось прочитать файл.");
    }
  };

  const wipe = async () => {
    for (const k of ["workouts", "metrics", "session"]) await deleteKey(k);
    setWorkouts([]); setMetrics([]); setSessionState(null); setShowSettings(false);
    say("Все записи удалены");
  };

  if (loading) return <div className="h-dvh w-full flex items-center justify-center" style={{ background: C.bg }}><Dumbbell className="animate-pulse" size={28} color={C.dim} /></div>;

  /* до принятия условий приложение не показывается */
  if (!accepted) return <DisclaimerGate onAccept={() => { setAccepted(true); saveKey("accepted", true); }} />;

  /* знакомство сразу после условий: без роста, веса и возраста половина
     расчётов показывает прочерки, а искать их во вкладке «Тело» никто
     не догадается. Спрашиваем один раз и разрешаем пропустить. */
  const finishSetup = (v) => {
    const p = { ...profile };
    if (v) {
      if (v.height) p.height = v.height;
      if (v.age) p.age = v.age;
      if (v.sex) p.sex = v.sex;
      setProfile(p);
      if (+v.weight > 0) addMetric({ id: uid(), date: today(), weight: v.weight });
    }
    setSetupSeen(true);
    saveKey("setup", true);
  };
  if (!setupSeen) return <SetupGate onDone={finishSetup} onSkip={() => finishSetup(null)} />;

  const tabs = [
    { id: "session", label: "Сессия", icon: Play },
    { id: "journal", label: "Журнал", icon: BookOpen },
    { id: "progress", label: "Графики", icon: TrendingUp },
    { id: "base", label: "База", icon: Library },
    { id: "body", label: "Тело", icon: Dumbbell },
  ];

  return (
    <div className="h-dvh w-full flex flex-col" style={{ background: C.bg }}>
      <div className="w-full max-w-xl mx-auto flex items-center justify-between px-4 pad-safe-top pb-1 shrink-0">
        <h1 className="f-display text-lg font-bold" style={{ color: C.chalk }}>Железный дневник</h1>
        <div className="flex items-center gap-3">
          {session && <button onClick={() => setTab("session")} className="f-body text-2xs rounded-full px-2 py-0.5" style={{ background: session.paused ? C.mustard : C.red, color: C.chalk }}>{session.paused ? "пауза" : "идёт тренировка"}</button>}
          <button onClick={() => setShowSettings(true)} aria-label="Настройки" className="flex items-center justify-center"><Settings size={20} color={C.dim} /></button>
        </div>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto w-full max-w-xl mx-auto" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${shownTab}`}>
        <div key={shownTab} className="tab-in">
        {shownTab === "session" && <SessionTab session={session} setSession={setSession} workouts={workouts} days={days} onFinish={finishSession} goToDays={() => { setBaseView("days"); setTab("base"); }} conditions={conditions} restOverrides={restOverrides} setRestOverride={setRestOverride} muted={muted} bodyAt={bodyAt} />}
        {shownTab === "journal" && <JournalTab workouts={workouts} onDelete={deleteWorkout} onExport={buildExport} onUpdate={updateWorkout} onAdd={addWorkout} days={days} conditions={conditions} bodyAt={bodyAt} />}
        {shownTab === "progress" && <ProgressTab workouts={workouts} bodyAt={bodyAt} />}
        {shownTab === "base" && <BaseTab days={days} setDays={setDays} initialView={baseView} conditions={conditions} />}
        {shownTab === "body" && <BodyTab metrics={metrics} profile={profile} setProfile={setProfile} onAdd={addMetric} onDelete={deleteMetric} workouts={workouts} restOverrides={restOverrides} />}
        </div>
      </div>

      <div className="shrink-0 pad-safe-bottom" style={{ background: C.surface, borderTop: `1px solid ${C.line}` }}>
        {/* Диктор должен объявлять это набором вкладок, а не пятью кнопками
            подряд, — иначе непонятно, что выбрано и сколько всего разделов. */}
        <div className="w-full max-w-xl mx-auto flex" role="tablist" aria-label="Разделы">
        {tabs.map((t) => {
          const Icon = t.icon; const a = tab === t.id;
          return (
            <button key={t.id} id={`tab-${t.id}`} role="tab" aria-selected={a} aria-controls="tabpanel"
              onClick={() => { setTab(t.id); if (t.id === "base") setBaseView(null); }} className="flex-1 flex flex-col items-center gap-0.5 py-2">
              <Icon size={17} color={a ? C.red : C.dim} />
              <span className="f-body text-2xs" style={{ color: a ? C.chalk : C.dim }}>{t.label}</span>
            </button>
          );
        })}
        </div>
      </div>

      {exportText !== null && (
        <Sheet onClose={() => setExportText(null)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Выгрузка дневника</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Весь дневник обычным текстом: тренировки, подходы, замеры. Годится, чтобы отправить тренеру или разобрать самому.</div>
          <textarea readOnly value={exportText} rows={10} aria-label="Дневник обычным текстом" onFocus={(e) => e.target.select()} className="f-num w-full rounded-lg p-2.5 text-2xs leading-snug" style={{ background: C.bg, color: C.chalk, border: `1px solid ${C.line}` }} />
          <button onClick={async () => { try { await navigator.clipboard.writeText(exportText); setCopied(true); } catch { setCopied(false); } }} className="f-body w-full mt-2 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: copied ? C.moss : C.red, color: C.chalk }}>
            {copied ? <><Check size={15} /> Скопировано</> : <><Copy size={15} /> Скопировать</>}
          </button>
          <button onClick={() => setExportText(null)} className="f-body w-full mt-1 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}

      {showTerms && (
        <Sheet onClose={() => setShowTerms(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>О приложении и ограничениях</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Версия: {buildLabel()}</div>
          <DisclaimerBody compact />
          <button
            onClick={async () => {
              setUpdating(true);
              const res = await checkForUpdate();
              setUpdating(false);
              if (res === "updated") say("Новая версия найдена — приложение перезапустится");
              else if (res === "current") say("У тебя уже последняя версия");
              else if (res === "offline") say("Нет сети — проверить не получится");
              else say("Обновление доступно только в установленном приложении");
            }}
            disabled={updating}
            className="f-body w-full mt-3 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
            style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            <RefreshCw size={15} className={updating ? "animate-spin" : ""} /> {updating ? "Проверяю…" : "Проверить обновление"}
          </button>
          <div className="f-body text-xs mt-2 leading-relaxed" style={{ color: C.dim }}>
            Приложение обновляется само, но новая версия включается при следующем запуске.
            На iPhone это значит закрыть его из переключателя задач, а не просто свернуть.
          </div>
          <button onClick={() => setShowTerms(false)} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}

      {importText !== null && (
        <Sheet onClose={() => { setImportText(null); setImportError(null); }}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Восстановить из копии</div>
          <div className="f-body text-xs mb-3" style={{ color: C.redText }}>Текущие записи будут заменены.</div>
          <button onClick={() => fileInput.current?.click()} className="f-body w-full rounded-xl py-3 text-sm font-medium mb-3 flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
            <Upload size={15} /> Выбрать файл копии
          </button>
          <div className="f-body text-xs mb-2" style={{ color: C.dim }}>Или вставить текстом:</div>
          <textarea value={importText} onChange={(e) => { setImportText(e.target.value); setImportError(null); }} rows={5} placeholder="Вставь сюда резервную копию…" aria-label="Текст резервной копии" className="f-num w-full rounded-lg p-2.5 text-2xs" style={{ background: C.bg, color: C.chalk, border: `1px solid ${C.line}` }} />
          {importError && <div className="f-body text-xs mt-2" style={{ color: C.redText }}>{importError}</div>}
          <button onClick={() => doImport(importText)} disabled={!importText.trim()} className="f-body w-full mt-2 rounded-xl py-3 text-sm font-medium" style={{ background: importText.trim() ? C.surfaceHi : C.surface, color: importText.trim() ? C.chalk : C.dim, border: `1px solid ${C.line}` }}>Восстановить из текста</button>
          <button onClick={() => { setImportText(null); setImportError(null); }} className="f-body w-full mt-1 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}

      {showSettings && (
        <Sheet onClose={() => setShowSettings(false)}>
          <div className="f-body text-xs mb-1" style={{ color: C.chalk }}>Дневник хранится прямо на устройстве и работает без интернета.</div>
          <div className="f-body text-xs mb-3 flex items-start gap-1.5" style={{ color: storageInfo?.persisted ? C.moss : C.mustard }}>
            <HardDrive size={13} className="shrink-0 mt-0.5" />
            <span>
              {storageInfo?.persisted
                ? "Хранилище закреплено — система не удалит данные сама."
                : "Хранилище не закреплено. Делай копию хотя бы раз в месяц."}
            </span>
          </div>
          <div className="rounded-xl p-3 mb-2" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
            <div className="f-body text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5" style={{ color: C.dim }}>
              <Type size={13} /> Размер текста
            </div>
            <div className="flex gap-1.5">
              {TEXT_SIZES.map((t) => {
                const on = (profile.textSize || "normal") === t.id;
                return (
                  <button key={t.id} onClick={() => setProfile((p) => ({ ...p, textSize: t.id }))}
                    aria-pressed={on}
                    className="f-body flex-1 rounded-lg py-2.5 px-1 text-2xs"
                    style={{ background: on ? C.red : C.surface, color: on ? C.chalk : C.dim, border: `1px solid ${on ? C.red : C.line}` }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setProfile((p) => ({ ...p, bigTaps: !p.bigTaps }))}
              aria-pressed={!!profile.bigTaps}
              className="f-body w-full mt-2 rounded-lg py-2.5 text-xs flex items-center justify-center gap-2"
              style={{ background: profile.bigTaps ? C.surface : C.surface, color: C.chalk, border: `1px solid ${profile.bigTaps ? C.moss : C.line}` }}>
              <span className="shrink-0 w-5 h-5 rounded flex items-center justify-center"
                style={{ background: profile.bigTaps ? C.moss : "transparent", border: `1px solid ${profile.bigTaps ? C.moss : C.line}` }}>
                {profile.bigTaps && <Check size={13} color={C.chalk} />}
              </span>
              Крупные кнопки
            </button>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { const next = !muted; setProfile((p) => ({ ...p, muted: next })); if (!next) primeAudio(); }}
              className="f-body flex-1 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              {muted ? <VolumeX size={15} color={C.dim} /> : <Volume2 size={15} color={C.mossText} />}
              Сигнал: {muted ? "выкл" : "вкл"}
            </button>
            <button
              onClick={() => { primeAudio(); playRestOver(); setTimeout(() => say(audioReady() ? "Не слышно? Проверь переключатель звука сбоку телефона" : "Система не пустила звук — попробуй ещё раз"), 700); }}
              disabled={muted}
              className="f-body flex-1 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              style={{ background: C.surfaceHi, color: muted ? C.dim : C.chalk, border: `1px solid ${C.line}` }}>
              <Volume2 size={15} /> Проверить
            </button>
          </div>
          <button onClick={saveBackupFile} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Share2 size={15} /> Сохранить копию файлом</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(backupJSON()); say("Копия в буфере обмена"); } catch { setShowSettings(false); setExportText(backupJSON()); } }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Copy size={15} /> Скопировать копию текстом</button>
          <button onClick={openImport} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Upload size={15} /> Восстановить из копии</button>
          <button onClick={() => { setShowSettings(false); setShowTerms(true); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><FileText size={15} /> О приложении и ограничениях</button>
          <div className="mb-2"><ConfirmButton onConfirm={() => { setDays(DEFAULT_DAYS); setShowSettings(false); say("Дни возвращены к исходным"); }} question="Свои дни будут заменены" className="f-body w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><RotateCcw size={15} /> Сбросить дни к исходным</ConfirmButton></div>
          <ConfirmButton onConfirm={wipe} question="Стереть весь дневник?" className="f-body w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Удалить все записи</ConfirmButton>
          <button onClick={() => setShowSettings(false)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}

      {/* невидимый выбор файла — открывает «Файлы» на iPhone и проводник на компьютере */}
      <input ref={fileInput} type="file" accept="application/json,.json,text/plain" onChange={pickBackupFile} className="hidden" />

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 f-body text-xs pointer-events-none"
          style={{ bottom: "calc(4.5rem + var(--safe-bottom))", background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
          {toast}
        </div>
      )}
    </div>
  );
}
