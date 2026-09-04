/** Map look-down-positive pitch to 0 (bottom row) … 1 (top row). */
export function carouselTiltAmount(pitch, span) {
  if (!(span > 1e-6)) return 0;
  return Math.min(1, Math.max(0, -pitch / span));
}

/** Vertical shift so t=0 centers the bottom row on the camera, t=1 the top. */
export function carouselRowShiftY(camY, bottomY, topY, t) {
  const shiftBottom = camY - bottomY;
  const shiftTop = camY - topY;
  const k = Math.min(1, Math.max(0, t));
  return shiftBottom + (shiftTop - shiftBottom) * k;
}

export function carouselRowSpan(bottomY, topY, dist) {
  const rise = Math.abs(topY - bottomY);
  if (!(dist > 0.2) || rise < 0.05) return 0;
  return Math.atan2(rise, dist);
}

/**
 * Finger-up is negative screen dy. Return a pitch delta that slides the
 * ring the same way so the carousel follows the finger.
 */
export function carouselDragPitchDelta(screenDy) {
  return -screenDy;
}
