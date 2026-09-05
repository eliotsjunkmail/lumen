import {
  videoHasPaintedFrame,
  waitForPaintedVideoFrame,
} from "../video-preview.js";

if (videoHasPaintedFrame(null) !== false) {
  throw new Error("missing video should not count as painted");
}
if (
  videoHasPaintedFrame({
    readyState: 4,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 1,
  })
) {
  throw new Error("a video with no dimensions is still empty");
}
if (
  videoHasPaintedFrame({
    readyState: 1,
    videoWidth: 720,
    videoHeight: 1280,
    currentTime: 0.2,
  })
) {
  throw new Error("HAVE_METADATA is not a painted frame");
}
if (
  videoHasPaintedFrame({
    readyState: 2,
    videoWidth: 720,
    videoHeight: 1280,
    currentTime: 0,
  })
) {
  throw new Error("currentTime 0 should keep the poster");
}
if (
  !videoHasPaintedFrame({
    readyState: 2,
    videoWidth: 720,
    videoHeight: 1280,
    currentTime: 0.04,
  })
) {
  throw new Error("decoded pixels should count as a painted frame");
}

const empty = await waitForPaintedVideoFrame(
  {
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
    addEventListener() {},
    removeEventListener() {},
  },
  20
);
if (empty !== false) {
  throw new Error("timeout without pixels should keep the poster");
}

const ready = await waitForPaintedVideoFrame({
  readyState: 3,
  videoWidth: 1280,
  videoHeight: 720,
  currentTime: 0.2,
});
if (ready !== true) {
  throw new Error("an already-painted video should resolve immediately");
}

console.log("video-preview tests passed");
