const CAROUSEL_DIST_M = 6.2;
const CAROUSEL_GAP_M = 0.12;
const CAROUSEL_PACK = 1.04;

function carouselChordAngle(width, radius) {
  const half = Math.max(0, width) * 0.5;
  if (radius <= half + 1e-4) return Math.PI;
  return 2 * Math.atan(half / radius);
}

function carouselRingLayout(widths, distM = CAROUSEL_DIST_M, gapM = CAROUSEL_GAP_M) {
  const n = widths.length;
  if (!n) return { radius: distM, angles: [] };

  const packed = widths.map((w) => Math.max(0.4, w * CAROUSEL_PACK));
  let radius = Math.max(0.5, distM, Math.max(...packed) * 0.55);
  let itemAng = [];
  let gapAng = 0;
  let needed = 0;
  let wrap = false;
  for (let i = 0; i < 16; i += 1) {
    itemAng = packed.map((w) => carouselChordAngle(w, radius));
    gapAng = gapM / radius;
    const closed = itemAng.reduce((s, a) => s + a, 0) + n * gapAng;
    wrap = closed > Math.PI * 2 + 1e-6;
    needed = wrap
      ? closed
      : itemAng.reduce((s, a) => s + a, 0) + Math.max(0, n - 1) * gapAng;
    if (needed <= Math.PI * 2 + 1e-6) break;
    radius *= needed / (Math.PI * 2);
  }

  const angles = [];
  let cursor = 0;
  for (let i = 0; i < n; i += 1) {
    cursor += itemAng[i] * 0.5;
    angles.push(cursor);
    cursor += itemAng[i] * 0.5;
    if (i < n - 1 || wrap) cursor += gapAng;
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

function assertNoOverlap(widths, radius, angles) {
  const n = widths.length;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const halfI = Math.atan(widths[i] * 0.5 / radius);
    const halfJ = Math.atan(widths[j] * 0.5 / radius);
    let delta = angles[j] - angles[i];
    if (delta <= 0) delta += Math.PI * 2;
    if (delta + 1e-4 < halfI + halfJ) {
      throw new Error(
        `clips ${i} and ${j} overlap: delta=${delta.toFixed(3)} need=${(halfI + halfJ).toFixed(3)} r=${radius.toFixed(2)}`
      );
    }
  }
}

const empty = carouselRingLayout([]);
if (empty.angles.length !== 0) throw new Error("empty ring");

const one = carouselRingLayout([1.65]);
if (Math.abs(one.angles[0]) > 1e-9) throw new Error("single clip should sit on heading");

const many = carouselRingLayout(Array(8).fill(1.65));
if (many.angles.length !== 8) throw new Error("8 angles");
if (Math.abs(many.angles[0] + many.angles[7]) > 1e-6) {
  throw new Error("ring should be centered on heading");
}
assertNoOverlap(Array(8).fill(1.65), many.radius, many.angles);

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

const twenty = carouselRingLayout(Array(20).fill(5.4));
if (twenty.angles.length !== 20) throw new Error("20 angles");
assertNoOverlap(Array(20).fill(5.4), twenty.radius, twenty.angles);

const mixed = carouselRingLayout([2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4]);
assertNoOverlap([2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4, 2.8, 5.4], mixed.radius, mixed.angles);

const three = carouselRingLayout([5.4, 5.4, 5.4]);
const neighbor = three.angles[1] - three.angles[0];
const evenSpread = (2 * Math.PI) / 3;
if (neighbor > evenSpread * 0.7) {
  throw new Error("leftover ring must not become horizontal gap between clips");
}
const half = Math.atan((5.4 * 0.5) / three.radius);
if (neighbor + 1e-4 < 2 * half) {
  throw new Error("tight pack still must not overlap");
}

function carouselForwardMidAngle(a, b) {
  let d = b - a;
  while (d < 0) d += Math.PI * 2;
  while (d >= Math.PI * 2) d -= Math.PI * 2;
  return a + d * 0.5;
}

const between = carouselForwardMidAngle(-0.4, 0.6);
if (Math.abs(between - 0.1) > 1e-9) throw new Error("year should sit in the gap");
const wrap = carouselForwardMidAngle(2.5, -2.5);
if (wrap < 2.5 && wrap > -2.5) throw new Error("wrap gap should sit behind the seam");

const years = [2011, 2011, 2014, 2014, 2015];
const layout = carouselRingLayout(Array(years.length).fill(2.8));
const groups = [];
years.forEach((year, i) => {
  const last = groups[groups.length - 1];
  if (last && last.year === year) last.indices.push(i);
  else groups.push({ year, indices: [i] });
});
const yearAlphas = groups.map((group, i) => {
  const prev = groups[(i + groups.length - 1) % groups.length];
  const aPrev = layout.angles[prev.indices[prev.indices.length - 1]];
  const aThis = layout.angles[group.indices[0]];
  return carouselForwardMidAngle(aPrev, aThis);
});
if (yearAlphas.length !== 3) throw new Error("one mark per year");
const first2014 = layout.angles[2];
const last2011 = layout.angles[1];
if (!(yearAlphas[1] > last2011 && yearAlphas[1] < first2014)) {
  throw new Error("2014 should sit between 2011 clips and 2014 clips");
}

function carouselPairColumns(nodes) {
  const cols = [];
  for (let i = 0; i < nodes.length; i += 2) {
    cols.push(nodes.slice(i, i + 2));
  }
  return cols;
}
function stackedRowY(bottomH, topH, gap = 0.24, floor = 0.05) {
  return {
    bottom: floor + bottomH * 0.5,
    top: floor + bottomH + gap + topH * 0.5,
  };
}
const four = ["a", "b", "c", "d"];
const pairs = carouselPairColumns(four);
if (pairs.length !== 2 || pairs[0].join("|") !== "a|b" || pairs[1].join("|") !== "c|d") {
  throw new Error("small size should pack clips into 2-high columns");
}
const odd = carouselPairColumns(["a", "b", "c"]);
if (odd.length !== 2 || odd[1].join("|") !== "c") {
  throw new Error("odd clip should sit alone in the last column");
}
const ys = stackedRowY(1.96, 1.96);
if (!(ys.top > ys.bottom + 1.96)) {
  throw new Error("top row should sit fully above the bottom row");
}
if (Math.abs(ys.bottom - 1.03) > 0.02) {
  throw new Error("bottom row should rest on the floor");
}
const largeCols = four.map((id) => [id]);
if (largeCols.length !== 4) throw new Error("large size stays one row");

console.log("carousel-ring tests passed");
