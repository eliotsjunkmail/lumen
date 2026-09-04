/** Seconds to ease from rest size to 2× while the aimed clip plays. */
export const PLAY_GROW_EXPAND_SEC = 2;
/** Faster shrink when the aperture leaves the clip. */
export const PLAY_GROW_SHRINK_SEC = 0.65;

/** 1 while a focused video is actually playing; otherwise 0. */
export function playGrowTarget({ focused, kind, previewing, paused } = {}) {
  return focused && kind !== "image" && previewing && paused === false ? 1 : 0;
}

/** Linear step of the 0…1 grow amount. */
export function stepPlayGrow(
  current,
  target,
  dt,
  expandSec = PLAY_GROW_EXPAND_SEC,
  shrinkSec = PLAY_GROW_SHRINK_SEC
) {
  const cur = Number.isFinite(current) ? current : 0;
  const tgt = target >= 0.5 ? 1 : 0;
  if (!(dt > 0) || cur === tgt) return cur;
  const sec = tgt > cur ? expandSec : shrinkSec;
  if (!(sec > 0)) return tgt;
  const next = cur + Math.sign(tgt - cur) * (dt / sec);
  if (tgt > cur) return Math.min(1, next);
  return Math.max(0, next);
}

/** Scale multiplier: 1 at rest, 2 when fully grown. */
export function playGrowScale(playGrow) {
  const t = Math.min(1, Math.max(0, Number(playGrow) || 0));
  return 1 + t;
}
