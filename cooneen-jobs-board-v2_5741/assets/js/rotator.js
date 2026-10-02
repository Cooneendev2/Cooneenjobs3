/* A pausable repeating timer for page / slide rotation.
   - one timer at a time, so nothing piles up on a screen that runs for weeks;
   - "holds" (user paused, tab hidden, ...) freeze the countdown and resume with the time that was left;
   - state() says how far through the current countdown it is, so the progress bar is DRAWN FROM THIS CLOCK and cannot
     drift away from the rotation (a separate CSS animation did, whenever a hidden tab missed its pause).
   onChange (optional) is called after start / restart / hold / release, i.e. whenever the countdown is reset or frozen. */

export function createRotator(onTick, onChange) {
  let timer = 0;
  let interval = 0;
  let due = 0;
  let left = 0;
  const holds = new Set();

  function changed() { if (onChange) onChange(); }

  function fire() {
    timer = 0;
    arm(interval);          /* next countdown first, so state() is already right while the new slide is built */
    onTick();
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
    start(ms) { interval = ms; arm(ms); changed(); },
    /* Start the countdown again from the full interval (after someone pages manually). */
    restart() { if (interval) { arm(interval); changed(); } },
    hold(reason) {
      if (holds.has(reason)) return;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
        left = Math.max(0, due - Date.now());
      }
      holds.add(reason);
      changed();
    },
    release(reason) {
      if (!holds.delete(reason)) return;
      if (!holds.size && !timer && interval) {
        due = Date.now() + left;
        timer = window.setTimeout(fire, left);
      }
      changed();
    },
    isHeld() { return holds.size > 0; },
    /* { interval, elapsed, held } in milliseconds; interval 0 means nothing is rotating. */
    state() {
      if (!interval) return { interval: 0, elapsed: 0, held: true };
      const remaining = holds.size ? left : Math.max(0, due - Date.now());
      return { interval, elapsed: Math.min(interval, Math.max(0, interval - remaining)), held: holds.size > 0 };
    },
    stop() {
      window.clearTimeout(timer);
      timer = 0;
      interval = 0;
    },
    destroy() { window.clearTimeout(timer); timer = 0; interval = 0; holds.clear(); }
  };
}
