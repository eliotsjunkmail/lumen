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

const at4ft = cameraScale(1.22);
if (at4ft > 0.6) throw new Error(`4 ft video still too large: ${at4ft}`);
if (cameraScale(3.2) < 0.99) throw new Error("3.2 m should stay full size");

const row = spreadOffsets(3);
if (Math.abs(row[1]) > 1e-9) throw new Error("middle clip should stay centered");
if (Math.abs(row[2] - row[0] - 4.1) > 1e-9) throw new Error("row spacing");

console.log("closest-map tests passed");
