import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, X, TrendingUp, BookOpen, Dumbbell, Flame, Settings, Trash2, Check, Info, Play, Timer, Calculator, Copy, ExternalLink, Activity, Pause, ChevronDown, ChevronUp, MoreHorizontal, Search, Library, Layers, Pencil, RotateCcw, Download, Upload, Share2, HardDrive, ShieldAlert, TriangleAlert, HeartPulse, Repeat2, Volume2, VolumeX } from "lucide-react";

import { EXDB, GROUPS, ALL_MUSCLES, PUSH_M, PULL_M, PRESETS, DEFAULT_DAYS, isUni, isBW } from "./data/exercises.js";
import { CONDITIONS, CONDITION_BY_ID, helpfulNote } from "./data/conditions.js";
import { saferAlternatives, worstRisk, risksFor, dayWarnings } from "./lib/swap.js";
import { C, plateColor } from "./lib/theme.js";
import { today, daysAgo, fmtDate } from "./lib/dates.js";
import {
  uid, r1, ytLink,
  exTonnage, workoutTonnage, topWeight, topReps, totalReps,
  epley, brzycki, est1RM, readyToAdd,
  bodyFatNavy, bmiOf, lbmOf, ffmiOf,
} from "./lib/calc.js";
import { loadKey, saveKey, deleteKey, requestPersistence, storageEstimate } from "./lib/storage.js";
import { shareOrDownload, readFileAsText, backupName } from "./lib/backup.js";
import { restFor, fmtRest, stepRest } from "./lib/rest.js";
import { primeAudio, playRestOver, playTick } from "./lib/sound.js";
import { useWakeLock } from "./lib/wakelock.js";

