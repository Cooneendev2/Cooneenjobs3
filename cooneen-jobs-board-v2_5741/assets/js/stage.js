/* Stage: the one element that holds the whole display.
   - sizes it to the window (swapping width and height when ?rotate=90 or 270),
   - applies the rotation,
   - works out the scale unit --d ("one design pixel" as a real length) so nothing is hard-coded:
       signage modes: 1 design px = (smaller screen side) / 1080
       widget:        scaled to a ~460 x 520 panel
       ticker:        scaled to a 120 px high strip
   - decides landscape / portrait (or obeys ?orientation=). */

export function createStage(options) {
  const stageEl = options.stageEl;
  const cfg = options.cfg;
  const subscribers = new Set();
  const info = { W: 0, H: 0, vw: 0, vh: 0, s: 1, dpr: 1, orientation: 'landscape', rotate: cfg.rotate };
  let timer = 0;

  function measure() {
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const rot = cfg.rotate;
    const swap = rot === 90 || rot === 270;
    const W = swap ? vh : vw;
    const H = swap ? vw : vh;

    let s;
    if (cfg.layout === 'widget') s = Math.max(0.72, Math.min(W / 460, H / 520));
    else if (cfg.layout === 'ticker') s = Math.min(H / 120, W / 1000);
    else s = Math.min(W, H) / 1080;
    s = Math.min(6, Math.max(0.2, s));

    const orientation = cfg.orientation !== 'auto' ? cfg.orientation : (W >= H ? 'landscape' : 'portrait');
    const changed = W !== info.W || H !== info.H || s !== info.s || orientation !== info.orientation;

    info.vw = vw; info.vh = vh; info.W = W; info.H = H; info.s = s; info.orientation = orientation;
    info.dpr = window.devicePixelRatio || 1;

    stageEl.style.width = W + 'px';
    stageEl.style.height = H + 'px';
    /* Rotation is about the top-left corner, then the stage is slid back into view. */
    let transform = 'none';
    if (rot === 90) transform = 'translate(' + vw + 'px, 0px) rotate(90deg)';
    else if (rot === 180) transform = 'translate(' + vw + 'px, ' + vh + 'px) rotate(180deg)';
    else if (rot === 270) transform = 'translate(0px, ' + vh + 'px) rotate(270deg)';
    stageEl.style.transform = transform;
    stageEl.style.setProperty('--d', s + 'px');
    stageEl.style.setProperty('--fs', String(cfg.fontscale));
    stageEl.setAttribute('data-orientation', orientation);
    return changed;
  }

  function notify() {
    subscribers.forEach((fn) => { try { fn(info); } catch (err) { if (window.console) window.console.error(err); } });
  }

  function onResize() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { if (measure()) notify(); }, 120);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  measure();

  return {
    info,
    measure,
    onChange(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
    destroy() {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      subscribers.clear();
    }
  };
}
