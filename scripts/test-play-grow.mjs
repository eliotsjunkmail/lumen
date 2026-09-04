import {
  PLAY_GROW_EXPAND_SEC,
  PLAY_GROW_SHRINK_SEC,
  playGrowTarget,
  stepPlayGrow,
  playGrowScale,
} from "../play-grow.js";

if (playGrowTarget({}) !== 0) throw new Error("empty should not grow");
if (playGrowTarget({ focused: true, kind: "image", previewing: true, paused: false }) !== 0) {
  throw new Error("images should not grow");
}
if (playGrowTarget({ focused: true, kind: "video", previewing: false, paused: false }) !== 0) {
  throw new Error("unplayed clips should not grow");
}
if (playGrowTarget({ focused: true, kind: "video", previewing: true, paused: true }) !== 0) {
  throw new Error("paused clips should not grow");
}
if (playGrowTarget({ focused: false, kind: "video", previewing: true, paused: false }) !== 0) {
  throw new Error("unaimed clips should not grow");
}
if (playGrowTarget({ focused: true, kind: "video", previewing: true, paused: false }) !== 1) {
  throw new Error("aimed playing video should grow");
}

if (Math.abs(stepPlayGrow(0, 1, PLAY_GROW_EXPAND_SEC) - 1) > 1e-9) {
  throw new Error("full expand duration should reach 1");
}
if (Math.abs(stepPlayGrow(0, 1, PLAY_GROW_EXPAND_SEC / 2) - 0.5) > 1e-9) {
  throw new Error("halfway expand should be 0.5");
}
if (Math.abs(stepPlayGrow(1, 0, PLAY_GROW_SHRINK_SEC) - 0) > 1e-9) {
  throw new Error("full shrink duration should reach 0");
}
if (stepPlayGrow(0.2, 1, 0) !== 0.2) throw new Error("zero dt should hold");
if (stepPlayGrow(undefined, 1, 0.1) < 0) throw new Error("missing current should start at 0");

if (playGrowScale(0) !== 1) throw new Error("rest scale should be 1");
if (playGrowScale(1) !== 2) throw new Error("full grow should double width and height");
if (Math.abs(playGrowScale(0.5) - 1.5) > 1e-9) throw new Error("mid grow should be 1.5×");

console.log("play-grow tests passed");
