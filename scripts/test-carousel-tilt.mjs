import {
  carouselTiltAmount,
  carouselRowShiftY,
  carouselRowSpan,
  carouselDragLiftDelta,
  carouselRelativePitch,
} from "../carousel-tilt.js";

if (carouselTiltAmount(0, 0.2) !== 0) {
  throw new Error("horizon should keep the bottom row");
}
if (carouselTiltAmount(0.15, 0.2) !== 0) {
  throw new Error("leaning forward should stay on the bottom row");
}
if (Math.abs(carouselTiltAmount(-0.2, 0.2) - 1) > 1e-9) {
  throw new Error("full look-up should reach the top row");
}
if (Math.abs(carouselTiltAmount(-0.1, 0.2) - 0.5) > 1e-9) {
  throw new Error("halfway look-up should sit between rows");
}
if (carouselTiltAmount(-1, 0.2) !== 1) {
  throw new Error("extra look-up should clamp to the top row");
}
if (Math.abs(carouselTiltAmount(-0.1, 0.2, 2) - 1) > 1e-9) {
  throw new Error("tilt gain should reach the top row with less lean");
}
if (Math.abs(carouselTiltAmount(-0.05, 0.2, 2) - 0.5) > 1e-9) {
  throw new Error("tilt gain should scale look-up travel");
}

const camY = 1.4;
const bottomY = 1.0;
const topY = 2.4;
if (Math.abs(carouselRowShiftY(camY, bottomY, topY, 0) - (camY - bottomY)) > 1e-9) {
  throw new Error("t=0 should center the bottom row");
}
if (Math.abs(carouselRowShiftY(camY, bottomY, topY, 1) - (camY - topY)) > 1e-9) {
  throw new Error("t=1 should center the top row");
}

const span = carouselRowSpan(1.0, 2.4, 6.2);
if (!(span > 0.15 && span < 0.3)) {
  throw new Error(`row span should be a small lean, got ${span}`);
}

if (carouselDragLiftDelta(-0.2) <= 0) {
  throw new Error("finger-up should lift the ring");
}
if (carouselDragLiftDelta(0.2) >= 0) {
  throw new Error("finger-down should lower the ring");
}
if (carouselDragLiftDelta(-80) !== 80) {
  throw new Error("drag lift should invert screen dy");
}

if (carouselRelativePitch(0.18, 0.18) !== 0) {
  throw new Error("initial phone tilt should be the home pose");
}
if (Math.abs(carouselRelativePitch(-0.05, 0.15) - -0.2) > 1e-9) {
  throw new Error("tilting up from the start pose should be relative");
}
if (carouselTiltAmount(carouselRelativePitch(0.2, 0.2), 0.2) !== 0) {
  throw new Error("opening while looking down should keep the bottom row");
}
if (Math.abs(carouselTiltAmount(carouselRelativePitch(-0.05, 0.15), 0.2) - 1) > 1e-9) {
  throw new Error("looking up from a down start should reach the top row");
}
if (carouselRelativePitch(0.1, null) !== 0) {
  throw new Error("no baseline should hold the home view");
}

function carouselDropShiftY(y, drop = -0.2) {
  return y - drop;
}
if (carouselDropShiftY(1.4) <= 1.4) {
  throw new Error("default carousel should sit slightly above camera height");
}
if (Math.abs(carouselDropShiftY(1.4, -0.2) - 1.6) > 1e-9) {
  throw new Error("negative drop should raise clips with the viewfinder");
}

function defaultVideoSize(stored) {
  if (stored === "large" || stored === "small") return stored;
  return "small";
}
if (defaultVideoSize(null) !== "small") throw new Error("new users should get small clips");
if (defaultVideoSize("large") !== "large") throw new Error("saved large should stick");
if (defaultVideoSize("small") !== "small") throw new Error("saved small should stick");

function nodePosterReady(node) {
  if (!node || node.kind === "image") return true;
  if (node.posterFailed) return true;
  if (!node.posterSrc && !node.storagePath && !node.thumbUrl) return true;
  return Boolean(node.posterTex);
}
if (!nodePosterReady({ kind: "image" })) throw new Error("creations need no poster wait");
if (nodePosterReady({ kind: "video", storagePath: "x", posterTex: null })) {
  throw new Error("cloud clips should wait for a poster");
}
if (!nodePosterReady({ kind: "video", storagePath: "x", posterTex: {} })) {
  throw new Error("loaded poster should clear the spinner");
}

console.log("carousel-tilt tests passed");
