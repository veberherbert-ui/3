import React, { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue, lazy, Suspense } from "react";
import { Plus, X, TrendingUp, BookOpen, Dumbbell, Flame, Settings, Trash2, Check, Info, Play, Timer, Calculator, Copy, ExternalLink, Activity, Pause, ChevronDown, ChevronUp, MoreHorizontal, Search, Library, Layers, Pencil, RotateCcw, Download, Upload, Share2, HardDrive, ShieldAlert, TriangleAlert, HeartPulse, Repeat2, Volume2, VolumeX, RefreshCw, FileText, Type, CalendarPlus, Tag, GripVertical, Bell } from "lucide-react";

import { EXDB, GROUPS, PRESETS, DEFAULT_DAYS, isUni, isBW, isPair, GEAR, GEAR_PRESETS, fitsGear, moveOf, variantsOf } from "./data/exercises.js";
import { CONDITIONS, CONDITION_BY_ID, helpfulNote } from "./data/conditions.js";
import { TECHNIQUE } from "./data/technique.js";
import { TAGS, TAG_BY_ID, tagLine } from "./data/tags.js";
import { saferAlternatives, worstRisk, risksFor, dayWarnings } from "./lib/swap.js";
import { C, plateColor, GROUP_COLOR } from "./lib/theme.js";
import { today, daysAgo, fmtDate } from "./lib/dates.js";
import {
  uid, r1, ytLink,
  exTonnage, workoutTonnage, bwKg, addedKg, perRepKg, weightNear, topWeight, topReps,
  epley, brzycki, est1RM, readyToAdd,
  bodyFatNavy, bmrOf, bmiOf, lbmOf, ffmiOf,
} from "./lib/calc.js";
import { loadKey, saveKey, deleteKey, requestPersistence, storageEstimate } from "./lib/storage.js";
import { fillPairFlags } from "./lib/migrate.js";
import { useDragOrder, moveItem } from "./lib/reorder.js";
import { shareOrDownload, readFileAsText, backupName } from "./lib/backup.js";
import { restFor, fmtRest, stepRest } from "./lib/rest.js";
import { workoutEnergy } from "./lib/energy.js";
import { summary, movers, weeklyVolume, muscleWeek, compare } from "./lib/progress.js";
import { primeAudio, playRestOver, scheduleRestOver, cancelScheduled, vibrate, tapBuzz, releaseAudio, audioReady, setAudioMode } from "./lib/sound.js";
import { notifyState, askNotify, scheduleRestNotice, cancelRestNotice } from "./lib/notify.js";
import { openBack, closeBack } from "./lib/backstack.js";
import { isIOS, isAndroid } from "./lib/platform.js";
import { adaptPreset, similarTo, byFit } from "./lib/fitplan.js";
import { useWakeLock } from "./lib/wakelock.js";
import { buildLabel, installed, checkForUpdate, reloadOnUpdate } from "./lib/update.js";
import { useAppearance, TEXT_SIZES } from "./lib/appearance.js";
import DisclaimerGate, { DisclaimerBody } from "./Disclaimer.jsx";
import SetupGate from "./Setup.jsx";

/* Графики грузятся отдельным куском: библиотека тяжёлая, а нужна только
   на двух вкладках из пяти. */
const LineByDate = lazy(() => import("./Charts.jsx").then((m) => ({ default: m.LineByDate })));

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
const Sheet = ({ children, onClose }) => {
  /* Кнопка «назад» на андроиде должна закрывать лист, а не приложение. */
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const entry = openBack(() => close.current?.());
    return () => closeBack(entry);
  }, []);
  return (
    <div className="sheet-scrim fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
      <div className="sheet-panel w-full max-w-xl rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
};
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
/* «1 замена», «2 замены», «5 замен» — иначе цифра читается как ошибка. */
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
};

