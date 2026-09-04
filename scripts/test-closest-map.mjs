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

function clipsInTown(nodes, town, cityOf) {
  return nodes.filter((n) => cityOf(n) === town).map((n) => n.id);
}
function availableTowns(nodes, cityOf, extra) {
  const set = new Set(nodes.map(cityOf).filter(Boolean));
  if (extra) set.add(extra);
  return [...set].sort((a, b) => a.localeCompare(b));
}

const townNodes = [
  { id: "w1", city: "Westfield, NJ" },
  { id: "w2", city: "Westfield, NJ" },
  { id: "p1", city: "Portland, ME" },
  { id: "b1", city: "Boston, MA" },
  { id: "c1", city: "Township of Coolbaugh, PA" },
];
const cityOf = (n) => n.city;
const westfield = clipsInTown(townNodes, "Westfield, NJ", cityOf);
if (westfield.join("|") !== "w1|w2") {
  throw new Error(`Westfield should keep only its clips — got ${westfield}`);
}
if (clipsInTown(townNodes, "Boston, MA", cityOf).join("|") !== "b1") {
  throw new Error("Boston should be a single clip");
}
const menu = availableTowns(townNodes, cityOf, "Jersey City, NJ");
if (menu[0] !== "Boston, MA") throw new Error("towns should sort A–Z");
if (
  menu.join("|") !==
  "Boston, MA|Jersey City, NJ|Portland, ME|Township of Coolbaugh, PA|Westfield, NJ"
) {
  throw new Error(`town menu order — got ${menu.join("|")}`);
}
let selectedTown = "Jersey City, NJ";
selectedTown = "Westfield, NJ";
if (clipsInTown(townNodes, selectedTown, cityOf).length !== 2) {
  throw new Error("picking a town should switch the clips");
}
selectedTown = "Jersey City, NJ";
if (clipsInTown(townNodes, selectedTown, cityOf).length !== 0) {
  throw new Error("locate town with no clips should show none");
}

function groupTownsByDistance(nodes, distOf, cityOf) {
  const grouped = new Map();
  for (const n of nodes) {
    const key = cityOf(n);
    let g = grouped.get(key);
    if (!g) {
      g = { key, ids: [], dist: Infinity };
      grouped.set(key, g);
    }
    g.ids.push(n.id);
    const d = distOf(n);
    if (d < g.dist) g.dist = d;
  }
  return [...grouped.values()].sort(
    (a, b) => a.dist - b.dist || a.key.localeCompare(b.key)
  );
}
function defaultOpenTown(groups, userTown) {
  if (userTown && groups.some((g) => g.key === userTown)) return userTown;
  return groups[0]?.key || null;
}
function expandOne(current, next) {
  return next || current;
}

const accordionNodes = [
  { id: "w1", city: "Westfield, NJ", d: 10 },
  { id: "w2", city: "Westfield, NJ", d: 20 },
  { id: "p1", city: "Portland, ME", d: 400 },
  { id: "b1", city: "Boston, MA", d: 250 },
];
const accordion = groupTownsByDistance(
  accordionNodes,
  (n) => n.d,
  cityOf
);
if (accordion.map((g) => g.key).join("|") !== "Westfield, NJ|Boston, MA|Portland, ME") {
  throw new Error(`towns should sort closest first — got ${accordion.map((g) => g.key)}`);
}
if (accordion[0].ids.join("|") !== "w1|w2") {
  throw new Error("closest town should keep its clips together");
}
if (defaultOpenTown(accordion, "Westfield, NJ") !== "Westfield, NJ") {
  throw new Error("current town should start expanded");
}
if (defaultOpenTown(accordion, "Nowhere") !== "Westfield, NJ") {
  throw new Error("missing current town should fall back to closest");
}
let openTown = defaultOpenTown(accordion, "Westfield, NJ");
openTown = expandOne(openTown, "Boston, MA");
if (openTown !== "Boston, MA") throw new Error("expanding a town should close the others");
openTown = expandOne(openTown, "Portland, ME");
if (openTown !== "Portland, ME") throw new Error("only one town should stay open");

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

function viewClips(nodes, selectedTown, cityOf, cap = 20) {
  if (!selectedTown) return nodes.slice(0, cap);
  return nodes.filter((n) => cityOf(n) === selectedTown);
}

const townMany = Array.from({ length: 25 }, (_, i) => ({
  id: `w${i}`,
  city: "Westfield, NJ",
}));
const westfieldAll = viewClips(townMany, "Westfield, NJ", (n) => n.city, 20);
if (westfieldAll.length !== 25) {
  throw new Error("selected town should keep every clip in the carousel");
}
if (viewClips(townMany, null, (n) => n.city, 20).length !== 20) {
  throw new Error("no town filter still caps at closest 20");
}

function yawDeltaToTarget(fromX, fromZ, toX, toZ) {
  const fl = Math.hypot(fromX, fromZ);
  const tl = Math.hypot(toX, toZ);
  if (fl < 1e-6 || tl < 1e-6) return 0;
  const fx = fromX / fl;
  const fz = fromZ / fl;
  const tx = toX / tl;
  const tz = toZ / tl;
  const fromYaw = Math.atan2(-fx, -fz);
  const toYaw = Math.atan2(-tx, -tz);
  let delta = toYaw - fromYaw;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

const lookRight = yawDeltaToTarget(0, -1, 1, 0);
if (Math.abs(lookRight - -Math.PI / 2) > 1e-9) {
  throw new Error(`looking +X from -Z should yaw -90deg — got ${lookRight}`);
}
const lookSame = yawDeltaToTarget(0, -1, 0, -4);
if (Math.abs(lookSame) > 1e-9) {
  throw new Error("already facing the clip should not yaw");
}

console.log("closest-map tests passed");
