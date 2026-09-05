/** True when the element has decoded pixels we can paint. */
export function videoHasPaintedFrame(video) {
  if (!video) return false;
  return (
    video.readyState >= 2 &&
    (video.videoWidth || 0) > 1 &&
    (video.videoHeight || 0) > 1 &&
    Number(video.currentTime) > 0
  );
}

/**
 * Wait until the video has a real frame. A timeout without pixels is failure
 * so we keep the poster instead of swapping in a black texture.
 */
export function waitForPaintedVideoFrame(video, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!video) {
      resolve(false);
      return;
    }
    if (videoHasPaintedFrame(video)) {
      resolve(true);
      return;
    }

    let settled = false;
    let frameId = 0;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      video.removeEventListener("playing", onMaybe);
      video.removeEventListener("timeupdate", onMaybe);
      video.removeEventListener("loadeddata", onMaybe);
      if (frameId && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(frameId);
      }
      clearTimeout(timer);
      resolve(Boolean(ok));
    };

    const onMaybe = () => {
      if (videoHasPaintedFrame(video)) done(true);
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      const onFrame = () => {
        if (video.videoWidth > 1 && video.videoHeight > 1) done(true);
        else onMaybe();
      };
      frameId = video.requestVideoFrameCallback(onFrame);
    }
    video.addEventListener("playing", onMaybe);
    video.addEventListener("timeupdate", onMaybe);
    video.addEventListener("loadeddata", onMaybe);
    const timer = setTimeout(() => done(videoHasPaintedFrame(video)), timeoutMs);
  });
}
