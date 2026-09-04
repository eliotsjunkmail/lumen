function closest(nodes, user, limit) {
  const sorted = nodes
    .map((n) => ({
      n,
      d: Math.hypot(n.lat - user.lat, n.lng - user.lng),
    }))
    .sort((a, b) => a.d - b.d)
    .map(({ n }) => n.id);
  return limit == null ? sorted : sorted.slice(0, limit);
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
if (closest(many, user, 20).length !== 20) throw new Error("camera 20");
if (closest(many, user).length !== 30) throw new Error("map pins all");
if (closest(many, user, 10)[0] !== "n0") throw new Error("closest first");

const portland = { lat: 43.66, lng: -70.25 };
const atNyc = closest(nodes, user, 20);
const atPortland = closest(nodes, portland, 20);
if (atNyc[0] === atPortland[0]) {
  throw new Error("map center should change the closest set");
}
if (atPortland[0] !== "portland") {
  throw new Error(`portland origin should pick portland first — got ${atPortland[0]}`);
}
if (JSON.stringify(atNyc) !== JSON.stringify(closest(nodes, user, 20))) {
  throw new Error("camera and list must share the same closest 20");
}

function viewWithCities(
  nodes,
  origin,
  limit,
  addedCities,
  cityOf,
  excludedCities = new Set()
) {
  const closestIds = closest(nodes, origin, limit);
  const out = [];
  const seen = new Set();
  for (const id of closestIds) {
    const n = nodes.find((x) => x.id === id);
    const city = cityOf(n);
    if (city && excludedCities.has(city)) continue;
    out.push(id);
    seen.add(id);
  }
  for (const n of nodes) {
    const city = cityOf(n);
    if (!addedCities.has(city) || excludedCities.has(city)) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push(n.id);
  }
  return out;
}
function selectedCities(nodes, viewIds, cityOf) {
  return new Set(
    nodes.filter((n) => viewIds.includes(n.id)).map((n) => cityOf(n))
  );
}
function cityIsSelected(key, nodes, origin, limit, addedCities, cityOf, excludedCities) {
  if (!key || excludedCities.has(key)) return false;
  if (addedCities.has(key)) return true;
  const closestIds = new Set(closest(nodes, origin, limit));
  return nodes.some((n) => closestIds.has(n.id) && cityOf(n) === key);
}
function toggleCity(key, addedCities, excludedCities, isOn) {
  if (isOn) {
    addedCities.delete(key);
    excludedCities.add(key);
  } else {
    excludedCities.delete(key);
    addedCities.add(key);
  }
}
const cityNodes = [
  { id: "w1", lat: 40.71, lng: -74.0, city: "Westfield, NJ" },
  { id: "w2", lat: 40.711, lng: -74.0, city: "Westfield, NJ" },
  { id: "p1", lat: 43.66, lng: -70.25, city: "Portland, ME" },
  { id: "b1", lat: 42.36, lng: -71.06, city: "Boston, MA" },
];
const cityOf = (n) => n.city;
const added = new Set();
const baseView = viewWithCities(cityNodes, user, 2, added, cityOf);
if (baseView.length !== 2 || baseView.includes("p1")) {
  throw new Error("default view should stay the closest 20 (here 2)");
}
const baseSel = selectedCities(cityNodes, baseView, cityOf);
if (!baseSel.has("Westfield, NJ") || baseSel.has("Portland, ME")) {
  throw new Error("only in-view cities should look selected");
}
added.add("Portland, ME");
const plusPortland = viewWithCities(cityNodes, user, 2, added, cityOf);
if (!plusPortland.includes("w1") || !plusPortland.includes("p1")) {
  throw new Error("selecting a city should add its clips to the view");
}
if (!selectedCities(cityNodes, plusPortland, cityOf).has("Portland, ME")) {
  throw new Error("added city tag should appear selected");
}
added.clear();
const resetView = viewWithCities(cityNodes, user, 2, added, cityOf);
if (resetView.includes("p1") || resetView.length !== 2) {
  throw new Error("locate should reset to the closest set and drop added cities");
}

const excluded = new Set();
if (
  !cityIsSelected(
    "Westfield, NJ",
    cityNodes,
    user,
    2,
    added,
    cityOf,
    excluded
  )
) {
  throw new Error("closest-set cities should start selected");
}
toggleCity(
  "Westfield, NJ",
  added,
  excluded,
  cityIsSelected("Westfield, NJ", cityNodes, user, 2, added, cityOf, excluded)
);
const withoutWestfield = viewWithCities(
  cityNodes,
  user,
  2,
  added,
  cityOf,
  excluded
);
if (withoutWestfield.includes("w1") || withoutWestfield.includes("w2")) {
  throw new Error("deselecting a closest city should drop its clips");
}
if (
  cityIsSelected(
    "Westfield, NJ",
    cityNodes,
    user,
    2,
    added,
    cityOf,
    excluded
  )
) {
  throw new Error("deselected closest city should look off");
}
toggleCity(
  "Westfield, NJ",
  added,
  excluded,
  cityIsSelected("Westfield, NJ", cityNodes, user, 2, added, cityOf, excluded)
);
const westfieldBack = viewWithCities(
  cityNodes,
  user,
  2,
  added,
  cityOf,
  excluded
);
if (!westfieldBack.includes("w1") || !westfieldBack.includes("w2")) {
  throw new Error("selecting a city again should bring its clips back");
}
added.clear();
excluded.clear();
const afterLocate = viewWithCities(cityNodes, user, 2, added, cityOf, excluded);
if (afterLocate.length !== 2 || !afterLocate.includes("w1")) {
  throw new Error("locate should clear added and excluded cities");
}

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

function snapRangeFt(ft) {
  if (ft >= 5280) {
    const miles = Math.round((ft / 5280) * 10) / 10;
    return Math.min(10, Math.max(1, miles)) * 5280;
  }
  if (ft >= 1000) return Math.round(ft / 100) * 100;
  if (ft >= 200) return Math.round(ft / 50) * 50;
  return Math.round(ft / 25) * 25;
}
function clampRange(value, min = 25, max = 52800) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(max, Math.max(min, snapRangeFt(n)));
}
if (clampRange(100) !== 100) throw new Error("default 100");
if (clampRange(12) !== 25) throw new Error("min 25");
if (clampRange(60000) !== 52800) throw new Error("max 10 miles");
if (clampRange(87) !== 75) throw new Error("step 25");
if (clampRange(5280 * 2.24) !== 5280 * 2.2) throw new Error("miles snap");

