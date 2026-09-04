import {
  hashSeed,
  mulberry32,
  pointInPolygon,
  vintageInnerPath,
} from "../vintage-border.js";

if (hashSeed("westfield") === hashSeed("jersey")) {
  throw new Error("different strings should hash differently");
}
if (hashSeed("lumen") !== hashSeed("lumen")) {
  throw new Error("hash should be stable");
}

const a = mulberry32(7);
const b = mulberry32(7);
if (a() !== b()) throw new Error("same seed should match");

const w = 800;
const h = 500;
const path = vintageInnerPath(w, h, 11);
if (path.length < 80) throw new Error("path should sample every edge");

for (const p of path) {
  if (p.x < 1 || p.y < 1 || p.x > w - 1 || p.y > h - 1) {
    throw new Error(`path escaped canvas: ${p.x},${p.y}`);
  }
}

if (!pointInPolygon(w / 2, h / 2, path)) {
  throw new Error("photo center must sit in the hole");
}
if (pointInPolygon(2, 2, path)) {
  throw new Error("outer corner must stay in the black border");
}

const other = vintageInnerPath(w, h, 99);
const drift = path.reduce((sum, p, i) => {
  const q = other[i];
  if (!q) return sum + 10;
  return sum + Math.hypot(p.x - q.x, p.y - q.y);
}, 0);
if (drift < 40) throw new Error("different seeds should change the edge");

const xs = path.map((p) => p.x);
const right = Math.max(...xs);
const left = Math.min(...xs);
if (right - left < w * 0.7) throw new Error("hole should keep most of the photo");

console.log("vintage-border tests passed");
