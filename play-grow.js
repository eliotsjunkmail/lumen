/** Seconds to ease from rest size to the focused scale. */
export const PLAY_GROW_EXPAND_SEC = 2;
/** Faster shrink when the aperture leaves the clip. */
export const PLAY_GROW_SHRINK_SEC = 0.65;
/** Focused video size relative to rest (width and height). */
export const PLAY_GROW_MAX = 1.5;

/** 1 while a video is in the viewfinder; otherwise 0. */
export function playGrowTarget({ focused, kind } = {}) {
  return focused && kind !== "image" ? 1 : 0;
}

/** Layout width/height including the current grow amount. */
export function layoutSizeWithGrow(base, playGrow) {
  return (Number(base) || 0) * playGrowScale(playGrow);
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

/** Scale multiplier: 1 at rest, PLAY_GROW_MAX when fully grown. */
export function playGrowScale(playGrow) {
  const t = Math.min(1, Math.max(0, Number(playGrow) || 0));
  return 1 + (PLAY_GROW_MAX - 1) * t;
}
