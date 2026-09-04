import { coverFlowSlots } from "../cover-flow.js";

function dist(lat1, lng1, lat2, lng2) {
  return Math.hypot(lat2 - lat1, lng2 - lng1);
}

const origin = { lat: 0, lng: 0 };
const spots = [
  { id: "far", lat: 10, lng: 0 },
  { id: "near", lat: 1, lng: 0 },
  { id: "mid", lat: 5, lng: 0 },
  { id: "closest", lat: 0.1, lng: 0 },
];

const slots = coverFlowSlots(spots, origin, dist);
if (slots.center?.id !== "closest") {
  throw new Error(`center should be closest — got ${slots.center?.id}`);
}
if (slots.left?.id !== "near") {
  throw new Error(`left should be 2nd nearest — got ${slots.left?.id}`);
}
if (slots.right?.id !== "mid") {
  throw new Error(`right should be 3rd nearest — got ${slots.right?.id}`);
}

const two = coverFlowSlots(spots.slice(0, 2), origin, dist);
if (two.center?.id !== "near" || two.left?.id !== "far" || two.right) {
  throw new Error("two clips should fill center then left");
}

const one = coverFlowSlots([{ id: "only", lat: 0, lng: 0 }], origin, dist);
if (one.center?.id !== "only" || one.left || one.right) {
  throw new Error("single clip should be center only");
}

const none = coverFlowSlots([], origin, dist);
if (none.center || none.left || none.right) {
  throw new Error("empty list should yield empty slots");
}

const unordered = coverFlowSlots(spots, null, dist);
if (unordered.center?.id !== "far") {
  throw new Error("without origin, keep list order");
}

console.log("gate carousel slots ok");
