const CAROUSEL_DIST_M = 4.4;
const CAROUSEL_GAP_M = 0.42;

function carouselChordAngle(width, radius) {
  const half = Math.max(0, width) * 0.5;
  if (radius <= 1e-6) return Math.PI;
  return 2 * Math.asin(Math.min(0.999, half / radius));
}

function carouselRingLayout(widths, distM = CAROUSEL_DIST_M, gapM = CAROUSEL_GAP_M) {
  const n = widths.length;
  if (!n) return { radius: distM, angles: [] };

  let radius = Math.max(0.5, distM);
  let itemAng = [];
  let gapAng = 0;
  let needed = 0;
  for (let i = 0; i < 12; i += 1) {
    itemAng = widths.map((w) => carouselChordAngle(w, radius));
    gapAng = gapM / radius;
    needed = itemAng.reduce((s, a) => s + a, 0) + n * gapAng;
    if (needed <= Math.PI * 2 + 1e-6) break;
    radius *= needed / (Math.PI * 2);
  }

  const extra = Math.max(0, (Math.PI * 2 - needed) / n);
  const angles = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    cursor += itemAng[i] * 0.5;
    angles.push(cursor);
    cursor += itemAng[i] * 0.5 + gapAng + extra;
  }
  const mid = (angles[0] + angles[n - 1]) * 0.5;
  for (let i = 0; i < n; i += 1) angles[i] -= mid;
  return { radius, angles };
}

function pointOnCarouselRing(alpha, radius, originX, originZ, fx, fz, rx, rz) {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return {
    x: originX + (fx * ca + rx * sa) * radius,
    z: originZ + (fz * ca + rz * sa) * radius,
  };
}

const empty = carouselRingLayout([]);
if (empty.angles.length !== 0) throw new Error("empty ring");

const one = carouselRingLayout([1.65]);
if (Math.abs(one.angles[0]) > 1e-9) throw new Error("single clip should sit on heading");
if (one.radius !== CAROUSEL_DIST_M) throw new Error("single clip keeps base radius");

const many = carouselRingLayout(Array(8).fill(1.65));
if (many.angles.length !== 8) throw new Error("8 angles");
if (Math.abs(many.angles[0] + many.angles[7]) > 1e-6) {
  throw new Error("ring should be centered on heading");
}
const wrap = many.angles[0] + Math.PI * 2 - many.angles[7];
const step = many.angles[1] - many.angles[0];
if (Math.abs(wrap - step) > 1e-5) throw new Error("clips should surround a full circle");

const fx = 0;
const fz = -1;
const rx = 1;
const rz = 0;
const pts = many.angles.map((a) =>
  pointOnCarouselRing(a, many.radius, 0, 0, fx, fz, rx, rz)
);
for (const p of pts) {
  const d = Math.hypot(p.x, p.z);
  if (Math.abs(d - many.radius) > 1e-6) throw new Error("clip left the circle");
}
const xs = pts.map((p) => p.x);
if (Math.min(...xs) >= -0.5 || Math.max(...xs) <= 0.5) {
  throw new Error("ring should place clips on both sides of the viewer");
}
const zs = pts.map((p) => p.z);
if (Math.min(...zs) >= -0.5 || Math.max(...zs) <= 0.5) {
  throw new Error("ring should place clips in front of and behind the viewer");
}

const packed = carouselRingLayout(Array(12).fill(2.4), 4.4, 0.42);
if (packed.radius < CAROUSEL_DIST_M - 1e-9) throw new Error("overflow should not shrink");
for (let i = 1; i < packed.angles.length; i += 1) {
  const gap = packed.angles[i] - packed.angles[i - 1];
  if (gap <= 0) throw new Error("angles must increase around the ring");
}

const yearMid = (packed.angles[0] + packed.angles[2]) * 0.5;
if (yearMid <= packed.angles[0] || yearMid >= packed.angles[2]) {
  throw new Error("year mark should sit between the year group");
}

console.log("carousel-ring tests passed");
