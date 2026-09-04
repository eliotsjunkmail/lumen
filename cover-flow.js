/** Slot 3 nearby clips into a cover-flow: closest center, 2nd left, 3rd right. */
export function coverFlowSlots(spots, origin, distanceMeters, limit = 3) {
  const ranked = (spots || []).slice();
  if (origin && typeof distanceMeters === "function") {
    ranked.sort(
      (a, b) =>
        distanceMeters(origin.lat, origin.lng, a.lat, a.lng) -
        distanceMeters(origin.lat, origin.lng, b.lat, b.lng)
    );
  }
  const nearest = ranked.slice(0, limit);
  return {
    left: nearest[1] || null,
    center: nearest[0] || null,
    right: nearest[2] || null,
  };
}