function pinchFov(startFov, startDist, nowDist, min = 28, max = 78) {
  const next = startFov * (startDist / nowDist);
  return Math.min(max, Math.max(min, next));
}
if (pinchFov(60, 100, 200) >= 60) throw new Error("spread fingers should zoom in");
if (pinchFov(60, 100, 50) <= 60) throw new Error("pinch should zoom out");
if (pinchFov(60, 100, 10) !== 78) throw new Error("fov max");
if (pinchFov(60, 100, 400) !== 28) throw new Error("fov min");

function radarOffset(node, cam, layout) {
  const useGeo =
    layout === "carousel" && node.geoX != null && node.geoZ != null;
  const x = useGeo ? node.geoX : node.x;
  const z = useGeo ? node.geoZ : node.z;
  return { dx: x - cam.x, dz: z - cam.z };
}
const ringNode = { geoX: 18, geoZ: -7, x: 3.1, z: 0.2 };
const cam = { x: 0, z: 0 };
const car = radarOffset(ringNode, cam, "carousel");
if (car.dx !== 18 || car.dz !== -7) {
  throw new Error("carousel radar should use GPS, not the 3D ring");
}
const placed = radarOffset(ringNode, cam, "place");
if (placed.dx !== 3.1 || placed.dz !== 0.2) {
  throw new Error("place radar should follow scene positions");
}

console.log("closest-map tests passed");
