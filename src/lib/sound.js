/* Сигнал окончания отдыха.

   На iPhone тут две ловушки, и обе обходятся.

   1. Аппаратный переключатель «без звука» глушит Web Audio наглухо.
      Обход: держать проигрываемый втихую аудиоэлемент. Пока он играет,
      система считает страницу медиапроигрывателем и пускает звук мимо
      переключателя — тем же путём, которым играет музыка.

   2. Когда приложение уходит в фон, таймеры JavaScript замирают, и сигнал
      «по тику» просто не наступает. Обход: планировать звук заранее,
      средствами самого Web Audio. Он отсчитывает время собственными
      часами и срабатывает независимо от того, крутится ли JavaScript.

   Звук синтезируется на месте — ничего не нужно докачивать, офлайн работает. */

let ctx = null;
let unlocked = false;
let keeper = null;
let scheduled = [];

function context() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  return ctx;
}

/** Короткий беззвучный WAV — им удерживается медиасессия. */
function silentWavUrl(seconds = 0.5) {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const ascii = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));

  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // моно
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); // 8 бит
  ascii(36, "data");
  v.setUint32(40, samples, true);
  /* в 8-битном PCM тишина — это 128, а не 0 */
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);

  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function startKeeper() {
  if (keeper) return;
  try {
    keeper = new Audio(silentWavUrl());
    keeper.loop = true;
    keeper.playsInline = true;
    /* не ноль: при нулевой громкости Safari может не открыть медиасессию */
    keeper.volume = 0.001;
    keeper.play().catch(() => {});
  } catch {
    keeper = null;
  }
}

/** Вызывать из обработчика касания — иначе iOS не разрешит звук. */
export function primeAudio() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  startKeeper();
  if (unlocked) return;
  try {
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(c.destination);
    const o = c.createOscillator();
    o.connect(g);
    o.start();
    o.stop(c.currentTime + 0.01);
    unlocked = true;
  } catch {
    /* не вышло — просто останемся без звука */
  }
}

/** Доступен ли звук: контекст создан и не заблокирован системой. */
export const audioReady = () => !!ctx && ctx.state === "running";

function tone(c, freq, startAt, dur, volume) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  /* плавные фронты — иначе на телефоне слышен щелчок */
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(volume, startAt + 0.015);
  g.gain.setValueAtTime(volume, startAt + dur - 0.03);
  g.gain.linearRampToValueAtTime(0, startAt + dur);
  o.connect(g);
  g.connect(c.destination);
  o.start(startAt);
  o.stop(startAt + dur + 0.02);
  return o;
}

const CHORD = [880, 1108, 1318];

/** Отменить всё, что было запланировано ранее. */
export function cancelScheduled() {
  scheduled.forEach((o) => {
    try {
      o.stop();
      o.disconnect();
    } catch {
      /* уже отзвучал */
    }
  });
  scheduled = [];
}

/**
 * Запланировать сигнал окончания отдыха через delaySec секунд.
 * Заодно ставит короткий тик за три секунды до конца.
 */
export function scheduleRestOver(delaySec, volume = 0.25) {
  cancelScheduled();
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  startKeeper();

  const now = c.currentTime;
  const at = now + Math.max(0, delaySec);
  if (delaySec > 3.5) scheduled.push(tone(c, 660, now + delaySec - 3, 0.06, volume * 0.5));
  CHORD.forEach((f, i) => scheduled.push(tone(c, f, at + i * 0.16, 0.13, volume)));
}

/** Сыграть сигнал прямо сейчас — для проверки звука в настройках. */
export function playRestOver(volume = 0.25) {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  CHORD.forEach((f, i) => tone(c, f, t + i * 0.16, 0.13, volume));
  vibrate();
}

export function vibrate() {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* вибрации на iOS нет — не беда */
  }
}

/** Отпустить медиасессию: тренировка закончилась, держать её незачем. */
export function releaseAudio() {
  cancelScheduled();
  if (keeper) {
    try {
      keeper.pause();
      if (keeper.src.startsWith("blob:")) URL.revokeObjectURL(keeper.src);
    } catch {
      /* ничего */
    }
    keeper = null;
  }
}
