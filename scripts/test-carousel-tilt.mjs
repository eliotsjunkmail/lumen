import {
  carouselTiltAmount,
  carouselRowShiftY,
  carouselRowSpan,
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

console.log("carousel-tilt tests passed");