/** Ручка перетаскивания: видимая и достаточно крупная, чтобы попасть пальцем. */
const Grip = (props) => (
  <span {...props} aria-hidden="true"
    className="shrink-0 flex items-center justify-center cursor-grab select-none"
    style={{ width: 34, minHeight: 44, ...props.style }}>
    <GripVertical size={18} color={C.line} />
  </span>
);
const UniTag = () => (
  <span className="f-body text-2xs rounded px-1 py-0.5 ml-1 align-middle" style={{ background: C.blue, color: C.chalk }}>×2</span>
);
/* Две гантели: в поле веса стоит одна, тоннаж считается за обе. */
const PairTag = () => (
  <span className="f-body text-2xs rounded px-1 py-0.5 ml-1 align-middle" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>пара</span>
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
/* Разложить упражнения мышцы по движениям.

   Двенадцать вариантов на широчайшие читаются как стена. Те же двенадцать
   под тремя подзаголовками — «вертикальная тяга», «горизонтальная тяга»,
   «пулловер» — читаются как три решения. Дополнительного нажатия при этом
   не появляется: заголовок не кнопка, всё видно сразу.

   Когда движение в мышце одно, подзаголовок не рисуем — он ничего
   не добавляет, а место занимает. */
function byMove(names) {
  /* Группируем по имени движения, а не по соседству в списке: упражнения
     одной мышцы лежат в базе вперемешку — резину дописывали позже штанги,
     и «горизонтальная тяга» иначе появлялась дважды. */
  const map = new Map();
  names.forEach((n) => {
    const move = moveOf(n) || "";
    if (!map.has(move)) map.set(move, []);
    map.get(move).push(n);
  });
  return [...map.entries()].map(([move, list]) => ({ move, list }));
}

/* Выбор упражнения — один на всё приложение.

   Раньше здесь был плоский список на сто одну строку: чтобы добавить
   упражнение в тренировку, приходилось листать всё подряд или помнить
   название. Теперь тот же путь, что и в каталоге: область — мышца —
   упражнение. Три коротких списка вместо одного длинного.

   Поиск остался сверху: кто помнит название, тот его печатает, и никакие
   раскрытия ему не нужны. */
function ExercisePicker({ title, onPick, onClose, has, conditions = [], gear = [] }) {
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState(null);
  const [openM, setOpenM] = useState(null);
  const [all, setAll] = useState(false);
  const query = q.trim().toLowerCase();

  /* Инвентарь прячет то, чего не на чем сделать. Но уже добавленное
     показываем всегда: иначе упражнение из старой тренировки исчезнет
     и будет непонятно, куда делось. */
  const ok = useCallback((n) => all || fitsGear(n, gear) || has?.(n), [all, gear, has]);

  const found = useMemo(() => {
    if (query.length < 2) return null;
    return Object.keys(EXDB).filter((n) =>
      ok(n) && (n.toLowerCase().includes(query) || EXDB[n].m.toLowerCase().includes(query)));
  }, [query, ok]);

  const hidden = useMemo(
    () => (all || !gear.length ? 0 : Object.keys(EXDB).filter((n) => !fitsGear(n, gear)).length),
    [all, gear],
  );

  const Row = ({ n }) => {
    const already = has?.(n);
    return (
      <button onClick={() => onPick(n)} disabled={already}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        style={{ background: C.surfaceHi, opacity: already ? 0.45 : 1, borderTop: `1px solid ${C.line}` }}>
        <span className="min-w-0">
          <span className="f-body text-sm block" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
          <span className="f-body text-2xs" style={{ color: C.dim }}>{EXDB[n].eq}</span>
        </span>
        {already ? <Check size={15} color={C.mossText} className="shrink-0" /> : <Plus size={15} color={C.mossText} className="shrink-0" />}
      </button>
    );
  };

  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-2" style={{ color: C.chalk }}>{title}</div>
      <div className="relative mb-3">
        <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или мышце…" aria-label="Поиск упражнения"
          className="f-body w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
      </div>

      {found ? (
        <div className="rounded-lg overflow-hidden" style={{ background: C.surfaceHi }}>
          {!found.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Ничего не нашлось.</div>}
          {found.map((n) => <Row key={n} n={n} />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {GROUPS.map((g) => {
            const muscles = g.muscles.map((m) => ({ ...m, list: m.list.filter(ok) })).filter((m) => m.list.length);
            if (!muscles.length) return null;
            const count = muscles.reduce((n, m) => n + m.list.length, 0);
            const open = openG === g.name;
            return (
              <div key={g.name} className="rounded-lg overflow-hidden" style={{ background: C.surfaceHi }}>
                <button onClick={() => { setOpenG(open ? null : g.name); setOpenM(null); }} className="w-full flex items-center justify-between px-3 py-2.5">
                  <span className="f-body text-sm font-medium" style={{ color: open ? C.red : C.chalk }}>{g.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="f-num text-2xs" style={{ color: C.dim }}>{count}</span>
                    {open ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
                  </span>
                </button>
                {open && muscles.map((m) => {
                  const mo = openM === m.name;
                  return (
                    <div key={m.name} style={{ borderTop: `1px solid ${C.line}` }}>
                      <button onClick={() => setOpenM(mo ? null : m.name)} className="w-full flex items-center justify-between px-3 py-2">
                        <span className="f-body text-xs" style={{ color: mo ? C.chalk : C.dim }}>{m.name}</span>
                        <span className="f-num text-2xs" style={{ color: C.dim }}>{m.list.length}</span>
                      </button>
                      {mo && byMove(m.list).map((grp) => (
                        <div key={grp.move}>
                          {byMove(m.list).length > 1 && (
                            <div className="f-body text-2xs px-3 pt-2 pb-0.5" style={{ color: C.dim, borderTop: `1px solid ${C.line}` }}>{grp.move}</div>
                          )}
                          {grp.list.map((n) => <Row key={n} n={n} />)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {hidden > 0 && (
        <button onClick={() => setAll(true)} className="f-body w-full mt-2 py-2.5 text-xs" style={{ color: C.blueText }}>
          Скрыто {hidden} — нет в моём инвентаре. Показать всё
        </button>
      )}
      <button onClick={onClose} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Готово</button>
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

function ExerciseInfo({ name, onClose, days, onAddToDay, conditions = [], gear = [] }) {
  const [shown, setShown] = useState(name);
  useEffect(() => setShown(name), [name]);
  const info = EXDB[shown];
  const [pick, setPick] = useState(false);
  /* Варианты того же движения — только на том, что есть под рукой. */
  const siblings = useMemo(() => variantsOf(shown).filter((n) => fitsGear(n, gear)), [shown, gear]);
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
        <RiskPanel name={shown} conditions={conditions} onOpen={setShown} gear={gear} />
        <div className="f-body text-sm leading-relaxed mb-3" style={{ color: C.chalk }}>{info.d}</div>
        <TechniqueBlock name={shown} fallbackCue={info.cue} />
        {info.uni && <div className="f-body text-xs mb-3" style={{ color: C.blueText }}>Одностороннее: записывай один подход — приложение считает обе стороны, тоннаж умножается на два.</div>}

        {/* То же движение на другом снаряде. Тренажёр занят, дома нет блока,
            плечо не любит штангу — выбор варианта решает всё это в один тап. */}
        {siblings.length > 0 && (
          <div className="mb-3">
            <div className="f-body text-xs uppercase tracking-wide mb-1.5" style={{ color: C.dim }}>
              {moveOf(shown)} — то же движение
            </div>
            <div className="flex flex-wrap gap-1.5">
              {siblings.map((n) => (
                <button key={n} onClick={() => setShown(n)} className="f-body text-xs rounded-full px-3 text-left"
                  style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
                  {/* Название целиком: у подтягиваний вся разница именно
                      в скобках, и обрезать их — значит сделать два одинаковых. */}
                  {n}<span className="text-2xs" style={{ color: C.dim }}> · {EXDB[n].eq}</span>
                </button>
              ))}
            </div>
          </div>
        )}
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
/* Пустое поле — это и «», и null: число могли стереть, а могли не вписать. */
const blank = (v) => v === "" || v == null;

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
    pair: isPair(name),
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

/* Кнопка подхода: ▶ — начать, секундомер — идёт, ✓ — сделан.

   Раньше была просто галочка, и время под нагрузкой приходилось оценивать
   по темпу — три секунды на повторение. Для подхода в отказ с паузами это
   мимо вдвое, а от времени под нагрузкой зависит и плотность тренировки,
   и расход калорий.

   Кто не хочет возиться — жмёт дважды подряд: замер короче пяти секунд
   не считается замером, и подход просто отмечается сделанным, как раньше.

   Тикает здесь, а не в SessionTab: иначе каждую секунду перерисовывались бы
   все упражнения вместе с полями ввода, и в них терялся бы курсор. */
const SEC_MIN_MEASURED = 5;

function SetButton({ set, index, exName, running, startedAt, onStart, onStop, onToggle }) {
  useTicker(running);
  const done = !!set.done;
  const elapsed = running ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const label = done
    ? `${exName}, подход ${index + 1}: снять отметку`
    : running
      ? `${exName}, подход ${index + 1}: идёт ${elapsed} секунд, закончить`
      : `${exName}, подход ${index + 1}: начать`;
  const bg = done ? C.moss : running ? C.mustard : C.surfaceHi;
  const line = done ? C.moss : running ? C.mustard : C.line;
  return (
    <button onClick={done ? onToggle : running ? onStop : onStart} aria-label={label} aria-pressed={done}
      className="shrink-0 rounded-lg flex items-center justify-center px-1.5"
      style={{ background: bg, border: `1px solid ${line}` }}>
      {/* Готовый подход показывает свой замер, если он был: отдельной строки
          «под нагрузкой» больше нет, число стоит там, где его сделали. */}
      {done ? (+set.sec > 0
        ? <span className="f-num text-xs font-semibold tabular-nums" style={{ color: C.chalk }}>{fmtClock(set.sec * 1000)}</span>
        : <Check size={20} color={C.chalk} />)
        : running ? <span className="f-num text-xs font-semibold tabular-nums" style={{ color: C.bg }}>{fmtClock(elapsed * 1000)}</span>
          : <Play size={18} color={C.dim} />}
    </button>
  );
}

/** Метки за кнопкой — для форм, где карточек много и место дорого. */
function TagBlock({ tags = [], onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen((v) => !v)} className="tap-inline f-body text-xs flex items-center gap-1 py-1.5" style={{ color: tags.length ? C.mustard : C.dim }}>
        <Tag size={13} /> {tags.length ? tagLine(tags) : "метки"} {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && <div className="mt-1"><TagPicker tags={tags} onToggle={onToggle} /></div>}
    </div>
  );
}

/** Метки упражнения: как оно прошло, а не сколько было поднято. */
function TagPicker({ tags = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAGS.map((t) => {
        const on = tags.includes(t.id);
        const accent = t.warn ? C.red : C.blue;
        return (
          <button key={t.id} onClick={() => onToggle(t.id)} aria-pressed={on}
            className="f-body text-xs rounded-full px-3"
            style={{ background: on ? accent : C.surfaceHi, color: on ? C.chalk : C.dim, border: `1px solid ${on ? accent : C.line}` }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* Отдых считается от метки времени в самой сессии, а сессия сохраняется —
   поэтому таймер переживает сворачивание и перезапуск приложения. */

/** Прилипла ли полоса к верху списка. Нужен маячок над ней: пока он виден,
    полоса стоит на своём месте; пропал из виду — значит, висит сверху,
    и её пора сжать до строки, чтобы не съедала пол-экрана. */
function useStuck() {
  /* Ссылка через состояние, а не useRef: маячок появляется не сразу вместе
     с вкладкой, а когда началась тренировка, — и обычная ссылка к этому
     моменту уже никого не разбудит. */
  const [mark, setMark] = useState(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const root = document.getElementById("tabpanel");
    if (!mark || !root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { root, threshold: 0 });
    io.observe(mark);
    return () => io.disconnect();
  }, [mark]);
  return { ref: setMark, stuck };
}

/** Полоса идущего подхода: секундомер видно из любого места списка,
    и закончить подход можно оттуда же, не отматывая к своей карточке. */
function RunBar({ run, exName, onStop, compact }) {
  useTicker(true);
  const sec = Math.floor((Date.now() - run.at) / 1000);
  return (
    <div className={`rounded-xl flex items-center gap-2.5 ${compact ? "px-3 py-1.5 mb-2" : "px-3.5 py-2.5 mb-3"}`}
      style={{ background: C.surface, border: `1px solid ${C.mustard}` }}>
      <Timer size={compact ? 14 : 12} color={C.mustard} className="shrink-0" />
      {!compact && (
        <div className="min-w-0 flex-1">
          <div className="f-body text-2xs uppercase tracking-wide" style={{ color: C.mustard }}>Подход {run.j + 1}</div>
          <div className="f-body text-xs mt-0.5 truncate" style={{ color: C.dim }}>{exName}</div>
        </div>
      )}
      <div className={`f-num font-bold leading-none tabular-nums shrink-0 ${compact ? "text-2xl" : "text-3xl"}`} style={{ color: C.mustard }}>
        {fmtClock(sec * 1000)}
      </div>
      {compact && <div className="f-body text-xs truncate min-w-0 flex-1" style={{ color: C.dim }}>{exName}</div>}
      <button onClick={onStop} className="f-body rounded-lg px-3.5 text-sm font-semibold shrink-0"
        style={{ background: C.mustard, color: C.bg, minHeight: 44 }}>Готово</button>
    </div>
  );
}

/**
 * Полоса отдыха во всю ширину: крупный счётчик, убывающая заливка,
 * подстройка длительности на месте и сигнал в конце.
 */
function RestBar({ rest, onDone, onAdjust, onSkip, muted, compact }) {
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

  /* Уведомление — на случай, когда приложение свёрнуто, а телефон в руке.
     Оно не заменяет сигнал, а дублирует его: где-то сработает одно,
     где-то другое. */
  useEffect(() => {
    const delay = (until - Date.now()) / 1000;
    if (delay <= 0) return;
    scheduleRestNotice(delay, exName);
    return cancelRestNotice;
  }, [until, exName]);

  /* вибрация планированию не поддаётся — её даём по факту */
  const buzzed = useRef(false);
  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      if (!muted) vibrate();
    }
  }, [done, muted]);

  /* Догоняющий сигнал. Свёрнутое приложение iOS усыпляет вместе с часами
     Web Audio — запланированный аккорд тогда не звучит вовсе. Возвращаемся,
     а отдых давно кончился и об этом никто не сказал. Теперь говорит:
     при возврате сигнал и толчок дают сразу. */
  const caught = useRef(false);
  useEffect(() => {
    caught.current = false; /* каждый отдых догоняем заново */
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (caught.current || Date.now() < until) return;
      caught.current = true;
      cancelRestNotice();
      if (!muted) playRestOver(); else vibrate();
    };
    document.addEventListener("visibilitychange", onBack);
    return () => document.removeEventListener("visibilitychange", onBack);
  }, [until, muted]);

  const pct = total > 0 ? Math.max(0, Math.min(100, (leftMs / (total * 1000)) * 100)) : 0;
  const accent = done ? C.moss : left <= 10 ? C.mustard : C.red;

  /* Прилипнув к верху, полоса ужимается до строки: счётчик, упражнение и
     одна кнопка. ±15 остаются в полной карточке — их правят, когда на неё
     смотрят, а не на бегу. Заливка уходит в тонкую полосу под строкой. */
  if (compact) return (
    <div className="rounded-xl mb-2 overflow-hidden" style={{ background: C.surface, border: `1px solid ${accent}` }}>
      <div className="px-3 py-1.5 flex items-center gap-2.5">
        <Timer size={14} color={accent} className="shrink-0" />
        <div className="f-num text-2xl font-bold leading-none tabular-nums shrink-0" style={{ color: accent }}>
          {done ? "0:00" : fmtClock(left * 1000)}
        </div>
        <div className="f-body text-xs truncate min-w-0 flex-1" style={{ color: C.dim }}>{done ? "Отдых окончен" : exName}</div>
        <button onClick={done ? onDone : onSkip} className="f-body rounded-lg px-3 text-xs font-medium shrink-0"
          style={{ background: done ? accent : C.surfaceHi, color: done ? C.bg : C.dim, border: `1px solid ${done ? accent : C.line}`, minHeight: 44 }}>
          {done ? "Продолжить" : "Пропустить"}
        </button>
      </div>
      <div className="h-1" style={{ background: C.line }}>
        <div className="h-full" style={{ width: `${pct}%`, background: accent, transition: "width 1s linear" }} />
      </div>
    </div>
  );

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

/** Лист «заменить на похожее». Список тот же, из которого приложение
    собирает автозамену под инвентарь, — только выбирает человек. Доступное
    сверху, недоступное внизу и притушено: «у меня этого нет» и «этого
    не бывает» — разные вещи. */
function SwapSheet({ name, gear, conditions, onPick, onClose }) {
  const list = useMemo(() => similarTo(name, gear, 14), [name, gear]);
  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Заменить на похожее</div>
      <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
        Вместо «{name}»{EXDB[name] ? ` · ${EXDB[name].m}` : ""}
      </div>
      {!list.length && <div className="f-body text-sm py-4" style={{ color: C.dim }}>Похожего в базе нет.</div>}
      <div className="space-y-1.5">
        {list.map((x) => (
          <button key={x.name} onClick={() => onPick(x.name)}
            className="w-full text-left rounded-xl px-3 py-2.5"
            style={{ background: C.surfaceHi, border: `1px solid ${x.fits ? C.line : "transparent"}`, opacity: x.fits ? 1 : 0.5 }}>
            <div className="f-body text-sm" style={{ color: C.chalk }}>{x.name}{isUni(x.name) && <UniTag />}<RiskMark name={x.name} conditions={conditions} /></div>
            <div className="f-body text-2xs" style={{ color: C.dim }}>
              {x.muscle} · {x.eq}
              {x.kind === "move" ? " · то же движение" : " · та же мышца"}
              {!x.fits && " · нет в инвентаре"}
            </div>
          </button>
        ))}
      </div>
      <button onClick={onClose} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
    </Sheet>
  );
}

function SessionTab({ session, setSession, workouts, days, onFinish, goToDays, conditions, restOverrides, setRestOverride, muted, bodyAt, gear }) {
  const [pickDay, setPickDay] = useState(days[0]?.id);
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const [info, setInfo] = useState(null);
  const [menu, setMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  /* Какие отработанные упражнения человек раскрыл обратно, и у какого
     открыт лист с метками и техникой. */
  const [opened, setOpened] = useState({});
  const [sheet, setSheet] = useState(null);
  /* Поля повторений — чтобы поставить курсор туда, где не хватает цифры. */
  const fieldRefs = useRef({});
  const { ref: topMark, stuck: stuckTop } = useStuck();
  const [blanksWarn, setBlanksWarn] = useState(false);
  /* Какое упражнение меняем перед стартом. */
  const [swapName, setSwapName] = useState(null);

  const day = days.find((d) => d.id === pickDay) || days[0];
  useEffect(() => { if (day) setPicked(day.exercises); }, [pickDay, days.length]); // eslint-disable-line

  /* объявлено до раннего возврата ниже — хуки нельзя вызывать под условием */
  const moveExercise = useCallback((from, to) =>
    setSession((s) => ({ ...s, exercises: moveItem(s.exercises, from, to) })), [setSession]);
  const { drag, handleProps, rowRef, dragging, didDrag } = useDragOrder(session?.exercises?.length || 0, moveExercise);
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
    const toggle = (n) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
    const start = (names = picked) => {
      if (!names.length) return;
      primeAudio(); /* касание пользователя — момент, когда iOS разрешает звук */
      setSession({
        id: uid(), date: today(), dayId: day?.id || null, dayLabel: day?.name || "Без плана",
        startedAt: Date.now(), resumedAt: Date.now(), accumMs: 0, paused: false, note: "",
        exercises: names.map(blankExercise),
      });
    };

    /* Ни одного дня — это не тупик и не ошибка. Раньше здесь стояла строка
       «Создай его во вкладке База»: текст, отсылающий в другую вкладку
       вместо кнопки, которая сделает это прямо здесь. И плана может не быть
       вовсе — человек пришёл в зал и просто записывает, что делает. */
    if (!days.length) return (
      <div className="px-4 pt-10 pb-8">
        <div className="f-display text-xl font-bold mb-2" style={{ color: C.chalk }}>Плана пока нет</div>
        <div className="f-body text-sm mb-6" style={{ color: C.dim }}>
          Можно собрать программу — или просто записать сегодняшнюю тренировку
          и заняться планом потом.
        </div>
        <button onClick={goToDays} className="f-display w-full rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
          <Layers size={17} /> Собрать программу
        </button>
        <button onClick={() => setAdding(true)} className="f-body w-full mt-2 rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }}>
          <Plus size={15} /> Просто записать тренировку
        </button>
        {!!picked.length && (
          <>
            <div className="space-y-1.5 mt-4">
              {picked.map((n) => (
                <div key={n} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                  <span className="f-body text-sm flex-1 min-w-0" style={{ color: C.chalk }}>{n}</span>
                  <button onClick={() => toggle(n)} aria-label={`Убрать «${n}» из тренировки`} className="shrink-0 flex items-center justify-center" style={{ width: 32, minHeight: 44 }}><X size={18} color={C.dim} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => start()} className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
              <Play size={18} /> Начать тренировку ({picked.length})
            </button>
          </>
        )}
        {adding && (
          <ExercisePicker
            title="Что делаешь сегодня"
            conditions={conditions}
            gear={gear}
            has={(n) => picked.includes(n)}
            onPick={(n) => setPicked((p) => (p.includes(n) ? p : [...p, n]))}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
    );
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
        {/* Список — это и есть тренировка. Раньше здесь стояли галочки: снятая
            галочка означала «сегодня не делаю», но строка оставалась висеть,
            и было непонятно, убрал ты упражнение или нет. Теперь крестик
            убирает строку, а вернуть её можно через «добавить». */}
        <div className="space-y-1.5 mt-3">
          {!picked.length && (
            <div className="f-body text-sm text-center py-6" style={{ color: C.dim }}>
              Пусто. Добавь упражнения ниже или выбери другой день.
            </div>
          )}
          {picked.map((n) => {
            const prev = lastFor(n);
            const up = prev && readyToAdd(prev.ex);
            return (
              <div key={n} className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                {/* Нажатие по названию предлагает замену — то же, что и
                    в конструкторе дня. Карточка упражнения осталась за «i». */}
                <button onClick={() => setSwapName(n)} className="flex-1 text-left min-w-0">
                  <div className="f-body text-sm" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                  {prev && <div className="f-num text-2xs truncate" style={{ color: C.dim }}>{fmtDate(prev.date)}: {setsLine(prev.ex)}</div>}
                  {up && <div className="f-body text-2xs" style={{ color: C.mustard }}>{isBW(n) ? "выбил верх диапазона — пробуй с утяжелением" : "выбил верх диапазона — пробуй +2.5 кг"}</div>}
                </button>
                <button onClick={() => setInfo(n)} aria-label={`Об упражнении «${n}»`} className="shrink-0 flex items-center justify-center"><Info size={18} color={C.dim} /></button>
                <button onClick={() => toggle(n)} aria-label={`Убрать «${n}» из тренировки`}
                  className="shrink-0 flex items-center justify-center" style={{ width: 32, minHeight: 44 }}>
                  <X size={18} color={C.dim} />
                </button>
              </div>
            );
          })}
        </div>
        <button onClick={() => setAdding(true)} className="f-body w-full mt-3 rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surface, color: C.mossText, border: `1px solid ${C.line}` }}>
          <Plus size={15} /> Добавить упражнение
        </button>
        <div className="flex gap-2 mt-2">
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
        {swapName && (
          <SwapSheet
            name={swapName} gear={gear} conditions={conditions}
            onClose={() => setSwapName(null)}
            onPick={(to) => { setPicked((p) => (p.includes(to) ? p.filter((x) => x !== swapName) : p.map((x) => (x === swapName ? to : x)))); setSwapName(null); }}
          />
        )}
        {adding && (
          <ExercisePicker
            title="Добавить в тренировку"
            conditions={conditions}
            gear={gear}
            has={(n) => picked.includes(n)}
            onPick={(n) => setPicked((p) => (p.includes(n) ? p : [...p, n]))}
            onClose={() => setAdding(false)}
          />
        )}
        {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} conditions={conditions} gear={gear} />}
      </div>
    );
  }

  /* активная */
  const upd = (i, j, f, v) => setSession((s) => {
    const ex = [...s.exercises]; const e = { ...ex[i], sets: [...ex[i].sets] };
    e.sets[j] = { ...e.sets[j], [f]: v }; ex[i] = e; return { ...s, exercises: ex };
  });
  /* Начали подход: секундомер живёт в самой сессии, поэтому переживает
     сворачивание приложения. Отдых на это время убираем — он кончился. */
  /* Идущий подход помним по имени упражнения, а не по номеру в списке:
     список можно переставить прямо во время отсчёта, и номер уедет. */
  const startSet = (i, j) => {
    tapBuzz();
    primeAudio(); /* касание пользователя — момент, когда iOS разрешает звук */
    cancelScheduled();
    setSession((s) => ({ ...s, rest: null, run: { name: s.exercises[i].name, j, at: Date.now() } }));
  };

  /** Отметить подход сделанным и запустить отдых. sec — замер, если он был. */
  const finishSet = (i, j, sec) => {
    const ex = session.exercises[i];
    tapBuzz();
    primeAudio();
    /* Подход отмечен, а повторения не вписаны — курсор сам встаёт в поле.
       Раньше такой подход молча пропадал при сохранении. */
    if (ex.sets[j]?.reps === "" || ex.sets[j]?.reps == null) {
      setTimeout(() => fieldRefs.current[`${ex.name}:${j}:reps`]?.focus(), 60);
    }
    const total = restFor(ex.name, restOverrides);
    setSession((prev) => {
      const list = [...prev.exercises];
      const e = { ...list[i], sets: [...list[i].sets] };
      e.sets[j] = { ...e.sets[j], done: true, sec: sec || null };
      list[i] = e;
      return { ...prev, exercises: list, run: null, rest: { until: Date.now() + total * 1000, total, exName: ex.name } };
    });
  };

  /* Снять отметку: замер тоже убираем, иначе он останется от подхода,
     который решили переделать. */
  const untick = (i, j) => {
    tapBuzz();
    setSession((prev) => {
      const list = [...prev.exercises];
      const e = { ...list[i], sets: [...list[i].sets] };
      e.sets[j] = { ...e.sets[j], done: false, sec: null };
      list[i] = e;
      return { ...prev, exercises: list };
    });
  };
  const addSet = (i) => setSession((s) => {
    const ex = [...s.exercises]; const e = { ...ex[i] };
    const last = e.sets[e.sets.length - 1] || { reps: "", weight: "" };
    e.sets = [...e.sets, { reps: "", weight: last.weight, done: false, sec: null }]; ex[i] = e; return { ...s, exercises: ex };
  });
  /* Убрать последний подход. Добавить их можно было всегда, а убрать —
     нет: лишняя строка потом просто не сохранялась, но человек об этом
     не знает и сидит с подходом, которого не делал. Убираем именно
     последний: посреди тренировки лишним оказывается тот, что дописали. */
  const rmSet = (i) => setSession((s) => {
    const ex = [...s.exercises];
    const e = { ...ex[i] };
    if (e.sets.length < 2) return s;
    e.sets = e.sets.slice(0, -1);
    ex[i] = e;
    return { ...s, exercises: ex };
  });
  const rmExercise = (i) => setSession((s) => ({ ...s, exercises: s.exercises.filter((_, k) => k !== i) }));
  const toggleTag = (i, id) => setSession((s) => {
    const list = [...s.exercises];
    const cur = list[i].tags || [];
    list[i] = { ...list[i], tags: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    return { ...s, exercises: list };
  });
  const run = session.run;
  /* Сумма замеров по упражнению. Пока ни один подход не засекали — ноль,
     и строка не показывается: обещать точность, которой нет, незачем. */
  const underLoad = (ex) => ex.sets.reduce((n, s) => n + (+s.sec || 0), 0);
  /* решил доделать что-то сверх плана — добавляем прямо на ходу */
  const addExercise = (n) => setSession((s) =>
    s.exercises.some((e) => e.name === n) ? s : { ...s, exercises: [...s.exercises, blankExercise(n)] });
  const togglePause = () => setSession((s) => s.paused
    ? { ...s, paused: false, resumedAt: Date.now() }
    : { ...s, paused: true, accumMs: (s.accumMs || 0) + (Date.now() - (s.resumedAt || s.startedAt)) });

  const live = workoutTonnage({ exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })) }, bodyAt?.(session.date));
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  /* Подходы, отмеченные сделанными, но без цифр. Сохранить их не во что —
     а молча выбросить нельзя: человек их делал и видел, что отметил. */
  const blanks = session.exercises.flatMap((e) =>
    e.sets.flatMap((s, j) => {
      if (!s.done) return [];
      const field = blank(s.reps) ? "reps" : !e.bodyweight && blank(s.weight) ? "weight" : null;
      return field ? [{ name: e.name, j, field }] : [];
    }),
  );

  const finish = (force = false) => {
    if (!force && blanks.length) { setMenu(false); setBlanksWarn(true); return; }
    const cleaned = session.exercises.map((e) => ({
      name: e.name, bodyweight: e.bodyweight, uni: !!e.uni, pair: !!e.pair,
      tags: e.tags?.length ? e.tags : undefined,
      sets: e.sets.filter((s) => !blank(s.reps) && (e.bodyweight || !blank(s.weight)))
        .map((s) => ({ reps: +s.reps, weight: setWeight(e, s), sec: +s.sec > 0 ? +s.sec : undefined })),
    })).filter((e) => e.sets.length);
    setMenu(false);
    if (!cleaned.length) { setSession(null); return; }
    const ms = elapsedMs(session, Date.now());
    onFinish({ id: session.id, date: session.date, dayId: session.dayId, dayLabel: session.dayLabel, note: session.note, durationMin: Math.max(1, Math.round(ms / 60000)), exercises: cleaned });
  };

  /* Идущий подход держим под рукой так же, как отдых: индекс ищем по имени,
     потому что список можно переставить прямо во время отсчёта. */
  const runIdx = run ? session.exercises.findIndex((e) => e.name === run.name) : -1;

  return (
    <div className="px-4 pt-3 pb-10">
      {/* Маячок: пока он в поле зрения, полоса ниже стоит на месте. */}
      <div ref={topMark} style={{ height: 1 }} aria-hidden="true" />
      {/* Часы не должны уезжать вверх вместе со списком: до конца отдыха
          приходилось прокручивать обратно, а закончить подход можно было
          только с кнопки своего упражнения. Теперь то, что тикает, висит
          сверху — и сжимается до строки, чтобы не занимать пол-экрана. */}
      {(session.rest || run) && (
        <div style={{
          position: "sticky", top: 0, zIndex: 20, background: C.bg,
          marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16,
          /* Прилипнув, полоса должна читаться как слой над списком, а не как
             его первая карточка: отступ сверху и тень снизу. */
          paddingTop: stuckTop ? 6 : 0, paddingBottom: stuckTop ? 4 : 0,
          boxShadow: stuckTop ? "0 10px 12px -10px rgba(0,0,0,.9)" : "none",
        }}>
          {run && runIdx >= 0 ? (
            <RunBar
              run={run}
              exName={run.name}
              compact={stuckTop}
              onStop={() => {
                const sec = Math.round((Date.now() - run.at) / 1000);
                finishSet(runIdx, run.j, sec >= SEC_MIN_MEASURED ? sec : null);
              }}
            />
          ) : session.rest ? (
            <RestBar
              rest={session.rest}
              muted={muted}
              compact={stuckTop}
              onDone={clearRest}
              onSkip={clearRest}
              onAdjust={(dir) => {
                adjustRest(dir);
                setRestOverride(session.rest.exName, stepRest(session.rest.total, dir));
              }}
            />
          ) : null}
        </div>
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
          <button onClick={() => finish()} className="f-display flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => setMenu(true)} aria-label="Ещё действия" className="w-11 rounded-lg flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}` }}><MoreHorizontal size={20} color={C.dim} /></button>
        </div>
        {session.paused && <div className="f-body text-xs mt-2" style={{ color: C.mustard }}>Пауза — время не идёт. Можно закрыть приложение и вернуться.</div>}
      </div>

      <div className="mt-3 space-y-2">
        {session.exercises.map((ex, i) => {
          const prev = lastFor(ex.name);
          const filled = ex.sets.filter((s) => s.done);
          /* Отработанное упражнение складывается в строку. В середине
             тренировки половина списка — уже сделанное, и держать под ним
             три пустых поля незачем: нужное сейчас должно быть на экране,
             а не за двумя пролистываниями. */
          const packed = filled.length === ex.sets.length && filled.length > 0 && !opened[ex.name];
          /* Карточка под пальцем приподнимается, соседи расступаются:
             видно, куда она встанет, если отпустить. */
          const held = drag?.from === i;
          const target = drag && drag.to === i && !held;
          const lift = held
            ? { opacity: 0.9, transform: "scale(1.02)", boxShadow: "0 8px 24px rgba(0,0,0,.5)", zIndex: 10, position: "relative" }
            : target
              ? { borderColor: C.blue }
              : null;
          if (packed) return (
            <div key={i} ref={rowRef(i)} className="rounded-xl flex items-center"
              style={{ background: C.surface, border: `1px solid ${C.line}`, ...lift }}>
              <Grip {...handleProps(i)} />
              <button onClick={() => { if (!didDrag()) setOpened((o) => ({ ...o, [ex.name]: true })); }}
                className="flex-1 min-w-0 text-left py-2.5 pr-3 flex items-center gap-2">
                <Check size={16} color={C.moss} className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="f-body text-sm block truncate" style={{ color: C.dim }}>{ex.name}</span>
                  <span className="f-num text-2xs block truncate" style={{ color: C.dim }}>{setsLine(ex)}</span>
                </span>
                {ex.tags?.length > 0 && <span className="f-body text-2xs shrink-0" style={{ color: ex.tags.includes("pain") ? C.redText : C.mustard }}>{tagLine(ex.tags)}</span>}
              </button>
            </div>
          );
          return (
            <div key={i} ref={rowRef(i)} className="rounded-xl pt-1 pb-3 px-3" style={{ background: C.surface, border: `1px solid ${C.line}`, ...lift }}>
              <div className="flex items-start justify-between gap-1 mb-2">
                {/* Ручка слева: у неё прокрутка отключена заранее, поэтому
                    жест не спорит с листанием списка. И её видно — понятно,
                    что карточку можно двигать. */}
                <Grip {...handleProps(i)} />
                <div className="min-w-0 flex-1 pt-2">
                  <div className="f-body text-sm font-medium" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}{ex.pair && <PairTag />}<RiskMark name={ex.name} conditions={conditions} /></div>
                  {/* Одна служебная строка вместо трёх: что было в прошлый раз
                      и сколько отдыхать — остальное убрано под «ещё». */}
                  <div className="f-num text-2xs truncate" style={{ color: C.dim }}>
                    {prev ? `${setsLine(prev.ex)} · ` : ""}отдых {fmtRest(restFor(ex.name, restOverrides))}
                  </div>
                  {ex.tags?.length > 0 && (
                    <div className="f-body text-2xs" style={{ color: ex.tags.includes("pain") ? C.redText : C.mustard }}>{tagLine(ex.tags)}</div>
                  )}
                </div>
                <button onClick={() => setSheet(i)} aria-label={`«${ex.name}»: метки, техника, убрать`} className="shrink-0 flex items-center justify-center">
                  <MoreHorizontal size={18} color={C.dim} />
                </button>
              </div>
              <div className="space-y-1.5">
                {ex.sets.map((s, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="f-num text-xs w-3" style={{ color: C.dim }}>{j + 1}</span>
                    {/* Отмеченный, но пустой подход подсвечиваем сразу: он
                        не сохранится, и узнать об этом надо не в журнале. */}
                    <input type="number" inputMode="numeric" placeholder="повт"
                      ref={(el) => { fieldRefs.current[`${ex.name}:${j}:reps`] = el; }}
                      aria-label={`${ex.name}, подход ${j + 1}: повторения`} value={s.reps}
                      onChange={(e) => upd(i, j, "reps", e.target.value)}
                      className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0"
                      style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${s.done && s.reps === "" ? C.mustard : C.line}` }} />
                    {/* Своим весом поле не прячем: подтягивания делают и с блином
                        на поясе, икры — с гантелью. Пустое поле значит «без утяжеления». */}
                    <span className="f-body text-xs" aria-hidden="true" style={{ color: C.dim }}>{ex.bodyweight ? "+" : "×"}</span>
                    <input type="number" inputMode="decimal" placeholder={ex.bodyweight ? "+кг" : "кг"}
                      aria-label={`${ex.name}, подход ${j + 1}: ${ex.bodyweight ? "утяжеление в килограммах" : "вес в килограммах"}`}
                      ref={(el) => { fieldRefs.current[`${ex.name}:${j}:weight`] = el; }}
                      value={s.weight ?? ""} onChange={(e) => upd(i, j, "weight", e.target.value)}
                      className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0"
                      style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${s.done && !ex.bodyweight && (s.weight === "" || s.weight == null) ? C.mustard : C.line}` }} />
                    <SetButton
                      set={s} index={j} exName={ex.name}
                      running={run?.name === ex.name && run?.j === j}
                      startedAt={run?.at}
                      onStart={() => startSet(i, j)}
                      onStop={() => {
                        const sec = Math.round((Date.now() - run.at) / 1000);
                        finishSet(i, j, sec >= SEC_MIN_MEASURED ? sec : null);
                      }}
                      onToggle={() => untick(i, j)}
                    />
                  </div>
                ))}
              </div>
              {/* Убрать — рядом с добавить, а не крестиком в каждой строке:
                  строка подхода и так из четырёх элементов, а на узком
                  экране пятый уже не помещается. Отработанный подход
                  просто так не удаляется — он спросит. */}
              <div className="flex items-center gap-4 mt-2">
                <button onClick={() => addSet(i)} className="tap-inline f-body py-1.5 text-xs" style={{ color: C.mossText }}>+ подход</button>
                {ex.sets.length > 1 && (() => {
                  const last = ex.sets[ex.sets.length - 1];
                  const filled = last.done || !blank(last.reps) || !blank(last.weight);
                  return filled ? (
                    <ConfirmButton onConfirm={() => rmSet(i)} question={`Убрать подход ${ex.sets.length}?`}
                      className="tap-inline f-body py-1.5 text-xs" style={{ color: C.dim }}>
                      − убрать подход
                    </ConfirmButton>
                  ) : (
                    <button onClick={() => rmSet(i)} aria-label={`Убрать подход ${ex.sets.length} из «${ex.name}»`}
                      className="tap-inline f-body py-1.5 text-xs" style={{ color: C.dim }}>− убрать подход</button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setAdding(true)} className="f-body w-full mt-3 rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surface, color: C.mossText, border: `1px solid ${C.line}` }}>
        <Plus size={15} /> Добавить упражнение
      </button>

      <textarea value={session.note} onChange={(e) => setSession((s) => ({ ...s, note: e.target.value }))} placeholder="Заметка: самочувствие, плечо, сон, что тянуло…" aria-label="Заметка к тренировке" rows={2}
        className="f-body w-full mt-3 rounded-xl px-3 py-2.5 text-sm resize-none" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
      <button onClick={() => finish()} className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={18} /> Завершить и сохранить</button>

      {/* Незаполненные отметки. Тихо выбрасывать их нельзя: человек делал
          подход, видел отметку и таймер отдыха — а в журнале его нет. */}
      {blanksWarn && (
        <Sheet onClose={() => setBlanksWarn(false)}>
          <div className="f-display text-base font-semibold mb-2" style={{ color: C.chalk }}>
            {blanks.length === 1 ? "Один подход без цифр" : `Подходов без цифр: ${blanks.length}`}
          </div>
          <div className="f-body text-sm mb-3" style={{ color: C.chalk }}>
            Они отмечены сделанными, но повторения или вес не вписаны. Сохранить нечего —
            в журнал такие подходы не попадут.
          </div>
          <div className="mb-3">
            {blanks.map(({ name, j, field }) => (
              <div key={`${name}:${j}`} className="f-body text-xs py-1" style={{ color: C.dim, borderTop: `1px solid ${C.line}` }}>
                {name} · подход {j + 1} · нет {field === "reps" ? "повторений" : "веса"}
              </div>
            ))}
          </div>
          <button onClick={() => { setBlanksWarn(false); const b = blanks[0]; setTimeout(() => fieldRefs.current[`${b.name}:${b.j}:${b.field}`]?.focus(), 250); }}
            className="f-display w-full rounded-xl py-3 text-sm font-semibold" style={{ background: C.red, color: C.chalk }}>
            Вернуться и дописать
          </button>
          <button onClick={() => { setBlanksWarn(false); finish(true); }} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>
            Сохранить без них
          </button>
        </Sheet>
      )}

      {/* Всё, что не «ввести подход», живёт здесь: метки, техника, удаление.
          В карточке остаётся только то, ради чего в неё смотрят. */}
      {sheet !== null && session.exercises[sheet] && (
        <Sheet onClose={() => setSheet(null)}>
          <div className="f-display text-base font-semibold mb-3" style={{ color: C.chalk }}>{session.exercises[sheet].name}</div>
          <div className="f-body text-xs mb-2" style={{ color: C.dim }}>Как прошло</div>
          <TagPicker tags={session.exercises[sheet].tags} onToggle={(id) => toggleTag(sheet, id)} />
          {/* Долгое нажатие есть не у всех — кому оно не даётся, переставит
              кнопками. То же решение, что и в редакторе дней. */}
          <div className="f-body text-xs mt-4 mb-2" style={{ color: C.dim }}>Порядок в тренировке</div>
          <div className="flex gap-2">
            <button onClick={() => { moveExercise(sheet, sheet - 1); setSheet(sheet - 1); }} disabled={sheet === 0}
              aria-label="Переместить упражнение выше"
              className="f-body flex-1 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              style={{ background: C.surfaceHi, color: sheet === 0 ? C.dim : C.chalk, border: `1px solid ${C.line}`, opacity: sheet === 0 ? 0.5 : 1 }}>
              <ChevronUp size={15} /> выше
            </button>
            <button onClick={() => { moveExercise(sheet, sheet + 1); setSheet(sheet + 1); }} disabled={sheet === session.exercises.length - 1}
              aria-label="Переместить упражнение ниже"
              className="f-body flex-1 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              style={{ background: C.surfaceHi, color: sheet === session.exercises.length - 1 ? C.dim : C.chalk, border: `1px solid ${C.line}`, opacity: sheet === session.exercises.length - 1 ? 0.5 : 1 }}>
              <ChevronDown size={15} /> ниже
            </button>
          </div>

          <button onClick={() => { const n = session.exercises[sheet].name; setSheet(null); setInfo(n); }}
            className="f-body w-full mt-2 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
            style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            <Info size={15} /> Техника и замены
          </button>
          <ConfirmButton onConfirm={() => { rmExercise(sheet); setSheet(null); }} question="Точно убрать?"
            className="f-body w-full mt-2 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
            style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}>
            <Trash2 size={15} /> Убрать из тренировки
          </ConfirmButton>
          <button onClick={() => setSheet(null)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}

      {adding && (
        <ExercisePicker
          title="Добавить в тренировку"
          conditions={conditions}
          gear={gear}
          has={(n) => session.exercises.some((e) => e.name === n)}
          onPick={addExercise}
          onClose={() => setAdding(false)}
        />
      )}

      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <div className="f-display text-base font-semibold mb-3" style={{ color: C.chalk }}>Тренировка</div>
          <button onClick={() => finish()} className="f-body w-full rounded-xl py-3 text-sm font-medium mb-2 flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => { togglePause(); setMenu(false); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            {session.paused ? <><Play size={15} /> Продолжить</> : <><Pause size={15} /> Пауза</>}
          </button>
          <div className="f-body text-xs mb-1 mt-3" style={{ color: C.dim }}>Прервать — тренировка не сохранится в журнал.</div>
          <ConfirmButton onConfirm={() => { setSession(null); setMenu(false); }} question="Тренировка не сохранится" className="f-body w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Прервать без сохранения</ConfirmButton>
          <button onClick={() => setMenu(false)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}
      {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} conditions={conditions} gear={gear} />}
    </div>
  );
}

/* ============ CATALOG / DAYS ============ */
/* Мой инвентарь.

   Смысл не в том, чтобы спрятать упражнения, а в том, чтобы не предлагать
   человеку то, чего он не может сделать: ни в каталоге, ни при сборе
   тренировки, ни — что важнее всего — в заменах при травме. Предложить
   вместо жима гантелями «жим в Смите» тому, у кого дома одни гантели, —
   бесполезный совет.

   Пустой набор означает «всё есть»: пока инвентарь не трогали, приложение
   ведёт себя как раньше. */
/* flush — карточка без собственной рамки: она встраивается строкой в общий
   блок настроек подбора. Отдельной карточкой инвентарь выглядел ровно как
   тренировочный день и потому читался как ещё один день. */
function GearCard({ gear, setGear, flush }) {
  const [open, setOpen] = useState(false);
  const on = (id) => !gear.length || gear.includes(id);
  const toggle = (id) => {
    const cur = gear.length ? gear : GEAR.map((g) => g.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    /* Выключили всё — значит фильтровать нечем, возвращаемся к «всё есть». */
    setGear(next.length === GEAR.length || !next.length ? [] : next);
  };
  const count = Object.keys(EXDB).filter((n) => fitsGear(n, gear)).length;

  return (
    <div className={flush ? "overflow-hidden" : "rounded-xl mb-3 overflow-hidden"}
      style={flush ? null : { background: C.surface, border: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2.5 px-3.5 py-3">
        {flush && <Dumbbell size={15} color={C.dim} className="shrink-0" />}
        <span className="min-w-0 text-left flex-1">
          <span className="f-display text-sm font-semibold block" style={{ color: C.chalk }}>Мой инвентарь</span>
          <span className="f-body text-2xs block" style={{ color: C.dim }}>
            {gear.length ? `${gear.length} из ${GEAR.length} — доступно ${count} ${plural(count, "упражнение", "упражнения", "упражнений")}` : "всё оборудование зала"}
          </span>
        </span>
        {open ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
      </button>
      {open && (
        <div className="px-3.5 pb-3.5">
          <div className="f-body text-xs mb-2" style={{ color: C.dim }}>
            Упражнения на том, чего нет, не будут предлагаться — ни в каталоге,
            ни при сборе тренировки, ни в заменах при травме.
          </div>
          <div className="space-y-1.5">
            {GEAR.map((g) => {
              const has = on(g.id);
              const n = Object.keys(EXDB).filter((x) => EXDB[x].eq === g.id).length;
              return (
                <button key={g.id} onClick={() => toggle(g.id)} aria-pressed={has}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left"
                  style={{ background: C.surfaceHi, border: `1px solid ${has ? C.moss : C.line}` }}>
                  <span className="w-6 h-6 rounded flex items-center justify-center shrink-0"
                    style={{ background: has ? C.moss : "transparent", border: `1px solid ${has ? C.moss : C.line}` }}>
                    {has && <Check size={15} color={C.chalk} />}
                  </span>
                  <span className="f-body text-sm flex-1 min-w-0" style={{ color: has ? C.chalk : C.dim }}>{g.label}</span>
                  <span className="f-num text-2xs shrink-0" style={{ color: C.dim }}>{n}</span>
                </button>
              );
            })}
          </div>
          <div className="f-body text-xs mt-3 mb-1.5" style={{ color: C.dim }}>Готовые наборы</div>
          <div className="flex flex-wrap gap-1.5">
            {GEAR_PRESETS.map((pr) => (
              <button key={pr.id} onClick={() => setGear(pr.id === "all" ? [] : pr.gear)}
                className="f-body text-xs rounded-full px-3"
                style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
                {pr.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Catalog({ days, onAddToDay, conditions, gear, setGear }) {
  const [q, setQ] = useState("");
  const [openG, setOpenG] = useState(null);
  const [openM, setOpenM] = useState(null);
  const [info, setInfo] = useState(null);

  const fits = useCallback((n) => fitsGear(n, gear), [gear]);
  const avail = useMemo(() => Object.keys(EXDB).filter(fits), [fits]);
  const found = q.trim().length > 1
    ? avail.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()) || EXDB[n].m.toLowerCase().includes(q.trim().toLowerCase()))
    : null;

  return (
    <div>
      <GearCard gear={gear} setGear={setGear} />
      <div className="relative mb-3">
        <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск среди ${avail.length} упражнений…`} aria-label="Поиск по базе упражнений"
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
            const muscles = g.muscles.map((m) => ({ ...m, list: m.list.filter(fits) })).filter((m) => m.list.length);
            if (!muscles.length) return null;
            const count = muscles.reduce((s, m) => s + m.list.length, 0);
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
                    {muscles.map((m) => {
                      const mo = openM === m.name;
                      return (
                        <div key={m.name} className="rounded-lg overflow-hidden" style={{ background: C.surfaceHi }}>
                          <button onClick={() => setOpenM(mo ? null : m.name)} className="w-full flex items-center justify-between px-3 py-2">
                            <span className="f-body text-xs font-medium" style={{ color: mo ? C.red : C.chalk }}>{m.name}</span>
                            <span className="f-num text-2xs" style={{ color: C.dim }}>{m.list.length}</span>
                          </button>
                          {mo && (
                            <div className="pb-1">
                              {byMove(m.list).map((grp) => (
                                <div key={grp.move}>
                                  {byMove(m.list).length > 1 && (
                                    <div className="f-body text-2xs px-3 pt-2 pb-0.5" style={{ color: C.dim, borderTop: `1px solid ${C.line}` }}>{grp.move}</div>
                                  )}
                                  {grp.list.map((n) => (
                                    <button key={n} onClick={() => setInfo(n)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                                      <span className="f-body text-sm min-w-0" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
                                      <span className="f-body text-2xs shrink-0" style={{ color: C.dim }}>{EXDB[n].eq}</span>
                                    </button>
                                  ))}
                                </div>
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
      {info && <ExerciseInfo name={info} onClose={() => setInfo(null)} days={days} onAddToDay={onAddToDay} conditions={conditions} gear={gear} />}
    </div>
  );
}

function DaysEditor({ days, setDays, conditions, gear }) {
  const [open, setOpen] = useState(null);
  const [pickFor, setPickFor] = useState(null);
  /* Какое упражнение меняем: {день, название}. */
  const [swapFor, setSwapFor] = useState(null);
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
  /* Замена встаёт на место старого упражнения, а не в конец: порядок в дне
     осмысленный — тяжёлое базовое впереди, добивка после. */
  const swapEx = (id, from, to) => setDays(days.map((d) => (d.id !== id ? d
    : { ...d, exercises: d.exercises.includes(to) ? d.exercises.filter((x) => x !== from) : d.exercises.map((x) => (x === from ? to : x)) })));
  const delDay = (id) => setDays(days.filter((d) => d.id !== id));
  /* Создать день и сразу предложить наполнить его: пустой день никому
     не нужен сам по себе, а лишнее нажатие «добавить упражнение» после
     «новый день» — чистая формальность. */
  const newDay = () => {
    const id = uid();
    setDays([...days, { id, name: "Новый день", exercises: [] }]);
    setOpen(id);
    setPickFor(id);
  };
  /* Сплит добавляем уже подогнанным под инвентарь: смысл в порядке движений,
     а каким снарядом их делать — вопрос второй. Что заменилось, видно
     на карточке до нажатия. */
  const fitted = useMemo(
    () => Object.entries(PRESETS)
      .map(([k, p]) => ({ k, p, fit: adaptPreset(p, gear) }))
      .sort(byFit),
    [gear],
  );
  const applyPreset = (key) => {
    const { fit } = fitted.find((x) => x.k === key);
    setDays([...days, ...fit.days.map((d) => ({ id: uid(), name: d.name, exercises: d.ex }))]);
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
                    <span>{d.exercises.length} {plural(d.exercises.length, "упражнение", "упражнения", "упражнений")}</span>
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
                        {/* Нажатие по названию предлагает замену на похожее:
                            собрать день из того, что есть, — половина работы,
                            и ради неё не должно приходиться помнить, каким
                            движением заменяется тяга блока. */}
                        <button onClick={() => setSwapFor({ day: d.id, name: n })} className="flex-1 min-w-0 py-1 text-left">
                          <div className="f-body text-xs" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                          {EXDB[n] && <div className="f-body text-2xs" style={{ color: C.dim }}>{EXDB[n].m} · {EXDB[n].eq}</div>}
                        </button>
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

      {/* Замена на похожее. Список тот же, из которого приложение собирает
          автозамену под инвентарь, — только выбирает человек. Недоступное
          по инвентарю не прячем: оно внизу и притушено, потому что «у меня
          этого нет» и «этого не бывает» — разные вещи. */}
      {swapFor && (
        <SwapSheet
          name={swapFor.name} gear={gear} conditions={conditions}
          onClose={() => setSwapFor(null)}
          onPick={(to) => { swapEx(swapFor.day, swapFor.name, to); setSwapFor(null); }}
        />
      )}

      {pickFor && (
        <ExercisePicker
          title={`Добавить в «${days.find((d) => d.id === pickFor)?.name}»`}
          conditions={conditions}
          gear={gear}
          has={(n) => !!days.find((d) => d.id === pickFor)?.exercises.includes(n)}
          onPick={(n) => addEx(pickFor, n)}
          onClose={() => setPickFor(null)}
        />
      )}

      {presets && (
        <Sheet onClose={() => setPresets(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Готовые сплиты</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
            Дни добавятся к существующим — старые не удалятся.
            {gear.length > 0 && " Упражнения подставятся под твой инвентарь."}
          </div>
          <div className="space-y-2">
            {fitted.map(({ k, p, fit }) => {
              const poor = fit.verdict === "poor";
              return (
                <button key={k} onClick={() => applyPreset(k)} className="w-full text-left rounded-xl p-3"
                  style={{ background: C.surfaceHi, border: `1px solid ${poor ? C.line : fit.verdict === "adapted" ? C.blue : C.moss}`, opacity: poor ? 0.55 : 1 }}>
                  <div className="f-display text-sm font-semibold" style={{ color: C.chalk }}>{p.name}</div>
                  <div className="f-body text-xs mb-1.5" style={{ color: C.dim }}>{p.desc}</div>
                  <div className="f-body text-2xs" style={{ color: C.blueText }}>{fit.days.map((d) => d.name.split(" (")[0]).join(" · ")}</div>
                  {/* Приговор по инвентарю. Молчим только когда сплит подходит
                      как есть: лишняя строка на каждой карточке — шум. */}
                  {gear.length > 0 && fit.verdict !== "native" && (
                    <div className="f-body text-2xs mt-1.5" style={{ color: poor ? C.mustard : C.dim }}>
                      {/* Мышцы перечисляем после двоеточия: склонять их
                          по падежам в коде не выйдет, а «без средняя дельта»
                          читается как поломка. */}
                      {poor
                        ? `Не для этого инвентаря — нечем нагрузить: ${fit.lostMuscles.join(", ").toLowerCase()}`
                        : `Подогнан под инвентарь: ${fit.swaps} ${plural(fit.swaps, "замена", "замены", "замен")}` +
                          (fit.lostMuscles.length ? ` · без нагрузки: ${fit.lostMuscles.join(", ").toLowerCase()}` : "")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={() => setPresets(false)} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}
    </div>
  );
}

/* «План»: что я буду делать и с чем. Раньше называлось «База» и открывалось
   на каталоге упражнений — то есть на энциклопедии, а своя программа была
   спрятана за ещё одно нажатие. Теперь наоборот: первым идёт то, ради чего
   сюда заходят каждую неделю. */
function BaseTab({ days, setDays, initialView, conditions, gear, setGear, profile, setProfile }) {
  const [view, setView] = useState(initialView || "days");
  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);
  const addToDay = (id, n) => setDays(days.map((d) => (d.id === id && !d.exercises.includes(n) ? { ...d, exercises: [...d.exercises, n] } : d)));
  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${C.line}` }}>
        {[["days", "Мои дни"], ["catalog", "Упражнения"]].map(([id, l]) => (
          <button key={id} onClick={() => setView(id)} className="f-body flex-1 text-xs py-2" style={{ background: view === id ? C.red : C.surface, color: view === id ? C.chalk : C.dim }}>{l}</button>
        ))}
      </div>
      {view === "catalog"
        ? <Catalog days={days} onAddToDay={addToDay} conditions={conditions} gear={gear} setGear={setGear} />
        : (
          <>
            <DaysEditor days={days} setDays={setDays} conditions={conditions} gear={gear} />
            {/* Инвентарь и травмы — не дни, а условия, при которых дни
                собираются. Поэтому у них другая грамматика: общий блок под
                своим заголовком, со значком у каждой строки и без рамки
                вокруг каждой. Двумя отдельными карточками они выглядели
                в точности как тренировочные дни и с ними и путались. */}
            <div className="f-body text-xs uppercase tracking-wide mt-5 mb-1.5" style={{ color: C.dim }}>
              Что учитывать при подборе
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
              <GearCard gear={gear} setGear={setGear} flush />
              <div style={{ borderTop: `1px solid ${C.line}` }}>
                <ConditionsCard profile={profile} setProfile={setProfile} flush />
              </div>
            </div>
          </>
        )}
    </div>
  );
}

/* ============ JOURNAL ============ */
/**
 * Форма тренировки: правка записанной и запись задним числом — одно и то же.
 * Разница только в заголовке и в том, куда уходит результат.
 */
function EditWorkout({ workout, onSave, onClose, workouts = [], conditions = [], isNew = false, bodyAt, gear }) {
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
  const toggleTag = (i, id) => setDraft((d) => {
    const ex = [...d.exercises];
    const cur = ex[i].tags || [];
    ex[i] = { ...ex[i], tags: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    return { ...d, exercises: ex };
  });
  const addExercise = (n) =>
    setDraft((d) => (d.exercises.some((e) => e.name === n) ? d : { ...d, exercises: [...d.exercises, draftExercise(n, workouts)] }));

  /* пустые поля и подходы отбрасываем, иначе в статистику попадут нули */
  const save = () => {
    const exercises = draft.exercises
      .map((e) => ({
        ...e,
        sets: e.sets
          .filter((s) => s.reps !== "" && s.reps != null && (e.bodyweight || (s.weight !== "" && s.weight != null)))
          .map((s) => ({ reps: +s.reps, weight: setWeight(e, s), sec: +s.sec > 0 ? +s.sec : undefined })),
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
              <div className="f-body text-sm min-w-0" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}{ex.pair && <PairTag />}</div>
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
            <TagBlock tags={ex.tags} onToggle={(id) => toggleTag(i, id)} />
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
          gear={gear}
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
  /* Сумма замеров по упражнению — показывается, только если секундомер включали. */
  const loadSec = (ex) => ex.sets.reduce((n, s) => n + (+s.sec || 0), 0);
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
              <span className="min-w-0" style={{ color: C.chalk }}>
                {ex.name}{ex.uni && <UniTag />}{ex.pair && <PairTag />}
                {ex.tags?.length > 0 && <span className="f-body block text-2xs" style={{ color: ex.tags.includes("pain") ? C.redText : C.mustard }}>{tagLine(ex.tags)}</span>}
              </span>
              <span className="f-num text-right shrink-0" style={{ color: C.dim }}>
                {ex.sets.map((s) => (ex.bodyweight ? (+s.weight ? `${s.reps}+${s.weight}` : s.reps) : `${s.reps}×${s.weight}`)).join(" · ")}
                {/* Своим весом непонятно, откуда взялись килограммы в тоннаже —
                    подписываем, во что оценён один повтор. */}
                {ex.bodyweight && bwKg(ex.name, body) && (
                  <span className="f-body block text-2xs">
                    свой вес ~{bwKg(ex.name, body)} кг{addedKg(ex) ? ` + ${addedKg(ex)} кг` : ""}
                  </span>
                )}
                {loadSec(ex) > 0 && <span className="f-body block text-2xs">под нагрузкой {fmtRest(loadSec(ex))}</span>}
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

function JournalTab({ workouts, onDelete, onExport, onUpdate, onAdd, days, conditions, bodyAt, gear }) {
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
          gear={gear}
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
          gear={gear}
          isNew
          onClose={() => setCreating(null)}
          onSave={(w) => { onAdd(w); setCreating(null); }}
        />
      )}
    </div>
  );
}

/* ============ PROGRESS ============ */
/* ============ ГРАФИКИ ============ */

const RANGES = [{ id: 30, label: "30 дн" }, { id: 90, label: "90 дн" }, { id: 3650, label: "всё" }];

const STATE = {
  down: { label: "просело", color: C.redText },
  flat: { label: "стоит", color: C.mustard },
  idle: { label: "давно не делал", color: C.dim },
  up: { label: "растёт", color: C.mossText },
  once: { label: "был один раз", color: C.dim },
};

/** Крошечный график в строке: форма важнее значений, подписи не нужны. */
function Spark({ points, color, w = 54, h = 20 }) {
  if (!points || points.length < 2) return <span style={{ width: w }} className="shrink-0" />;
  const vs = points.map((p) => p.v);
  const min = Math.min(...vs);
  const span = Math.max(...vs) - min || 1;
  const step = w / (points.length - 1);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - 2 - ((p.v - min) / span) * (h - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Плитка итога с изменением к прошлому такому же периоду. */
function StatTile({ label, value, sub, delta, better = 1 }) {
  const sign = delta > 0 ? "+" : "";
  const color = !delta ? C.dim : delta * better > 0 ? C.mossText : C.redText;
  return (
    <div className="flex-1 rounded-xl px-3 py-2.5 min-w-0" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <div className="f-num text-lg font-semibold truncate" style={{ color: C.chalk }}>{value}</div>
      <div className="f-body text-2xs uppercase tracking-wide truncate" style={{ color: C.dim }}>{label}</div>
      {delta != null && (
        <div className="f-num text-2xs mt-0.5" style={{ color }}>{delta ? `${sign}${delta}` : "без изменений"}{sub && delta ? ` ${sub}` : ""}</div>
      )}
    </div>
  );
}

/** Строка упражнения: состояние, текущий вес, изменение и форма кривой. */
function MoverRow({ row, open, onToggle }) {
  const st = STATE[row.state];
  const chart = useMemo(
    () => row.points.map((p) => ({ date: fmtDate(p.date), v: p.v, tonnage: p.tonnage })),
    [row.points],
  );
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <button onClick={onToggle} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="f-body text-sm block truncate" style={{ color: C.chalk }}>{row.name}</span>
          <span className="f-body text-2xs block" style={{ color: st.color }}>
            {st.label}{row.state === "idle" ? ` · ${row.move.toLowerCase()}, ${row.moveIdle} дн` : row.delta ? ` · ${row.delta > 0 ? "+" : ""}${row.delta} ${row.unit}` : ""}
          </span>
        </span>
        <Spark points={row.points.slice(-8)} color={st.color} />
        <span className="f-num text-sm shrink-0" style={{ color: C.chalk }}>{row.value} {row.unit}</span>
      </button>
      {open && (
        <div className="px-2 pb-2">
          <ChartFrame height={180}>
            <LineByDate data={chart} dataKey="v" name={`рабочий вес, ${row.unit}`} height={180} />
          </ChartFrame>
          <div className="f-body text-2xs px-1.5 pb-1" style={{ color: C.dim }}>
            {row.muscle} · {row.move.toLowerCase()} · подходов за период: {row.times}
          </div>
        </div>
      )}
    </div>
  );
}

/** Подходы по неделям, стопкой по группам мышц. */
function VolumeBars({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  const used = [...new Set(weeks.flatMap((w) => Object.keys(w.byGroup)))];
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height: 120 }}>
        {weeks.map((w, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full gap-px" title={`${w.total} подходов`}>
            {Object.entries(w.byGroup).map(([g, n]) => (
              <div key={g} style={{ height: `${(n / max) * 100}%`, background: GROUP_COLOR[g] || C.dim, minHeight: n ? 2 : 0 }} />
            ))}
            {!w.total && <div style={{ height: 2, background: C.line }} />}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {weeks.map((w, i) => (
          <div key={i} className="f-num text-2xs flex-1 text-center" style={{ color: w.total ? C.dim : C.line }}>{w.total || "—"}</div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {used.map((g) => (
          <span key={g} className="f-body text-2xs flex items-center gap-1" style={{ color: C.dim }}>
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GROUP_COLOR[g] || C.dim }} /> {g}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Две тренировки одного дня рядом: что выросло, что просело, что пропало.

    Первая версия вываливала всё сразу: шесть строк итогов и по две строки
    на каждое упражнение — под тридцать рядов цифр, из которых половина
    говорила «так же». Читать это невозможно, и на приложение оно не похоже.

    Теперь наоборот: по умолчанию пусто, выбор можно снять, а показывается
    только то, что изменилось. Полный протокол с подходами остаётся, но
    за кнопкой — он нужен, когда уже понял, куда смотреть. */
function CompareCard({ workouts, metrics, bmr, restOverrides, bodyAt }) {
  const days = useMemo(() => {
    const by = new Map();
    [...workouts].sort((a, b) => b.date.localeCompare(a.date)).forEach((w) => {
      if (!by.has(w.dayLabel)) by.set(w.dayLabel, []);
      by.get(w.dayLabel).push(w);
    });
    return [...by.entries()].filter(([, list]) => list.length > 1);
  }, [workouts]);

  const [day, setDay] = useState("");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [full, setFull] = useState(false);

  const list = days.find(([d]) => d === day)?.[1] || [];
  const A = list.find((w) => w.id === aId);
  const B = list.find((w) => w.id === bId);

  const diff = useMemo(
    () => (A && B && A !== B ? compare(A, B, { metrics, bmr, restOverrides, bodyAt }) : null),
    [A, B, metrics, bmr, restOverrides, bodyAt],
  );

  if (!days.length) {
    return (
      <div className="f-body text-xs" style={{ color: C.dim }}>
        Сравнивать пока нечего: нужен один и тот же день, проведённый дважды.
      </div>
    );
  }

  const pickDay = (v) => { setDay(v); setAId(""); setBId(""); setFull(false); };
  const sel = "f-body rounded-lg px-3 py-2.5 text-sm";
  const selStyle = { background: C.surface, color: C.chalk, border: `1px solid ${C.line}` };

  /* Итог одной строкой: цифра и куда она сдвинулась. Шесть таких строк
     вместо таблицы на полэкрана. */
  const Row = ({ k, a, b, unit = "", better = 1 }) => {
    if (a == null && b == null) return null;
    const d = a != null && b != null ? r1(b - a) : null;
    return (
      <div className="flex items-baseline justify-between gap-2 py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
        <span className="f-body text-xs" style={{ color: C.dim }}>{k}</span>
        <span className="f-num text-sm" style={{ color: C.chalk }}>
          {b ?? "—"}{unit ? ` ${unit}` : ""}
          {d ? <span className="text-2xs" style={{ color: d * better > 0 ? C.mossText : C.redText }}> {d > 0 ? "+" : ""}{d}</span> : null}
        </span>
      </div>
    );
  };

  /* Сгруппированные изменения: одна строка на категорию вместо строки
     на упражнение. «Так же» не показываем вовсе — это и есть шум. */
  const Group = ({ label, items, color }) => {
    if (!items.length) return null;
    return (
      <div className="py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="f-body text-2xs uppercase tracking-wide mb-0.5" style={{ color }}>{label}</div>
        <div className="f-body text-xs leading-relaxed" style={{ color: C.chalk }}>{items.join(" · ")}</div>
      </div>
    );
  };

  const short = (n) => n.replace(/\s*\(.*?\)/g, "");
  const grew = diff?.rows.filter((r) => r.kind === "both" && (r.dw > 0 || (!r.dw && r.dr > 0)))
    .map((r) => `${short(r.name)} ${r.dw ? `+${r.dw} ${r.unit}` : `+${r.dr} повт`}`) || [];
  const fell = diff?.rows.filter((r) => r.kind === "both" && (r.dw < 0 || (!r.dw && r.dr < 0)))
    .map((r) => `${short(r.name)} ${r.dw ? `${r.dw} ${r.unit}` : `${r.dr} повт`}`) || [];
  const same = diff?.rows.filter((r) => r.kind === "both" && !r.dw && !r.dr).length || 0;

  return (
    <div>
      <select value={day} onChange={(e) => pickDay(e.target.value)} aria-label="День для сравнения"
        className={`${sel} w-full`} style={selStyle}>
        <option value="">Выбери день…</option>
        {days.map(([d, l]) => <option key={d} value={d}>{d} — {l.length} тренировок</option>)}
      </select>

      {day && (
        <div className="flex gap-2 mt-2">
          <select value={aId} onChange={(e) => setAId(e.target.value)} aria-label="С чем сравнить"
            className={`${sel} flex-1 min-w-0`} style={selStyle}>
            <option value="">было…</option>
            {list.map((w) => <option key={w.id} value={w.id}>{fmtDate(w.date)}</option>)}
          </select>
          <span className="f-body text-xs self-center" style={{ color: C.dim }}>→</span>
          <select value={bId} onChange={(e) => setBId(e.target.value)} aria-label="Что сравнить"
            className={`${sel} flex-1 min-w-0`} style={selStyle}>
            <option value="">стало…</option>
            {list.map((w) => <option key={w.id} value={w.id}>{fmtDate(w.date)}</option>)}
          </select>
        </div>
      )}

      {day && !diff && (
        <div className="f-body text-xs mt-2" style={{ color: C.dim }}>
          {A && B ? "Это одна и та же тренировка — выбери две разные." : "Выбери две даты."}
        </div>
      )}

      {diff && (
        <div className="mt-3">
          <Row k="Подходов" a={diff.a.sets} b={diff.b.sets} />
          <Row k="Тоннаж" a={diff.a.tonnage} b={diff.b.tonnage} unit="кг" />
          <Row k="Длительность" a={diff.a.minutes} b={diff.b.minutes} unit="мин" />
          <Row k="Сверх покоя" a={diff.a.kcal} b={diff.b.kcal} unit="ккал" />

          <div className="mt-2">
            <Group label="Выросло" items={grew} color={C.mossText} />
            <Group label="Просело" items={fell} color={C.redText} />
            <Group label="Новое" items={diff.rows.filter((r) => r.kind === "new").map((r) => short(r.name))} color={C.blueText} />
            <Group label="Не делал" items={diff.rows.filter((r) => r.kind === "gone").map((r) => short(r.name))} color={C.dim} />
            {same > 0 && (
              <div className="f-body text-2xs pt-1.5" style={{ color: C.dim, borderTop: `1px solid ${C.line}` }}>
                без изменений: {same}
              </div>
            )}
          </div>

          <button onClick={() => setFull((v) => !v)} className="f-body w-full mt-2 py-2.5 text-xs" style={{ color: C.blueText }}>
            {full ? "Свернуть подробности" : "Показать подходы"}
          </button>

          {full && (
            <div>
              <Row k="Под нагрузкой" a={diff.a.load} b={diff.b.load} unit="мин" />
              <Row k="Вес тела" a={diff.a.body} b={diff.b.body} unit="кг" better={0} />
              {diff.rows.map((r) => (
                <div key={r.name} className="py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="f-body text-xs" style={{ color: r.kind === "gone" ? C.dim : C.chalk }}>{r.name}</div>
                  <div className="f-num text-2xs" style={{ color: C.dim }}>{r.was || "—"}</div>
                  <div className="f-num text-2xs" style={{ color: r.kind === "gone" ? C.dim : C.chalk }}>{r.now || "—"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressTab({ workouts, bodyAt, metrics, bmr, restOverrides }) {
  const [range, setRange] = useState(90);
  const [openEx, setOpenEx] = useState(null);
  const [allMovers, setAllMovers] = useState(false);

  const sums = useMemo(() => summary(workouts, range, bodyAt), [workouts, range, bodyAt]);
  const rows = useMemo(() => movers(workouts, range, bodyAt), [workouts, range, bodyAt]);
  const weeks = useMemo(() => weeklyVolume(workouts, 8), [workouts]);
  const week = useMemo(() => muscleWeek(workouts), [workouts]);

  /* Рекорды двух родов, потому что одним числом их не выразить.

     Раньше считался только самый тяжёлый вес — и девятнадцать повторений
     с гантелями по 24 не попадали никуда, хотя двадцать четыре килограмма
     человек поднимал и раньше, а девятнадцать раз — впервые. Формулы 1ПМ
     тут тоже не спасают: выше пятнадцати повторений они врут, и подход
     в них просто не входит.

     Поэтому храним оба: самый тяжёлый подход и подход с наибольшим числом
     повторений. Совпали — показываем одну строку. */
  const records = useMemo(() => {
    const map = {};
    [...workouts].sort((a, b) => a.date.localeCompare(b.date)).forEach((w) => {
      w.exercises.forEach((ex) => {
        const bw = ex.bodyweight && !addedKg(ex);
        /* лучший подход по весу, а при равном весе — по повторениям */
        let heavy = null;
        let most = null;
        ex.sets.forEach((set) => {
          const kg = bw ? 0 : +set.weight || 0;
          const reps = +set.reps || 0;
          if (!reps) return;
          if (!heavy || kg > heavy.kg || (kg === heavy.kg && reps > heavy.reps)) heavy = { kg, reps };
          if (!most || reps > most.reps || (reps === most.reps && kg > most.kg)) most = { kg, reps };
        });
        if (!heavy) return;
        const cur = map[ex.name] || (map[ex.name] = { name: ex.name, bw });
        if (!cur.heavy || heavy.kg > cur.heavy.kg || (heavy.kg === cur.heavy.kg && heavy.reps > cur.heavy.reps)) {
          cur.heavy = { ...heavy, date: w.date, rm: est1RM(ex) };
        }
        if (!cur.most || most.reps > cur.most.reps || (most.reps === cur.most.reps && most.kg > cur.most.kg)) {
          cur.most = { ...most, date: w.date };
        }
      });
    });
    return Object.values(map)
      .map((r) => ({
        ...r,
        /* «больше всего повторений» показываем, только когда это другой
           подход: иначе строка дублирует сама себя */
        same: r.heavy.kg === r.most.kg && r.heavy.reps === r.most.reps,
      }))
      .sort((a, b) => (b.heavy.date > b.most.date ? b.heavy.date : b.most.date)
        .localeCompare(a.heavy.date > a.most.date ? a.heavy.date : a.most.date));
  }, [workouts]);

  if (!workouts.length) return <div className="f-body text-sm text-center py-20 px-4" style={{ color: C.dim }}>Графики появятся после первой записанной тренировки.</div>;

  const shown = allMovers ? rows : rows.slice(0, 6);
  const avgMin = sums.now.avgMin;
  const avgMinBefore = sums.before.avgMin;

  return (
    <div className="px-4 pt-4 pb-8 space-y-5">
      <div className="flex gap-1.5">
        {RANGES.map((r) => (
          <button key={r.id} onClick={() => setRange(r.id)} className="f-body rounded-full px-3 py-1 text-xs"
            style={{ background: range === r.id ? C.surfaceHi : "transparent", color: range === r.id ? C.chalk : C.dim, border: `1px solid ${C.line}` }}>{r.label}</button>
        ))}
        <span className="f-body text-2xs self-center ml-auto" style={{ color: C.dim }}>к прошлому такому же периоду</span>
      </div>

      <div className="flex gap-2">
        <StatTile label="тренировок" value={sums.now.workouts} delta={sums.now.workouts - sums.before.workouts} />
        <StatTile label="подходов" value={sums.now.sets} delta={sums.now.sets - sums.before.sets} />
        <StatTile label="мин в среднем" value={avgMin || "—"} delta={avgMin && avgMinBefore ? avgMin - avgMinBefore : null} />
      </div>

      <div>
        <div className="f-display text-sm font-semibold mb-1" style={{ color: C.chalk }}>Что растёт, что стоит</div>
        <div className="f-body text-xs mb-2" style={{ color: C.dim }}>
          Считается тоннаж за тренировку, а не верхний вес: снизил вес ради
          объёма — работы стало больше, и это видно. Сверху то, что требует
          решения. Нажатие раскрывает график упражнения.
        </div>
        <div className="space-y-1.5">
          {!rows.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Нет данных за период.</div>}
          {shown.map((r) => (
            <MoverRow key={r.name} row={r} open={openEx === r.name} onToggle={() => setOpenEx(openEx === r.name ? null : r.name)} />
          ))}
        </div>
        {rows.length > 6 && (
          <button onClick={() => setAllMovers((v) => !v)} className="f-body w-full mt-2 py-2.5 text-xs" style={{ color: C.blueText }}>
            {allMovers ? "Свернуть" : `Показать все — ещё ${rows.length - 6}`}
          </button>
        )}
      </div>

      <div>
        <div className="f-display text-sm font-semibold mb-1" style={{ color: C.chalk }}>Объём по неделям</div>
        <div className="f-body text-xs mb-2.5" style={{ color: C.dim }}>
          Рабочие подходы, а не тоннаж: подход сравним между упражнениями, килограмм — нет.
          Скручивания на сотню повторений иначе перевешивают присед.
        </div>
        <VolumeBars weeks={weeks} />
      </div>

      <div>
        <div className="f-display text-sm font-semibold mb-1" style={{ color: C.chalk }}>Неделя по мышцам</div>
        <div className="f-body text-xs mb-2.5" style={{ color: C.dim }}>Ориентир для роста — 10–20 подходов на мышцу в неделю.</div>
        {(week.push > 0 || week.pull > 0) && (
          <div className="mb-3">
            <div className="flex justify-between f-body text-xs mb-1.5">
              <span style={{ color: C.chalk }}>Жимы / тяги</span>
              <span className="f-num" style={{ color: week.pull >= week.push ? C.moss : C.mustard }}>{week.push} / {week.pull}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden" style={{ background: C.line }}>
              <div style={{ width: `${(week.push / (week.push + week.pull)) * 100}%`, background: C.red }} />
              <div style={{ width: `${(week.pull / (week.push + week.pull)) * 100}%`, background: C.blue }} />
            </div>
            <div className="f-body text-2xs mt-1.5" style={{ color: C.dim }}>{week.pull >= week.push ? "Тяг не меньше жимов — так плечевой сустав держится ровно." : "Жимов больше, чем тяг. Перекос в жимы стягивает плечи вперёд; тяг стоит делать не меньше."}</div>
          </div>
        )}
        {!week.rows.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Нет тренировок за последние две недели.</div>}
        <div className="space-y-2.5">
          {week.rows.map((r) => (
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
      </div>

      <div>
        <div className="f-display text-sm font-semibold mb-1" style={{ color: C.chalk }}>Сравнить тренировки</div>
        <div className="f-body text-xs mb-2.5" style={{ color: C.dim }}>Один и тот же день в двух разных числах — что изменилось.</div>
        <CompareCard workouts={workouts} metrics={metrics} bmr={bmr} restOverrides={restOverrides} bodyAt={bodyAt} />
      </div>

      <div>
        <div className="f-display text-sm font-semibold mb-2" style={{ color: C.chalk }}>Рекорды</div>
        <div className="space-y-1.5">
          {!records.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Рекордов пока нет.</div>}
          {records.slice(0, 12).map((r) => (
            <div key={r.name} className="rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="f-body text-xs truncate" style={{ color: C.chalk }}>{r.name}</div>
              <div className="f-body text-2xs mb-1.5" style={{ color: C.dim }}>{EXDB[r.name]?.m || "своё упражнение"}</div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="f-body text-2xs" style={{ color: C.dim }}>{r.bw ? "больше всего повторений" : "тяжелее всего"}</span>
                <span className="text-right shrink-0">
                  <span className="f-num text-sm font-semibold" style={{ color: C.mustard }}>
                    {r.bw ? `${r.heavy.reps} повт` : `${r.heavy.reps}×${r.heavy.kg}`}
                  </span>
                  <span className="f-num text-2xs ml-2" style={{ color: C.dim }}>
                    {fmtDate(r.heavy.date)}{!r.bw && r.heavy.rm ? ` · 1ПМ ~${r.heavy.rm}` : ""}
                  </span>
                </span>
              </div>
              {/* Повторения — отдельный рекорд, а не второй сорт: девятнадцать
                  раз с рабочим весом формулы 1ПМ вообще не видят. */}
              {!r.bw && !r.same && (
                <div className="flex items-baseline justify-between gap-3 mt-0.5">
                  <span className="f-body text-2xs" style={{ color: C.dim }}>больше всего повторений</span>
                  <span className="text-right shrink-0">
                    <span className="f-num text-sm font-semibold" style={{ color: C.mossText }}>{r.most.reps}×{r.most.kg}</span>
                    <span className="f-num text-2xs ml-2" style={{ color: C.dim }}>{fmtDate(r.most.date)}</span>
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
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
function ConditionsCard({ profile, setProfile, flush }) {
  const [open, setOpen] = useState(false);
  const picked = profile.conditions || [];
  const toggle = (id) =>
    setProfile({ ...profile, conditions: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id] });

  return (
    <div className={flush ? "px-3.5 py-3" : "rounded-xl p-3.5"}
      style={flush ? null : { background: C.surface, border: `1px solid ${picked.length ? C.mustard : C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2.5">
        <ShieldAlert size={15} color={picked.length ? C.mustard : C.dim} className="shrink-0" />
        <div className="min-w-0 text-left flex-1">
          <div className="f-display text-sm font-semibold" style={{ color: C.chalk }}>Травмы и ограничения</div>
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


/** Расход за конкретную тренировку. Живёт в дневнике, а не в «Теле»:
    это разбор записи, а не свойство человека. */
function WorkoutEnergyCard({ workouts, metrics, bmr, restOverrides }) {
  const [energyId, setEnergyId] = useState(null);
  const recent = useMemo(() => [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [workouts]);
  const picked = recent.find((w) => w.id === energyId) || recent[0] || null;
  const energy = useMemo(
    () => workoutEnergy(picked, { metrics, bmr, restOverrides }),
    [picked, metrics, bmr, restOverrides],
  );
  const met = energy ? energy.level.met.toFixed(1).replace(".", ",") : "";
  const inp = { background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` };

  return (
    <div className="rounded-xl p-3.5 mt-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <div className="f-display text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: C.chalk }}><Flame size={15} /> Расход за тренировку</div>
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
              hint={`${Math.round(energy.density * 100)}% времени — ${energy.level.label}, ${met} МЕТ · ${
                energy.measured >= 0.5
                  ? `по секундомеру подходов${energy.measured < 1 ? " (часть оценена)" : ""}`
                  : "оценка по темпу, около трёх секунд на повторение"
              }${energy.uniEstimate ? " · одной рукой считается за две стороны" : ""}${energy.tagged ? " · дроп-сеты и отказ считаются дольше" : ""}`} />
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
  );
}

/* Дневник: и записи, и итоги. Раньше это были две вкладки — «Журнал»
   и «Графики», хотя обе отвечают на один вопрос «как идёт». Сравнение при
   этом жило через экран от тренировок, которые сравнивает. */
function DiaryTab({ view, setView, workouts, onDelete, onExport, onUpdate, onAdd, days, conditions, bodyAt, gear,
                    metrics, bmr, restOverrides }) {
  return (
    <div>
      <div className="px-4 pt-4">
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {[["records", "Записи"], ["totals", "Итоги"]].map(([id, l]) => (
            <button key={id} onClick={() => setView(id)} className="f-body flex-1 text-xs py-2"
              style={{ background: view === id ? C.red : C.surface, color: view === id ? C.chalk : C.dim }}>{l}</button>
          ))}
        </div>
      </div>
      {view === "records"
        ? <JournalTab workouts={workouts} onDelete={onDelete} onExport={onExport} onUpdate={onUpdate} onAdd={onAdd} days={days} conditions={conditions} bodyAt={bodyAt} gear={gear} />
        : (
          <>
            <ProgressTab workouts={workouts} bodyAt={bodyAt} metrics={metrics} bmr={bmr} restOverrides={restOverrides} />
            <div className="px-4 pb-8 -mt-4">
              <WorkoutEnergyCard workouts={workouts} metrics={metrics} bmr={bmr} restOverrides={restOverrides} />
            </div>
          </>
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
  const bmr = useMemo(
    () => bmrOf({ lbm, bodyKg: bodyW, height: profile.height, age: profile.age, sex: profile.sex }),
    [lbm, bodyW, profile],
  );
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
  const [baseView, setBaseView] = useState(null);
  const [diaryView, setDiaryView] = useState("records");
  const [workouts, setWorkouts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [days, setDaysState] = useState([]);
  const [session, setSessionState] = useState(null);
  const [profile, setProfileState] = useState({ height: "", age: "", sex: "m", activity: "1.55", conditions: [] });
  useEffect(() => { scroller.current?.scrollTo(0, 0); }, [shownTab, session?.id]);
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
  const [pairFixed, setPairFixed] = useState(0);
  const [updating, setUpdating] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    (async () => {
      /* Записи, сделанные до правила «две гантели», считались вполовину.
         Доводим до общего знаменателя один раз и говорим об этом вслух:
         цифры в журнале поменяются, и человек должен понимать почему. */
      const { workouts: fixed, touched } = fillPairFlags((await loadKey("workouts")) || []);
      setWorkouts(fixed);
      if (touched) { saveKey("workouts", fixed); setPairFixed(touched); }
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
  const finishSession = useCallback((w) => { setWorkouts((prev) => { const next = [w, ...prev]; saveKey("workouts", next); return next; }); setSession(null); setDiaryView("records"); setTab("diary"); }, [setSession]);
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
  /* Основной обмен нужен и «Телу», и сравнению тренировок на графиках:
     без него расход считается «грязным», без вычета покоя. */
  const bmr = useMemo(() => {
    const last = [...metrics].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const kg = +last?.weight || 0;
    const bf = bodyFatNavy(last, profile);
    return bmrOf({ lbm: lbmOf(kg, bf), bodyKg: kg, height: profile.height, age: profile.age, sex: profile.sex });
  }, [metrics, profile]);

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
        const how = [ex.uni && "каждой стороной", ex.pair && "вес одной гантели"].filter(Boolean).join(", ");
        const marks = tagLine(ex.tags);
        lines.push(`- ${ex.name}${how ? ` [${how}]` : ""}: ${s}${own ? ` [свой вес ~${own} кг]` : ""}${rm ? ` (расч.1ПМ ${rm})` : ""}${marks ? ` — ${marks}` : ""}`);
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
  useEffect(() => { if (!session) { releaseAudio(); cancelRestNotice(); } }, [session]);

  /** Правки времени отдыха, сделанные прямо на тренировке */
  /* Инвентарь: что есть под рукой. Пустой набор — «всё», так приложение
     ведёт себя до того, как его настроили. */
  const gear = useMemo(() => profile.gear || [], [profile.gear]);
  const setGear = useCallback((list) => setProfile((p) => ({ ...p, gear: list })), [setProfile]);

  const restOverrides = useMemo(() => profile.restOverrides || {}, [profile.restOverrides]);
  const setRestOverride = useCallback((name, sec) => {
    setProfile((p) => ({ ...p, restOverrides: { ...(p.restOverrides || {}), [name]: sec } }));
  }, [setProfile]);
  const muted = !!profile.muted;

  /* Сигнал или музыка — решает человек, приложение только выполняет.
     По умолчанию музыка: её слышно всю тренировку, а сигнал — раз в минуту. */
  const soundSolo = !!profile.soundSolo;
  useEffect(() => { setAudioMode(soundSolo ? "solo" : "mix"); }, [soundSolo]);
  const [notifyOk, setNotifyOk] = useState(() => notifyState());

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
  /* Знакомство отдаёт всё разом: профиль, травмы, инвентарь и программу.
     Всё необязательное — пропущенный шаг просто не меняет ничего. */
  const finishSetup = (v) => {
    if (v) {
      const p = { ...profile };
      if (v.height) p.height = v.height;
      if (v.age) p.age = v.age;
      if (v.sex) p.sex = v.sex;
      if (v.conditions?.length) p.conditions = v.conditions;
      setProfile(p);
      if (+v.weight > 0) addMetric({ id: uid(), date: today(), weight: v.weight });
      if (v.gear) setGear(v.gear);
      if (v.days?.length) {
        setDays(v.days.map((d) => ({ id: uid(), name: d.name, exercises: d.ex || d.exercises || [] })));
        /* Собрал пустой день — сразу открываем его, а не оставляем гадать,
           где он теперь лежит. */
        if (v.days.length === 1 && !(v.days[0].ex || v.days[0].exercises || []).length) {
          setBaseView("days");
          setTab("plan");
        }
      }
    }
    setSetupSeen(true);
    saveKey("setup", true);
  };
  if (!setupSeen) return <SetupGate onDone={finishSetup} />;

  /* Четыре вкладки вместо пяти, и названы делами, а не хранилищами.
     «План» — что я буду делать, «Тренировка» — делаю, «Дневник» — как идёт.
     Прежние «Журнал» и «Графики» отвечали на один и тот же вопрос и потому
     съехались в один раздел. */
  const tabs = [
    { id: "session", label: "Тренировка", icon: Play },
    { id: "plan", label: "План", icon: Library },
    { id: "diary", label: "Дневник", icon: BookOpen },
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

      {/* overscrollBehavior останавливает сцепку прокрутки прямо здесь: до body
          она тогда не доходит, и «потяни вниз, чтобы обновить» не сработает
          даже если список уже в самом верху. */}
      <div ref={scroller} className="flex-1 overflow-y-auto w-full max-w-xl mx-auto" role="tabpanel" id="tabpanel"
        style={{ overscrollBehavior: "contain" }} aria-labelledby={`tab-${shownTab}`}>
        <div key={shownTab} className="tab-in">
        {shownTab === "session" && <SessionTab session={session} setSession={setSession} workouts={workouts} days={days} onFinish={finishSession} goToDays={() => { setBaseView("days"); setTab("plan"); }} conditions={conditions} restOverrides={restOverrides} setRestOverride={setRestOverride} muted={muted} bodyAt={bodyAt} gear={gear} />}
        {shownTab === "plan" && <BaseTab days={days} setDays={setDays} initialView={baseView} conditions={conditions} gear={gear} setGear={setGear} profile={profile} setProfile={setProfile} />}
        {shownTab === "diary" && <DiaryTab view={diaryView} setView={setDiaryView} workouts={workouts} onDelete={deleteWorkout} onExport={buildExport} onUpdate={updateWorkout} onAdd={addWorkout} days={days} conditions={conditions} bodyAt={bodyAt} gear={gear} metrics={metrics} bmr={bmr} restOverrides={restOverrides} />}
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
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Версия: {buildLabel()} · {installed() ? "установлено на телефон" : "открыто во вкладке браузера"}</div>
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
            {isIOS()
              ? " На iPhone это значит закрыть его из переключателя задач, а не просто свернуть."
              : isAndroid()
                ? " Это значит закрыть его из списка недавних приложений, а не просто свернуть."
                : ""}
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
              onClick={() => { primeAudio(); playRestOver(); setTimeout(() => say(audioReady() ? (soundSolo || !isIOS() ? "Не слышно? Прибавь громкость — сигнал идёт как музыка" : "Не слышно? Проверь переключатель звука сбоку телефона") : "Система не пустила звук — попробуй ещё раз"), 700); }}
              disabled={muted}
              className="f-body flex-1 rounded-xl py-3 text-sm flex items-center justify-center gap-2"
              style={{ background: C.surfaceHi, color: muted ? C.dim : C.chalk, border: `1px solid ${C.line}` }}>
              <Volume2 size={15} /> Проверить
            </button>
          </div>

          {/* Развилка, которую нельзя обойти: телефон разрешает странице либо
              мешать чужому звуку, либо звучать только когда его слышно.
              Выбор отдан человеку, потому что правильного ответа нет. */}
          {!muted && (
            <div className="rounded-xl mb-2 overflow-hidden" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
              {[
                { v: false, t: "Не мешать музыке", d: `Сигнал звучит поверх плеера${isIOS() ? ", но молчит, если сбоку включён «без звука»" : ""}. Из свёрнутого приложения не срабатывает.` },
                { v: true, t: "Сигнал важнее музыки", d: "Слышно всегда и даже из фона, но плеер в наушниках встаёт на паузу на время тренировки." },
              ].map(({ v, t, d }) => (
                <button key={String(v)} onClick={() => { setProfile((p) => ({ ...p, soundSolo: v })); primeAudio(); }}
                  className="f-body w-full text-left px-3 py-2.5 flex gap-2.5"
                  style={{ borderTop: v ? `1px solid ${C.line}` : "none" }}>
                  <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full flex items-center justify-center"
                    style={{ border: `1px solid ${soundSolo === v ? C.moss : C.line}`, background: soundSolo === v ? C.moss : "transparent" }}>
                    {soundSolo === v && <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.chalk }} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm" style={{ color: C.chalk }}>{t}</span>
                    <span className="block text-2xs mt-0.5" style={{ color: C.dim }}>{d}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Уведомления. Обещать «придёт, даже если телефон в кармане»
              нельзя: без сервера этого не умеет ни один сайт. Пишем как есть. */}
          <button
            onClick={async () => { const st = await askNotify(); setNotifyOk(st); say(st === "да" ? "Уведомления включены" : st === "запрещено" ? "Уведомления запрещены в настройках телефона" : "Система не дала разрешение"); }}
            /* Спросить можно один раз: отказ снимается только в настройках
               телефона, и кнопка после него — обманка. */
            disabled={notifyOk !== "спросить"}
            className="f-body w-full rounded-xl px-3 py-3 text-sm mb-2 text-left flex gap-2.5 items-start"
            style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${notifyOk === "да" ? C.moss : C.line}` }}>
            <Bell size={15} color={notifyOk === "да" ? C.mossText : C.dim} className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block">
                {notifyOk === "да" ? "Уведомление об отдыхе: вкл" : notifyOk === "запрещено" ? "Уведомления запрещены" : notifyOk === "нет" ? "Уведомления недоступны" : "Включить уведомление об отдыхе"}
              </span>
              <span className="block f-body text-2xs mt-0.5" style={{ color: C.dim }}>
                {notifyOk === "запрещено"
                  ? "Разрешить можно только в настройках телефона — приложение спросить больше не может."
                  : isIOS()
                    ? "Приходит, когда приложение свёрнуто, а телефон в руке. На iPhone свёрнутое приложение засыпает вместе со своими часами, и уведомление придёт при возвращении — здесь надёжнее сигнал в наушники."
                    : "Приходит, когда приложение свёрнуто, а телефон в руке. Браузер притормаживает фоновые часы, так что уведомление может опоздать примерно на минуту."}
              </span>
            </span>
          </button>
          <button onClick={saveBackupFile} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Share2 size={15} /> Сохранить копию файлом</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(backupJSON()); say("Копия в буфере обмена"); } catch { setShowSettings(false); setExportText(backupJSON()); } }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Copy size={15} /> Скопировать копию текстом</button>
          <button onClick={openImport} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Upload size={15} /> Восстановить из копии</button>
          <button onClick={() => { setShowSettings(false); setShowTerms(true); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><FileText size={15} /> О приложении и ограничениях</button>
          {/* «Исходных» дней больше нет — приложение раздаётся пустым. Так что
              это уже не сброс к чему-то, а честное удаление своих дней. */}
          <div className="mb-2"><ConfirmButton onConfirm={() => { setDays([]); setShowSettings(false); say("Дни удалены"); }} question="Все дни будут удалены. Записи останутся" className="f-body w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><RotateCcw size={15} /> Удалить все дни</ConfirmButton></div>
          <ConfirmButton onConfirm={wipe} question="Стереть весь дневник?" className="f-body w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.redText, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Удалить все записи</ConfirmButton>
          <button onClick={() => setShowSettings(false)} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
          {/* Версия и способ запуска — на виду и одним касанием в буфер.
              Когда отзыв приходит с чужого телефона, первые два вопроса
              всегда одни и те же: какая версия и открыто ли приложение
              установленным. Заставлять человека лезть за этим на два экрана
              вглубь — терять половину отзывов. */}
          <button
            onClick={async () => {
              const line = `${buildLabel()} · ${installed() ? "установлено" : "вкладка браузера"}`;
              try { await navigator.clipboard.writeText(line); say("Версия скопирована"); } catch { say(line); }
            }}
            className="f-body w-full mt-1 py-2 text-2xs" style={{ color: C.dim }}>
            {buildLabel()} · {installed() ? "установлено" : "вкладка браузера"}
          </button>
        </Sheet>
      )}

      {/* невидимый выбор файла — открывает «Файлы» на iPhone и проводник на компьютере */}
      <input ref={fileInput} type="file" accept="application/json,.json,text/plain" onChange={pickBackupFile} className="hidden" />

      {/* Пересчёт трогает уже записанное — об этом нельзя молчать
          и нельзя сказать исчезающей подсказкой. */}
      {pairFixed > 0 && (
        <Sheet onClose={() => setPairFixed(0)}>
          <div className="f-display text-base font-semibold mb-2" style={{ color: C.chalk }}>Тоннаж пересчитан</div>
          <div className="f-body text-sm leading-relaxed mb-3" style={{ color: C.chalk }}>
            В {pairFixed} {pairFixed === 1 ? "записи" : "записях"} упражнения с двумя гантелями
            считались как одна — в поле веса стоит вес одного снаряда, а работа делается двумя.
            Приложение довело их до общего знаменателя.
          </div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
            Числа в журнале и на графиках у этих тренировок выросли примерно вдвое по гантельным
            упражнениям. Это не рост результатов — это исправление счёта: раньше на графике
            возникала ступенька там, где в зале ничего не менялось.
          </div>
          <button onClick={() => setPairFixed(0)} className="f-display w-full rounded-xl py-3 text-sm font-semibold"
            style={{ background: C.red, color: C.chalk }}>Понятно</button>
        </Sheet>
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[60] rounded-full px-4 py-2 f-body text-xs pointer-events-none"
          style={{ bottom: "calc(4.5rem + var(--safe-bottom))", background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
          {toast}
        </div>
      )}
    </div>
  );
}
