function closest(nodes, user, limit) {
  return nodes
    .map((n) => ({
      n,
      d: Math.hypot(n.lat - user.lat, n.lng - user.lng),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ n }) => n.id);
}

function cameraScale(dist, h = 1.65) {
  const maxH = Math.min(h, Math.max(0.7, dist * 0.7));
  return Math.min(1, Math.max(0.32, maxH / h));
}

function spreadOffsets(count, gap = 2.05) {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => (i - mid) * gap);
}

const user = { lat: 40.71, lng: -74.0 };
const nodes = [
  { id: "nyc", lat: 40.72, lng: -74.0 },
  { id: "philly", lat: 39.95, lng: -75.16 },
  { id: "portland", lat: 43.66, lng: -70.25 },
  { id: "bar", lat: 44.39, lng: -68.21 },
  { id: "boston", lat: 42.36, lng: -71.06 },
];
const near = closest(nodes, user, 2);
if (near[0] !== "nyc" || near[1] !== "philly") {
  throw new Error(`closest 2 should be nyc, philly — got ${near}`);
}
const many = Array.from({ length: 30 }, (_, i) => ({
  id: `n${i}`,
  lat: 40.71 + i * 0.01,
  lng: -74.0,
}));
if (closest(many, user, 10).length !== 10) throw new Error("radar 10");
if (closest(many, user, 20).length !== 20) throw new Error("map 20");
if (closest(many, user, 10)[0] !== "n0") throw new Error("closest first");

const at4ft = cameraScale(1.22);
if (at4ft > 0.6) throw new Error(`4 ft video still too large: ${at4ft}`);
if (cameraScale(3.2) < 0.99) throw new Error("3.2 m should stay full size");

const row = spreadOffsets(3);
if (Math.abs(row[1]) > 1e-9) throw new Error("middle clip should stay centered");
if (Math.abs(row[2] - row[0] - 4.1) > 1e-9) throw new Error("row spacing");

function withinRange(nodes, user, rangeM, distFn) {
  return nodes.filter((n) => distFn(user, n) <= rangeM).map((n) => n.id);
}

const RANGE_M = 150 * 0.3048;
const meters = (a, b) => {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
};
const ranged = [
  { id: "here", lat: 40.71, lng: -74.0 },
  { id: "near", lat: 40.7103, lng: -74.0 }, // ~33 m / 109 ft
  { id: "far", lat: 40.72, lng: -74.0 }, // ~1.1 km
];
const inside = withinRange(ranged, user, RANGE_M, meters);
if (!inside.includes("here") || !inside.includes("near") || inside.includes("far")) {
  throw new Error(`150 ft filter failed: ${inside}`);
}

function clampRange(value, min = 25, max = 1000, step = 25) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  const stepped = Math.round(n / step) * step;
  return Math.min(max, Math.max(min, stepped));
}
if (clampRange(100) !== 100) throw new Error("default 100");
if (clampRange(12) !== 25) throw new Error("min 25");
if (clampRange(5000) !== 1000) throw new Error("max 1000");
if (clampRange(87) !== 75) throw new Error("step 25");

console.log("closest-map tests passed");
