/* Сигнал окончания отдыха.

   Звук синтезируется на месте, а не проигрывается из файла: ничего не нужно
   докачивать, сборка не толстеет, и в офлайне всё работает.

   iOS не даёт запустить звук без действия пользователя, поэтому контекст
   создаётся при первом касании — им становится отметка выполненного подхода,
   которая как раз и запускает отдых. */

let ctx = null;
let unlocked = false;

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

/** Вызывать из обработчика касания — иначе iOS не разрешит звук. */
export function primeAudio() {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  if (unlocked) return;
  /* беззвучный импульс снимает блокировку в Safari */
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
}

/** Три восходящих сигнала — отдых закончился. */
export function playRestOver(volume = 0.25) {
  const c = context();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t = c.currentTime + 0.02;
  [880, 1108, 1318].forEach((f, i) => tone(c, f, t + i * 0.16, 0.13, volume));
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    /* вибрации на iOS нет — не беда */
  }
}

/** Короткий тик за 3 секунды до конца. */
export function playTick(volume = 0.12) {
  const c = context();
  if (!c) return;
  tone(c, 660, c.currentTime + 0.01, 0.06, volume);
}
