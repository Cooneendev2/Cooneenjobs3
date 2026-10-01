/* A pausable repeating timer for page / slide rotation.
   - one timer at a time, so nothing piles up on a screen that runs for weeks;
   - "holds" (user paused, tab hidden, ...) freeze the countdown and resume with the time that was left. */

export function createRotator(onTick) {
  let timer = 0;
  let interval = 0;
  let due = 0;
  let left = 0;
  const holds = new Set();

  function fire() {
    timer = 0;
    try { onTick(); } finally { arm(interval); }
  }
  function arm(delay) {
    window.clearTimeout(timer);
    timer = 0;
    if (!interval) return;
    left = delay;
    due = Date.now() + delay;
    if (!holds.size) timer = window.setTimeout(fire, delay);
  }

  return {
    start(ms) { interval = ms; arm(ms); },
    /* Start the countdown again from the full interval (after someone pages manually). */
    restart() { if (interval) arm(interval); },
    hold(reason) {
      if (holds.has(reason)) return;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
        left = Math.max(0, due - Date.now());
      }
      holds.add(reason);
    },
    release(reason) {
      if (!holds.delete(reason)) return;
      if (!holds.size && !timer && interval) {
        due = Date.now() + left;
        timer = window.setTimeout(fire, left);
      }
    },
    isHeld() { return holds.size > 0; },
    stop() {
      window.clearTimeout(timer);
      timer = 0;
      interval = 0;
    },
    destroy() { window.clearTimeout(timer); timer = 0; interval = 0; holds.clear(); }
  };
}
