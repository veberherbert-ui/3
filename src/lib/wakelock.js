import { useEffect } from "react";

/* Не даём экрану гаснуть во время тренировки.

   Система снимает блокировку сама, когда приложение уходит в фон, поэтому
   её приходится забирать заново при возвращении — иначе после ответа на
   звонок экран снова начнёт гаснуть между подходами.

   Safari умеет это с версии 16.4. Где не умеет — просто ничего не произойдёт. */

export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let lock = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
        lock.addEventListener("release", () => { lock = null; });
      } catch {
        /* батарея на исходе или вкладка неактивна — не критично */
      }
    };

    const onVisible = () => { if (document.visibilityState === "visible" && !lock) acquire(); };

    acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [active]);
}