/* ============ atoms ============ */
const Chip = ({ label, value, sub, accent }) => (
  <div className="flex-1 rounded-xl px-3 py-2.5 min-w-0" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
    <div className="f-num text-lg font-semibold truncate" style={{ color: accent || C.chalk }}>{value}</div>
    <div className="f-body text-[11px] uppercase tracking-wide truncate" style={{ color: C.dim }}>{label}</div>
    {sub && <div className="f-body text-[11px] mt-0.5" style={{ color: C.dim }}>{sub}</div>}
  </div>
);
const Sheet = ({ children, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose}>
    <div className="w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);
const UniTag = () => (
  <span className="f-body text-[9px] rounded px-1 py-0.5 ml-1 align-middle" style={{ background: C.blue, color: C.chalk }}>×2</span>
);

/* Маленький значок рядом с названием: красный — не рекомендуется при твоих
   состояниях, жёлтый — с осторожностью. Без выбранных состояний не рисуется. */
const RiskMark = ({ name, conditions }) => {
  const r = worstRisk(name, conditions);
  if (!r) return null;
  return (
    <span className="inline-flex align-middle ml-1" title={r === 2 ? "не рекомендуется при твоих ограничениях" : "с осторожностью"}>
      {r === 2 ? <ShieldAlert size={13} color={C.red} /> : <TriangleAlert size={12} color={C.mustard} />}
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
          <div className="f-body text-[11px] uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: accent }}>
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
        <div className="f-body text-sm flex items-start gap-1.5" style={{ color: C.moss, marginTop: risks.length ? 10 : 0 }}>
          <HeartPulse size={14} className="shrink-0 mt-0.5" />
          <span><span className="font-medium">{good.name} — полезно.</span> {good.note}</span>
        </div>
      )}

      {alts.length > 0 && (
        <div className="mt-3">
          <div className="f-body text-[11px] uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: C.dim }}>
            <Repeat2 size={13} /> Чем заменить
          </div>
          <div className="space-y-1">
            {alts.map((a) => (
              <button key={a.name} onClick={() => onOpen?.(a.name)} className="w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                <span className="min-w-0">
                  <span className="f-body text-xs block truncate" style={{ color: C.chalk }}>{a.name}</span>
                  <span className="f-body text-[9px]" style={{ color: C.dim }}>
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
          <button onClick={() => setShown(name)} className="f-body text-[11px] ml-2 align-middle" style={{ color: C.blue }}>← назад</button>
        )}
      </div>
      {info ? (<>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="f-body text-[11px] rounded-full px-2 py-0.5" style={{ background: C.red, color: C.chalk }}>{info.m}</span>
          <span className="f-body text-[11px] rounded-full px-2 py-0.5" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>{info.g}</span>
          <span className="f-body text-[11px] rounded-full px-2 py-0.5" style={{ background: C.surfaceHi, color: C.dim, border: `1px solid ${C.line}` }}>{info.eq}</span>
          {info.uni && <span className="f-body text-[11px] rounded-full px-2 py-0.5" style={{ background: C.blue, color: C.chalk }}>одностороннее</span>}
        </div>
        <RiskPanel name={shown} conditions={conditions} onOpen={setShown} />
        <div className="f-body text-sm leading-relaxed mb-3" style={{ color: C.chalk }}>{info.d}</div>
        <div className="rounded-lg p-3 mb-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${C.mustard}` }}>
          <div className="f-body text-[11px] uppercase tracking-wide mb-1" style={{ color: C.mustard }}>Ключ к технике</div>
          <div className="f-body text-sm" style={{ color: C.chalk }}>{info.cue}</div>
        </div>
        {info.uni && <div className="f-body text-[11px] mb-3" style={{ color: C.blue }}>Одностороннее: записывай один подход — приложение считает обе стороны, тоннаж умножается на два.</div>}
      </>) : <div className="f-body text-sm mb-3" style={{ color: C.dim }}>Своё упражнение — описания пока нет.</div>}

      <a href={ytLink(shown)} target="_blank" rel="noopener noreferrer" className="f-body flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
        <ExternalLink size={15} /> Разборы техники на YouTube
      </a>

      {onAddToDay && days && (pick ? (
        <div className="mt-2 space-y-1.5">
          <div className="f-body text-xs" style={{ color: C.dim }}>В какой день добавить?</div>
          {days.map((d) => (
            <button key={d.id} onClick={() => { onAddToDay(d.id, shown); onClose(); }} className="f-body w-full text-left rounded-lg px-3 py-2.5 text-sm" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              {d.name}{d.exercises.includes(shown) && <span style={{ color: C.moss }}> · уже есть</span>}
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
      <div className="f-body text-[11px] mt-1" style={{ color: C.dim }}>
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

  /* сигналим один раз: пока полоса на экране, эти флаги живут в ней самой */
  const signalled = useRef(false);
  const ticked = useRef(false);
  useEffect(() => {
    if (done && !signalled.current) {
      signalled.current = true;
      if (!muted) playRestOver();
    }
    if (!done && left <= 3 && !ticked.current) {
      ticked.current = true;
      if (!muted) playTick();
    }
  }, [done, left, muted]);

  const pct = total > 0 ? Math.max(0, Math.min(100, (leftMs / (total * 1000)) * 100)) : 0;
  const accent = done ? C.moss : left <= 10 ? C.mustard : C.red;

  return (
    <div className="rounded-xl overflow-hidden mb-3" style={{ background: C.surface, border: `1px solid ${accent}` }}>
      <div className="px-3.5 pt-3 pb-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="f-body text-[10px] uppercase tracking-wide flex items-center gap-1" style={{ color: accent }}>
            <Timer size={12} /> {done ? "Отдых окончен" : "Отдых"}
          </div>
          <div className="f-body text-xs truncate mt-0.5" style={{ color: C.dim }}>{exName}</div>
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

function SessionTab({ session, setSession, workouts, days, onFinish, goToDays, conditions, restOverrides, setRestOverride, muted }) {
  const [pickDay, setPickDay] = useState(days[0]?.id);
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState("");
  const [info, setInfo] = useState(null);
  const [menu, setMenu] = useState(false);

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

  const lastFor = useCallback((name) => {
    for (const w of [...workouts].sort((a, b) => b.date.localeCompare(a.date))) {
      const ex = w.exercises.find((e) => e.name === name);
      if (ex) return { date: w.date, ex };
    }
    return null;
  }, [workouts]);

  const setsLine = (ex) => ex.sets.map((s) => (ex.bodyweight ? s.reps : `${s.reps}×${s.weight}`)).join(" · ");

  if (!session) {
    if (!days.length) return <div className="px-4 py-16 text-center f-body text-sm" style={{ color: C.dim }}>Нет ни одного дня. Создай его во вкладке «База».</div>;
    const toggle = (n) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
    const start = () => {
      if (!picked.length) return;
      setSession({
        id: uid(), date: today(), dayId: day.id, dayLabel: day.name,
        startedAt: Date.now(), resumedAt: Date.now(), accumMs: 0, paused: false, note: "",
        exercises: picked.map((n) => {
          const prev = lastFor(n); const bw = isBW(n);
          const nSets = prev ? prev.ex.sets.length : 3;
          return { name: n, bodyweight: bw, uni: isUni(n), sets: Array.from({ length: nSets }, (_, i) => ({ reps: "", weight: bw ? null : prev?.ex.sets[i]?.weight ?? prev?.ex.sets[0]?.weight ?? "", done: false })) };
        }),
      });
    };
    return (
      <div className="px-4 pt-4 pb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="f-body text-xs" style={{ color: C.dim }}>Собери тренировку</span>
          <button onClick={goToDays} className="f-body text-xs flex items-center gap-1" style={{ color: C.blue }}><Pencil size={12} /> дни</button>
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
                <button onClick={() => toggle(n)} className="shrink-0 w-5 h-5 rounded flex items-center justify-center" style={{ background: on ? C.moss : "transparent", border: `1px solid ${on ? C.moss : C.line}` }}>
                  {on && <Check size={13} color={C.chalk} />}
                </button>
                <button onClick={() => toggle(n)} className="flex-1 text-left min-w-0">
                  <div className="f-body text-sm truncate" style={{ color: on ? C.chalk : C.dim }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                  {prev && <div className="f-num text-[10px] truncate" style={{ color: C.dim }}>{fmtDate(prev.date)}: {setsLine(prev.ex)}</div>}
                  {up && <div className="f-body text-[10px]" style={{ color: C.mustard }}>выбил верх диапазона — пробуй +2.5 кг</div>}
                </button>
                <button onClick={() => setInfo(n)} className="shrink-0 p-1"><Info size={15} color={C.dim} /></button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Разовое упражнение…" className="f-body flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
          <button onClick={() => { if (custom.trim()) { setPicked((p) => [...p, custom.trim()]); setCustom(""); } }} className="rounded-lg px-3" style={{ background: C.surface, border: `1px solid ${C.line}`, color: C.chalk }}><Plus size={16} /></button>
        </div>
        <button onClick={start} disabled={!picked.length} className="f-display w-full mt-5 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: picked.length ? C.red : C.surface, color: picked.length ? C.chalk : C.dim }}>
          <Play size={18} /> Начать тренировку ({picked.length})
        </button>
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
  const togglePause = () => setSession((s) => s.paused
    ? { ...s, paused: false, resumedAt: Date.now() }
    : { ...s, paused: true, accumMs: (s.accumMs || 0) + (Date.now() - (s.resumedAt || s.startedAt)) });

  const live = workoutTonnage({ exercises: session.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })) });
  const doneSets = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const finish = () => {
    const cleaned = session.exercises.map((e) => ({
      name: e.name, bodyweight: e.bodyweight, uni: !!e.uni,
      sets: e.sets.filter((s) => s.reps !== "" && (e.bodyweight || s.weight !== "")).map((s) => ({ reps: +s.reps, weight: e.bodyweight ? null : +s.weight })),
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
            <div className="f-display text-sm font-semibold truncate mb-1.5" style={{ color: C.chalk }}>{session.dayLabel}</div>
            <Elapsed session={session} doneSets={doneSets} live={live} />
          </div>
          <button onClick={togglePause} className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: C.surface, border: `1px solid ${session.paused ? C.mustard : C.line}` }}>
            {session.paused ? <Play size={18} color={C.mustard} /> : <Pause size={18} color={C.dim} />}
          </button>
        </div>
        <div className="flex gap-2 mt-2.5">
          <button onClick={finish} className="f-display flex-1 rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => setMenu(true)} className="w-11 rounded-lg flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}` }}><MoreHorizontal size={17} color={C.dim} /></button>
        </div>
        {session.paused && <div className="f-body text-[11px] mt-2" style={{ color: C.mustard }}>Пауза — время не идёт. Можно закрыть приложение и вернуться.</div>}
      </div>

      <div className="mt-3 space-y-3">
        {session.exercises.map((ex, i) => {
          const prev = lastFor(ex.name);
          return (
            <div key={i} className="rounded-xl p-3" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="f-body text-sm font-medium" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}<RiskMark name={ex.name} conditions={conditions} /></div>
                  {ex.uni && <div className="f-body text-[10px]" style={{ color: C.blue }}>вводи один подход — считается за обе стороны</div>}
                  {prev && <div className="f-num text-[10px] truncate" style={{ color: C.dim }}>прошлый раз: {setsLine(prev.ex)}</div>}
                  <div className="f-body text-[10px] flex items-center gap-1 mt-0.5" style={{ color: C.dim }}>
                    <Timer size={10} /> отдых {fmtRest(restFor(ex.name, restOverrides))}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => setInfo(ex.name)}><Info size={15} color={C.dim} /></button>
                  <button onClick={() => rmExercise(i)}><Trash2 size={15} color={C.dim} /></button>
                </div>
              </div>
              <div className="space-y-1.5">
                {ex.sets.map((s, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <span className="f-num text-[11px] w-3" style={{ color: C.dim }}>{j + 1}</span>
                    <input type="number" inputMode="numeric" placeholder="повт" value={s.reps} onChange={(e) => upd(i, j, "reps", e.target.value)} className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${C.line}` }} />
                    {!ex.bodyweight && (<>
                      <span className="f-body text-[11px]" style={{ color: C.dim }}>×</span>
                      <input type="number" inputMode="decimal" placeholder="кг" value={s.weight ?? ""} onChange={(e) => upd(i, j, "weight", e.target.value)} className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={{ background: C.surfaceHi, color: s.done ? C.moss : C.chalk, border: `1px solid ${C.line}` }} />
                    </>)}
                    <button onClick={() => markDone(i, j)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: s.done ? C.moss : C.surfaceHi, border: `1px solid ${s.done ? C.moss : C.line}` }}>
                      <Check size={15} color={s.done ? C.chalk : C.dim} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => addSet(i)} className="f-body mt-2 text-xs" style={{ color: C.moss }}>+ подход</button>
            </div>
          );
        })}
      </div>

      <textarea value={session.note} onChange={(e) => setSession((s) => ({ ...s, note: e.target.value }))} placeholder="Заметка: самочувствие, плечо, сон, что тянуло…" rows={2}
        className="f-body w-full mt-3 rounded-xl px-3 py-2.5 text-sm resize-none" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
      <button onClick={finish} className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={18} /> Завершить и сохранить</button>

      {menu && (
        <Sheet onClose={() => setMenu(false)}>
          <div className="f-display text-base font-semibold mb-3" style={{ color: C.chalk }}>Тренировка</div>
          <button onClick={finish} className="f-body w-full rounded-xl py-3 text-sm font-medium mb-2 flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}><Check size={15} /> Завершить и сохранить</button>
          <button onClick={() => { togglePause(); setMenu(false); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            {session.paused ? <><Play size={15} /> Продолжить</> : <><Pause size={15} /> Пауза</>}
          </button>
          <div className="f-body text-[11px] mb-1 mt-3" style={{ color: C.dim }}>Прервать — тренировка не сохранится в журнал.</div>
          <button onClick={() => { setSession(null); setMenu(false); }} className="f-body w-full rounded-xl py-3 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.red, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Прервать без сохранения</button>
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Поиск среди ${Object.keys(EXDB).length} упражнений…`}
          className="f-body w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }} />
      </div>

      {found ? (
        <div className="space-y-1.5">
          {!found.length && <div className="f-body text-sm text-center py-8" style={{ color: C.dim }}>Ничего не нашлось.</div>}
          {found.map((n) => (
            <button key={n} onClick={() => setInfo(n)} className="w-full text-left rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
              <div className="f-body text-sm" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
              <div className="f-body text-[10px]" style={{ color: C.dim }}>{EXDB[n].m} · {EXDB[n].eq}</div>
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
                    <span className="f-num text-[11px]" style={{ color: C.dim }}>{count}</span>
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
                            <span className="f-num text-[10px]" style={{ color: C.dim }}>{m.list.length}</span>
                          </button>
                          {mo && (
                            <div className="pb-1">
                              {m.list.map((n) => (
                                <button key={n} onClick={() => setInfo(n)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left" style={{ borderTop: `1px solid ${C.line}` }}>
                                  <span className="f-body text-xs min-w-0" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
                                  <span className="f-body text-[9px] shrink-0" style={{ color: C.dim }}>{EXDB[n].eq}</span>
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
  const [q, setQ] = useState("");

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

  const filtered = q.trim().length > 1 ? Object.keys(EXDB).filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()) || EXDB[n].m.toLowerCase().includes(q.trim().toLowerCase())) : null;

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
                  <div className="f-body text-[11px] flex items-center gap-2" style={{ color: C.dim }}>
                    <span>{d.exercises.length} упражнений</span>
                    {warn.avoid > 0 && <span className="flex items-center gap-0.5" style={{ color: C.red }}><ShieldAlert size={11} />{warn.avoid}</span>}
                    {warn.care > 0 && <span className="flex items-center gap-0.5" style={{ color: C.mustard }}><TriangleAlert size={11} />{warn.care}</span>}
                  </div>
                </div>
                {o ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
              </button>
              {o && (
                <div className="px-3 pb-3">
                  <input value={d.name} onChange={(e) => rename(d.id, e.target.value)} className="f-body w-full rounded-lg px-3 py-2 text-sm mb-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
                  <div className="space-y-1">
                    {d.exercises.map((n, i) => (
                      <div key={n} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2" style={{ background: C.surfaceHi }}>
                        <div className="flex flex-col shrink-0">
                          <button onClick={() => move(d.id, i, -1)} className="h-3.5"><ChevronUp size={12} color={C.dim} /></button>
                          <button onClick={() => move(d.id, i, 1)} className="h-3.5"><ChevronDown size={12} color={C.dim} /></button>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="f-body text-xs truncate" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></div>
                          {EXDB[n] && <div className="f-body text-[9px]" style={{ color: C.dim }}>{EXDB[n].m}</div>}
                        </div>
                        <button onClick={() => removeEx(d.id, n)} className="shrink-0"><X size={14} color={C.dim} /></button>
                      </div>
                    ))}
                    {!d.exercises.length && <div className="f-body text-xs text-center py-3" style={{ color: C.dim }}>Пока пусто — добавь упражнения.</div>}
                  </div>
                  <button onClick={() => { setPickFor(d.id); setQ(""); }} className="f-body w-full mt-2 rounded-lg py-2.5 text-sm flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.moss, border: `1px solid ${C.line}` }}><Plus size={14} /> Добавить упражнение</button>
                  <button onClick={() => delDay(d.id)} className="f-body w-full mt-1.5 py-2 text-xs flex items-center justify-center gap-1.5" style={{ color: C.red }}><Trash2 size={12} /> Удалить день</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pickFor && (
        <Sheet onClose={() => setPickFor(null)}>
          <div className="f-display text-base font-semibold mb-2" style={{ color: C.chalk }}>Добавить в «{days.find((d) => d.id === pickFor)?.name}»</div>
          <div className="relative mb-3">
            <Search size={15} color={C.dim} className="absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по названию или мышце…" className="f-body w-full rounded-lg pl-9 pr-3 py-2.5 text-sm" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }} />
          </div>
          <div className="space-y-1">
            {(filtered || Object.keys(EXDB)).map((n) => {
              const has = days.find((d) => d.id === pickFor)?.exercises.includes(n);
              return (
                <button key={n} onClick={() => addEx(pickFor, n)} disabled={has} className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left" style={{ background: C.surfaceHi, opacity: has ? 0.45 : 1 }}>
                  <span className="min-w-0">
                    <span className="f-body text-xs block truncate" style={{ color: C.chalk }}>{n}{isUni(n) && <UniTag />}<RiskMark name={n} conditions={conditions} /></span>
                    <span className="f-body text-[9px]" style={{ color: C.dim }}>{EXDB[n].m} · {EXDB[n].eq}</span>
                  </span>
                  {has ? <Check size={14} color={C.moss} /> : <Plus size={14} color={C.moss} />}
                </button>
              );
            })}
          </div>
          <button onClick={() => setPickFor(null)} className="f-body w-full mt-3 py-3 text-sm" style={{ color: C.dim }}>Готово</button>
        </Sheet>
      )}

      {presets && (
        <Sheet onClose={() => setPresets(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Готовые сплиты</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Дни добавятся к существующим — старые не удалятся.</div>
          <div className="space-y-2">
            {Object.entries(PRESETS).map(([k, p]) => (
              <button key={k} onClick={() => applyPreset(k)} className="w-full text-left rounded-xl p-3" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
                <div className="f-display text-sm font-semibold" style={{ color: C.chalk }}>{p.name}</div>
                <div className="f-body text-[11px] mb-1.5" style={{ color: C.dim }}>{p.desc}</div>
                <div className="f-body text-[10px]" style={{ color: C.blue }}>{p.days.map((d) => d.name.split(" (")[0]).join(" · ")}</div>
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
/** Правка уже записанной тренировки: подходы, дата, заметка. */
function EditWorkout({ workout, onSave, onClose }) {
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
    e.sets = [...e.sets, { reps: last.reps, weight: e.bodyweight ? null : last.weight }];
    ex[i] = e;
    return { ...d, exercises: ex };
  });
  const rmSet = (i, j) => setDraft((d) => {
    const ex = [...d.exercises];
    ex[i] = { ...ex[i], sets: ex[i].sets.filter((_, k) => k !== j) };
    return { ...d, exercises: ex };
  });
  const rmExercise = (i) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, k) => k !== i) }));

  /* пустые поля и подходы отбрасываем, иначе в статистику попадут нули */
  const save = () => {
    const exercises = draft.exercises
      .map((e) => ({
        ...e,
        sets: e.sets
          .filter((s) => s.reps !== "" && s.reps != null && (e.bodyweight || (s.weight !== "" && s.weight != null)))
          .map((s) => ({ reps: +s.reps, weight: e.bodyweight ? null : +s.weight })),
      }))
      .filter((e) => e.sets.length);
    onSave({ ...draft, exercises });
  };

  const inp = { background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` };
  const total = workoutTonnage({
    exercises: draft.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.reps && (e.bodyweight || s.weight)) })),
  });

  return (
    <Sheet onClose={onClose}>
      <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Правка тренировки</div>
      <div className="f-body text-xs mb-3" style={{ color: C.dim }}>
        {draft.dayLabel} · сейчас {total.toLocaleString("ru-RU")} кг
      </div>

      <div className="flex gap-2 mb-3">
        <input type="date" value={draft.date} onChange={(e) => setField("date", e.target.value)} className="f-num flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={inp} />
        <input type="number" inputMode="numeric" value={draft.durationMin ?? ""} onChange={(e) => setField("durationMin", e.target.value === "" ? null : +e.target.value)} placeholder="мин" className="f-num w-20 rounded-lg px-2 py-2 text-sm text-center shrink-0" style={inp} />
      </div>

      <div className="space-y-2.5">
        {draft.exercises.map((ex, i) => (
          <div key={i} className="rounded-xl p-3" style={{ background: C.surfaceHi, border: `1px solid ${C.line}` }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="f-body text-sm min-w-0" style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}</div>
              <button onClick={() => rmExercise(i)} className="shrink-0"><Trash2 size={14} color={C.dim} /></button>
            </div>
            <div className="space-y-1.5">
              {ex.sets.map((s, j) => (
                <div key={j} className="flex items-center gap-2">
                  <span className="f-num text-[11px] w-3" style={{ color: C.dim }}>{j + 1}</span>
                  <input type="number" inputMode="numeric" value={s.reps ?? ""} onChange={(e) => updSet(i, j, "reps", e.target.value)} placeholder="повт" className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={inp} />
                  {!ex.bodyweight && (<>
                    <span className="f-body text-[11px]" style={{ color: C.dim }}>×</span>
                    <input type="number" inputMode="decimal" value={s.weight ?? ""} onChange={(e) => updSet(i, j, "weight", e.target.value)} placeholder="кг" className="f-num flex-1 rounded-lg px-2 py-1.5 text-sm text-center min-w-0" style={inp} />
                  </>)}
                  <button onClick={() => rmSet(i, j)} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
                    <X size={14} color={C.dim} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => addSet(i)} className="f-body mt-2 text-xs" style={{ color: C.moss }}>+ подход</button>
          </div>
        ))}
        {!draft.exercises.length && (
          <div className="f-body text-sm text-center py-6" style={{ color: C.red }}>
            Не осталось ни одного упражнения — сохранение удалит запись.
          </div>
        )}
      </div>

      <textarea value={draft.note || ""} onChange={(e) => setField("note", e.target.value)} rows={2} placeholder="Заметка…"
        className="f-body w-full mt-3 rounded-xl px-3 py-2.5 text-sm resize-none" style={inp} />

      <button onClick={save} className="f-display w-full mt-3 rounded-xl py-3.5 text-base font-semibold flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
        <Check size={18} /> Сохранить изменения
      </button>
      <button onClick={onClose} className="f-body w-full mt-2 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
    </Sheet>
  );
}

function WorkoutCard({ w, isPR, onDelete, onEdit }) {
  const [open, setOpen] = useState(false);
  const t = workoutTonnage(w);
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen(!open)} className="w-full text-left px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="f-display text-sm font-semibold truncate" style={{ color: C.chalk }}>{w.dayLabel}</div>
            <div className="f-body text-[11px] mt-0.5" style={{ color: C.dim }}>{fmtDate(w.date)}{w.durationMin ? ` · ${w.durationMin} мин` : ""}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="f-num text-sm font-semibold" style={{ color: C.chalk }}>{t.toLocaleString("ru-RU")} кг</div>
              {isPR && <div className="f-body text-[10px] flex items-center gap-0.5 justify-end" style={{ color: C.mustard }}><Flame size={10} /> PR</div>}
            </div>
            {open ? <ChevronUp size={16} color={C.dim} /> : <ChevronDown size={16} color={C.dim} />}
          </div>
        </div>
        <div className="flex w-full h-2 rounded-full overflow-hidden mt-2.5" style={{ background: C.line }}>
          {w.exercises.filter((e) => exTonnage(e) > 0).map((e, i) => <div key={i} style={{ width: `${(exTonnage(e) / (t || 1)) * 100}%`, background: plateColor(topWeight(e)) }} />)}
        </div>
      </button>
      {open && (
        <div className="px-3.5 pb-3">
          {w.exercises.map((ex, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-xs f-body py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
              <span style={{ color: C.chalk }}>{ex.name}{ex.uni && <UniTag />}</span>
              <span className="f-num text-right shrink-0" style={{ color: C.dim }}>{ex.sets.map((s) => (ex.bodyweight ? s.reps : `${s.reps}×${s.weight}`)).join(" · ")}</span>
            </div>
          ))}
          {w.note && <div className="f-body text-[11px] pt-2" style={{ color: C.mustard }}>{w.note}</div>}
          <div className="flex gap-2 mt-2.5">
            <button onClick={() => onEdit(w)} className="f-body flex-1 rounded-lg py-2 text-xs flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
              <Pencil size={12} /> Изменить
            </button>
            <button onClick={() => onDelete(w.id)} className="f-body rounded-lg px-3 py-2 text-xs flex items-center justify-center gap-1.5" style={{ background: C.surfaceHi, color: C.red, border: `1px solid ${C.line}` }}>
              <Trash2 size={12} /> Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JournalTab({ workouts, onDelete, onExport, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  const mk = today().slice(0, 7);
  const monthT = workouts.filter((w) => w.date.startsWith(mk)).reduce((s, w) => s + workoutTonnage(w), 0);
  const allT = workouts.reduce((s, w) => s + workoutTonnage(w), 0);
  const best = {}; const prs = new Set();
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

  return (
    <div className="px-4 pt-4 pb-8">
      <div className="flex gap-2">
        <Chip label="тоннаж за месяц" value={monthT.toLocaleString("ru-RU")} sub="кг" />
        <Chip label="всего тренировок" value={workouts.length} sub={`${allT.toLocaleString("ru-RU")} кг`} />
      </div>
      {workouts.length > 0 && (
        <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
          <div className="f-body text-[10px] uppercase tracking-wide mb-1.5" style={{ color: C.dim }}>последние 5 недель</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => <div key={c.key} className="aspect-square rounded-sm" style={{ background: c.on ? C.red : C.surfaceHi }} />)}
          </div>
        </div>
      )}
      <button onClick={onExport} className="f-body w-full mt-2 rounded-xl py-2.5 text-sm flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
        <Copy size={15} /> Выгрузить дневник для Claude
      </button>
      <div className="mt-4 space-y-2.5">
        {!sorted.length && <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Пусто. Собери первую тренировку во вкладке «Сессия».</div>}
        {sorted.map((w) => <WorkoutCard key={w.id} w={w} isPR={prs.has(w.id)} onDelete={onDelete} onEdit={setEditing} />)}
      </div>

      {editing && (
        <EditWorkout
          workout={editing}
          onClose={() => setEditing(null)}
          onSave={(w) => { onUpdate(w); setEditing(null); }}
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

function ProgressTab({ workouts }) {
  const [view, setView] = useState("exercise");
  const names = useMemo(() => { const s = new Set(); workouts.forEach((w) => w.exercises.forEach((e) => s.add(e.name))); return [...s].sort(); }, [workouts]);
  const [sel, setSel] = useState("");
  const [metric, setMetric] = useState("weight");
  const [range, setRange] = useState(90);
  useEffect(() => { if (!sel && names.length) setSel(names[0]); }, [names, sel]);

  const cutoff = useMemo(() => daysAgo(range), [range]);
  const series = useMemo(() => [...workouts].filter((w) => w.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => { const ex = w.exercises.find((e) => e.name === sel); return ex ? { date: fmtDate(w.date), weight: topWeight(ex), e1rm: est1RM(ex), tonnage: exTonnage(ex) || null, reps: totalReps(ex) } : null; })
    .filter(Boolean), [workouts, sel, cutoff]);
  const totalSeries = useMemo(() => [...workouts].filter((w) => w.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date)).map((w) => ({ date: fmtDate(w.date), tonnage: workoutTonnage(w) })), [workouts, cutoff]);

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
          <button key={id} onClick={() => setView(id)} className="f-body flex-1 text-[11px] py-2" style={{ background: view === id ? C.red : C.surface, color: view === id ? C.chalk : C.dim }}>{l}</button>
        ))}
      </div>
      {(view === "exercise" || view === "total") && (
        <div className="flex gap-1.5 mb-3">
          {RANGES.map((r) => <button key={r.id} onClick={() => setRange(r.id)} className="f-body rounded-full px-3 py-1 text-[11px]" style={{ background: range === r.id ? C.surfaceHi : "transparent", color: range === r.id ? C.chalk : C.dim, border: `1px solid ${C.line}` }}>{r.label}</button>)}
        </div>
      )}

      {view === "exercise" && (<>
        <select value={sel} onChange={(e) => setSel(e.target.value)} className="f-body w-full rounded-lg px-3 py-2.5 text-sm" style={{ background: C.surface, color: C.chalk, border: `1px solid ${C.line}` }}>
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
          {METRICS.map((x) => <button key={x.id} onClick={() => setMetric(x.id)} className="f-body shrink-0 rounded-full px-3 py-1 text-[11px]" style={{ background: metric === x.id ? C.blue : C.surface, color: metric === x.id ? C.chalk : C.dim, border: `1px solid ${metric === x.id ? C.blue : C.line}` }}>{x.label}</button>)}
        </div>
        {valid.length ? (<>
          <div className="flex gap-2 mt-3">
            <Chip label={m.label} value={`${last[metric]}${m.unit ? " " + m.unit : ""}`} sub={delta ? `${delta > 0 ? "+" : ""}${r1(delta)} за период` : undefined} />
            <Chip label="сессий" value={valid.length} />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke={C.dim} fontSize={10} tickLine={false} axisLine={{ stroke: C.line }} />
              <YAxis stroke={C.dim} fontSize={10} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: C.surfaceHi, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.chalk }} />
              <Line type="monotone" dataKey={metric} name={m.label} stroke={C.red} strokeWidth={2.5} dot={{ r: 3, fill: C.red }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </>) : <div className="f-body text-sm text-center py-12" style={{ color: C.dim }}>Нет данных за период.</div>}
      </>)}

      {view === "total" && (
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={totalSeries} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" stroke={C.dim} fontSize={10} tickLine={false} axisLine={{ stroke: C.line }} />
            <YAxis stroke={C.dim} fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: C.surfaceHi, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.chalk }} />
            <Bar dataKey="tonnage" name="тоннаж, кг" fill={C.blue} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {view === "volume" && (<div>
        <div className="f-body text-[11px] mb-3" style={{ color: C.dim }}>Рабочих подходов за 7 дней. Ориентир для роста — 10–20 на мышцу.</div>
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
            <div className="f-body text-[10px] mt-1.5" style={{ color: C.dim }}>{volume.pull >= volume.push ? "Тяг не меньше жимов — плечу это нравится." : "Жимов больше, чем тяг. При больном плече лучше держать тяги в равновесии или выше."}</div>
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
                <div className="f-body text-[10px]" style={{ color: C.dim }}>{fmtDate(r.date)}{EXDB[r.name] ? ` · ${EXDB[r.name].m}` : ""}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="f-num text-sm font-semibold" style={{ color: C.mustard }}>{r.bw ? `${r.v} повт` : `${r.v} кг`}</div>
                {!r.bw && r.rm && <div className="f-num text-[10px]" style={{ color: C.dim }}>1ПМ ~{r.rm}</div>}
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
          <div className="f-body text-[11px] truncate" style={{ color: C.dim }}>
            {picked.length ? picked.map((id) => CONDITION_BY_ID[id]?.name).filter(Boolean).join(", ") : "не выбрано — предупреждений не будет"}
          </div>
        </div>
        {open ? <ChevronUp size={15} color={C.dim} /> : <ChevronDown size={15} color={C.dim} />}
      </button>

      {open && (
        <div className="mt-3">
          <div className="f-body text-[11px] mb-2.5" style={{ color: C.dim }}>
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
                    <span className="f-body text-[10px] block" style={{ color: C.dim }}>{c.hint}</span>
                    {on && <span className="f-body text-[11px] block mt-1.5" style={{ color: C.chalk }}>{c.guide}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="f-body text-[10px] mt-3 leading-relaxed" style={{ color: C.dim }}>
            Это не медицинские предписания, а ориентиры по механике движений. Приложение не знает твоего диагноза:
            «не рекомендуется» значит «у движения известны проблемы при таком состоянии», а не запрет. При настоящей
            травме порядок обратный — сначала врач, потом приложение.
          </div>
        </div>
      )}
    </div>
  );
}

function BodyTab({ metrics, profile, setProfile, onAdd, onDelete, workouts }) {
  const [form, setForm] = useState({ date: today() });
  const [showForm, setShowForm] = useState(false);
  const [chartKey, setChartKey] = useState("weight");
  const [showHistory, setShowHistory] = useState(false);
  const [w1, setW1] = useState(""); const [r1v, setR1v] = useState("");
  const [dur, setDur] = useState("60"); const [intensity, setIntensity] = useState("moderate");

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
  const MET = { light: 3.5, moderate: 5.0, hard: 6.0 }[intensity];
  const gross = bodyW && +dur ? Math.round((MET * 3.5 * bodyW / 200) * +dur) : null;
  const restK = bmr && +dur ? Math.round((bmr / 1440) * +dur) : null;
  const net = gross && restK ? gross - restK : null;
  const avgDur = useMemo(() => { const d = workouts.filter((x) => x.durationMin).map((x) => x.durationMin); return d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null; }, [workouts]);
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
          <input type="number" placeholder="рост, см" value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })} className="f-num flex-1 rounded-lg px-2.5 py-2 text-sm min-w-0" style={inp} />
          <input type="number" placeholder="возраст" value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })} className="f-num flex-1 rounded-lg px-2.5 py-2 text-sm min-w-0" style={inp} />
          <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: `1px solid ${C.line}` }}>
            {[["m", "М"], ["f", "Ж"]].map(([v, l]) => <button key={v} onClick={() => setProfile({ ...profile, sex: v })} className="f-body text-xs px-3" style={{ background: profile.sex === v ? C.red : C.surfaceHi, color: profile.sex === v ? C.chalk : C.dim }}>{l}</button>)}
          </div>
        </div>
        <select value={profile.activity} onChange={(e) => setProfile({ ...profile, activity: e.target.value })} className="f-body w-full rounded-lg px-3 py-2 text-sm mt-2" style={inp}>
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
            <span className="f-body text-[11px]" style={{ color: C.dim }}>замер {fmtDate(latest.date)}</span>
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
            {availableKeys.map((mm) => <button key={mm.k} onClick={() => setChartKey(mm.k)} className="f-body shrink-0 rounded-full px-3 py-1 text-[11px]" style={{ background: chartKey === mm.k ? C.blue : C.surface, color: chartKey === mm.k ? C.chalk : C.dim, border: `1px solid ${chartKey === mm.k ? C.blue : C.line}` }}>{mm.l}</button>)}
          </div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.line} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" stroke={C.dim} fontSize={10} tickLine={false} axisLine={{ stroke: C.line }} />
                <YAxis stroke={C.dim} fontSize={10} tickLine={false} axisLine={false} domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip contentStyle={{ background: C.surfaceHi, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: C.chalk }} />
                <Line type="monotone" dataKey="v" name={MEASURES.find((x) => x.k === chartKey)?.l} stroke={C.mustard} strokeWidth={2.5} dot={{ r: 3, fill: C.mustard }} />
              </LineChart>
            </ResponsiveContainer>
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
                <div className="f-num text-[10px]" style={{ color: C.dim }}>{MEASURES.filter((x) => m[x.k] != null).map((x) => `${x.l} ${m[x.k]}`).join(" · ")}</div>
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
          <input type="number" inputMode="decimal" placeholder="вес, кг" value={w1} onChange={(e) => setW1(e.target.value)} className="f-num flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={inp} />
          <input type="number" inputMode="numeric" placeholder="повт" value={r1v} onChange={(e) => setR1v(e.target.value)} className="f-num flex-1 rounded-lg px-3 py-2 text-sm min-w-0" style={inp} />
        </div>
        {oneRM && (<>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="f-num text-2xl font-bold" style={{ color: C.red }}>{oneRM.avg}</span>
            <span className="f-body text-xs" style={{ color: C.dim }}>кг · Эпли {oneRM.epley} / Бжицки {oneRM.brzycki}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 mt-3">
            {PCT.map(([p, reps]) => (
              <div key={p} className="rounded-lg py-1.5 text-center" style={{ background: C.surfaceHi }}>
                <div className="f-num text-xs font-semibold" style={{ color: C.chalk }}>{Math.round(oneRM.avg * p / 100 * 2) / 2}</div>
                <div className="f-body text-[9px]" style={{ color: C.dim }}>{reps} повт</div>
              </div>
            ))}
          </div>
        </>)}
        <div className="f-body text-[11px] mt-2" style={{ color: C.dim }}>Формулы точны до ~10 повторений. Это оценка, а не повод идти проверять на практике — особенно с протрузией.</div>
      </div>

      {/* энергия */}
      <div className="rounded-xl p-3.5" style={{ background: C.surface, border: `1px solid ${C.line}` }}>
        <div className="f-display text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: C.chalk }}><Activity size={15} /> Энергия и калории</div>
        <div className="rounded-lg px-2.5 py-2 mb-3" style={{ background: C.surfaceHi, borderLeft: `3px solid ${tier === 3 ? C.moss : tier === 2 ? C.mustard : C.red}` }}>
          <div className="f-body text-[11px] font-medium" style={{ color: tier === 3 ? C.moss : tier === 2 ? C.mustard : C.red }}>Точность: {tierInfo.l}</div>
          <div className="f-body text-[11px]" style={{ color: C.dim }}>{tierInfo.d}</div>
        </div>
        {tdee ? (
          <div className="flex gap-2"><Chip label="базовый обмен" value={bmr} sub="ккал/сут" /><Chip label="поддержание" value={tdee} sub="ккал/сут" /></div>
        ) : <div className="f-body text-xs" style={{ color: C.dim }}>Заполни профиль и добавь замер веса.</div>}
        {bodyW > 0 && (<>
          <div className="f-body text-[11px] uppercase tracking-wide mt-4 mb-2" style={{ color: C.dim }}>Расход за тренировку</div>
          <div className="flex gap-2">
            <input type="number" placeholder="мин" value={dur} onChange={(e) => setDur(e.target.value)} className="f-num w-20 rounded-lg px-2 py-2 text-sm shrink-0" style={inp} />
            <select value={intensity} onChange={(e) => setIntensity(e.target.value)} className="f-body flex-1 rounded-lg px-2 py-2 text-sm min-w-0" style={inp}>
              <option value="light">Спокойно, длинный отдых</option>
              <option value="moderate">Обычно, отдых 90 сек</option>
              <option value="hard">Плотно, суперсеты</option>
            </select>
          </div>
          {avgDur && <button onClick={() => setDur(String(avgDur))} className="f-body text-[11px] mt-1.5" style={{ color: C.blue }}>Подставить среднюю из журнала: {avgDur} мин</button>}
          {gross && (
            <div className="flex gap-2 mt-3">
              <Chip label="всего сожжено" value={`~${gross}`} sub="ккал за сессию" accent={C.mustard} />
              {net && <Chip label="сверх покоя" value={`~${net}`} sub="чистый расход" accent={C.moss} />}
            </div>
          )}
          <div className="f-body text-[11px] mt-2" style={{ color: C.dim }}>«Сверх покоя» — то, что потрачено дополнительно к тому, что тело сожгло бы лёжа. Именно эта цифра честная. Главный ориентир на дефиците — динамика веса и талии, а не калькулятор.</div>
        </>)}
      </div>

      {showForm && (
        <Sheet onClose={() => setShowForm(false)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Новый замер</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Обязателен только вес. Чем больше заполнишь — тем точнее расчёты.</div>
          <input type="date" value={form.date || today()} onChange={(e) => setForm({ ...form, date: e.target.value })} className="f-num w-full rounded-lg px-3 py-2 text-sm mb-3" style={inp} />
          <div className="space-y-2">
            {MEASURES.map((mm) => (
              <div key={mm.k} className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="f-body text-sm" style={{ color: mm.req ? C.chalk : C.dim }}>{mm.l}{mm.req && <span style={{ color: C.red }}> *</span>}</div>
                  {mm.hint && <div className="f-body text-[10px]" style={{ color: C.dim }}>{mm.hint}</div>}
                </div>
                <input type="number" inputMode="decimal" placeholder={mm.u} value={form[mm.k] ?? ""} onChange={(e) => setForm({ ...form, [mm.k]: e.target.value })} className="f-num w-24 rounded-lg px-2 py-2 text-sm text-center shrink-0" style={inp} />
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
  const fileInput = useRef(null);

  useEffect(() => {
    (async () => {
      setWorkouts((await loadKey("workouts")) || []);
      setMetrics((await loadKey("metrics")) || []);
      const d = await loadKey("days");
      if (d && d.length) setDaysState(d); else { setDaysState(DEFAULT_DAYS); saveKey("days", DEFAULT_DAYS); }
      setSessionState(await loadKey("session"));
      const p = await loadKey("profile"); if (p) setProfileState(p);
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
  const updateWorkout = useCallback((w) => setWorkouts((prev) => {
    const next = w.exercises.length ? prev.map((x) => (x.id === w.id ? w : x)) : prev.filter((x) => x.id !== w.id);
    saveKey("workouts", next);
    return next;
  }), []);
  const addMetric = useCallback((m) => setMetrics((prev) => { const next = [...prev, m]; saveKey("metrics", next); return next; }), []);
  const deleteMetric = useCallback((id) => setMetrics((prev) => { const next = prev.filter((m) => m.id !== id); saveKey("metrics", next); return next; }), []);

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
      lines.push("", `### ${w.date} — ${w.dayLabel} — тоннаж ${workoutTonnage(w)} кг${w.durationMin ? `, ${w.durationMin} мин` : ""}`);
      w.exercises.forEach((ex) => {
        const s = ex.sets.map((x) => (ex.bodyweight ? `${x.reps}` : `${x.reps}×${x.weight}`)).join(", ");
        const rm = est1RM(ex);
        lines.push(`- ${ex.name}${ex.uni ? " [каждой стороной]" : ""}: ${s}${rm ? ` (расч.1ПМ ${rm})` : ""}`);
      });
      if (w.note) lines.push(`- заметка: ${w.note}`);
    });
    setExportText(lines.join("\n")); setCopied(false);
  };

  /** Состояния здоровья — из них берутся предупреждения по всему приложению. */
  const conditions = useMemo(() => profile.conditions || [], [profile.conditions]);

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

  const tabs = [
    { id: "session", label: "Сессия", icon: Play },
    { id: "journal", label: "Журнал", icon: BookOpen },
    { id: "progress", label: "Графики", icon: TrendingUp },
    { id: "base", label: "База", icon: Library },
    { id: "body", label: "Тело", icon: Dumbbell },
  ];

  return (
    <div className="h-dvh w-full flex flex-col" style={{ background: C.bg }}>
      <div className="flex items-center justify-between px-4 pad-safe-top pb-1 shrink-0">
        <h1 className="f-display text-lg font-bold" style={{ color: C.chalk }}>Железный дневник</h1>
        <div className="flex items-center gap-3">
          {session && <button onClick={() => setTab("session")} className="f-body text-[10px] rounded-full px-2 py-0.5" style={{ background: session.paused ? C.mustard : C.red, color: C.chalk }}>{session.paused ? "пауза" : "идёт тренировка"}</button>}
          <button onClick={() => setShowSettings(true)}><Settings size={17} color={C.dim} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "session" && <SessionTab session={session} setSession={setSession} workouts={workouts} days={days} onFinish={finishSession} goToDays={() => { setBaseView("days"); setTab("base"); }} conditions={conditions} restOverrides={restOverrides} setRestOverride={setRestOverride} muted={muted} />}
        {tab === "journal" && <JournalTab workouts={workouts} onDelete={deleteWorkout} onExport={buildExport} onUpdate={updateWorkout} />}
        {tab === "progress" && <ProgressTab workouts={workouts} />}
        {tab === "base" && <BaseTab days={days} setDays={setDays} initialView={baseView} conditions={conditions} />}
        {tab === "body" && <BodyTab metrics={metrics} profile={profile} setProfile={setProfile} onAdd={addMetric} onDelete={deleteMetric} workouts={workouts} />}
      </div>

      <div className="flex shrink-0 pad-safe-bottom" style={{ background: C.surface, borderTop: `1px solid ${C.line}` }}>
        {tabs.map((t) => {
          const Icon = t.icon; const a = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "base") setBaseView(null); }} className="flex-1 flex flex-col items-center gap-0.5 py-2">
              <Icon size={17} color={a ? C.red : C.dim} />
              <span className="f-body text-[9px]" style={{ color: a ? C.chalk : C.dim }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {exportText !== null && (
        <Sheet onClose={() => setExportText(null)}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Выгрузка для Claude</div>
          <div className="f-body text-xs mb-3" style={{ color: C.dim }}>Скопируй и вставь в чат — так я увижу весь дневник и смогу его разобрать.</div>
          <textarea readOnly value={exportText} rows={10} onFocus={(e) => e.target.select()} className="f-num w-full rounded-lg p-2.5 text-[10px] leading-snug" style={{ background: C.bg, color: C.chalk, border: `1px solid ${C.line}` }} />
          <button onClick={async () => { try { await navigator.clipboard.writeText(exportText); setCopied(true); } catch { setCopied(false); } }} className="f-body w-full mt-2 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: copied ? C.moss : C.red, color: C.chalk }}>
            {copied ? <><Check size={15} /> Скопировано</> : <><Copy size={15} /> Скопировать</>}
          </button>
          <button onClick={() => setExportText(null)} className="f-body w-full mt-1 py-3 text-sm" style={{ color: C.dim }}>Закрыть</button>
        </Sheet>
      )}

      {importText !== null && (
        <Sheet onClose={() => { setImportText(null); setImportError(null); }}>
          <div className="f-display text-base font-semibold mb-1" style={{ color: C.chalk }}>Восстановить из копии</div>
          <div className="f-body text-xs mb-3" style={{ color: C.red }}>Текущие записи будут заменены.</div>
          <button onClick={() => fileInput.current?.click()} className="f-body w-full rounded-xl py-3 text-sm font-medium mb-3 flex items-center justify-center gap-2" style={{ background: C.red, color: C.chalk }}>
            <Upload size={15} /> Выбрать файл копии
          </button>
          <div className="f-body text-xs mb-2" style={{ color: C.dim }}>Или вставить текстом:</div>
          <textarea value={importText} onChange={(e) => { setImportText(e.target.value); setImportError(null); }} rows={5} placeholder="Вставь сюда резервную копию…" className="f-num w-full rounded-lg p-2.5 text-[10px]" style={{ background: C.bg, color: C.chalk, border: `1px solid ${C.line}` }} />
          {importError && <div className="f-body text-xs mt-2" style={{ color: C.red }}>{importError}</div>}
          <button onClick={() => doImport(importText)} disabled={!importText.trim()} className="f-body w-full mt-2 rounded-xl py-3 text-sm font-medium" style={{ background: importText.trim() ? C.surfaceHi : C.surface, color: importText.trim() ? C.chalk : C.dim, border: `1px solid ${C.line}` }}>Восстановить из текста</button>
          <button onClick={() => { setImportText(null); setImportError(null); }} className="f-body w-full mt-1 py-3 text-sm" style={{ color: C.dim }}>Отмена</button>
        </Sheet>
      )}

      {showSettings && (
        <Sheet onClose={() => setShowSettings(false)}>
          <div className="f-body text-xs mb-1" style={{ color: C.chalk }}>Дневник хранится прямо на устройстве и работает без интернета.</div>
          <div className="f-body text-[11px] mb-3 flex items-start gap-1.5" style={{ color: storageInfo?.persisted ? C.moss : C.mustard }}>
            <HardDrive size={13} className="shrink-0 mt-0.5" />
            <span>
              {storageInfo?.persisted
                ? "Хранилище закреплено — система не удалит данные сама."
                : "Хранилище не закреплено. Делай копию хотя бы раз в месяц."}
            </span>
          </div>
          <button
            onClick={() => { const next = !muted; setProfile((p) => ({ ...p, muted: next })); if (!next) { primeAudio(); playTick(); } }}
            className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2"
            style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}>
            {muted ? <VolumeX size={15} color={C.dim} /> : <Volume2 size={15} color={C.moss} />}
            Сигнал в конце отдыха: {muted ? "выключен" : "включён"}
          </button>
          <button onClick={saveBackupFile} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Share2 size={15} /> Сохранить копию файлом</button>
          <button onClick={async () => { try { await navigator.clipboard.writeText(backupJSON()); say("Копия в буфере обмена"); } catch { setShowSettings(false); setExportText(backupJSON()); } }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Copy size={15} /> Скопировать копию текстом</button>
          <button onClick={openImport} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><Upload size={15} /> Восстановить из копии</button>
          <button onClick={() => { setDays(DEFAULT_DAYS); setShowSettings(false); say("Дни возвращены к исходным"); }} className="f-body w-full rounded-xl py-3 text-sm mb-2 flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.chalk, border: `1px solid ${C.line}` }}><RotateCcw size={15} /> Сбросить дни к исходным</button>
          <button onClick={wipe} className="f-body w-full rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2" style={{ background: C.surfaceHi, color: C.red, border: `1px solid ${C.line}` }}><Trash2 size={15} /> Удалить все записи</button>
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
