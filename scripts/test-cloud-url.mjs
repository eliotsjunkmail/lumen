import {
  deliveryVideoPath,
  videoUrl,
  posterUrl,
  thumbUrl,
} from "../cloud.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(deliveryVideoPath("v1/foo.mov") === "v1/foo.mp4", "mov → mp4");
assert(deliveryVideoPath("v1/foo.mp4") === "v1/foo.mp4", "mp4 stays mp4");
assert(deliveryVideoPath("v1788/abc.MOV") === "v1788/abc.mp4", "MOV → mp4");
assert(deliveryVideoPath("") === "", "empty path");

const video = videoUrl("v1788480326/tsdcc98td7kr3qm6ratp.mov");
assert(video.includes("/video/upload/"), "video upload prefix");
assert(video.endsWith("/v1788480326/tsdcc98td7kr3qm6ratp.mp4"), "delivery is mp4");
assert(!video.includes(".mov"), "delivery URL must not keep .mov");

const poster = posterUrl("v1/foo.mov");
assert(poster.includes("/so_0,w_900,c_limit,q_auto/"), "field poster transform");
assert(poster.endsWith("/v1/foo.jpg"), "poster is jpg");

const thumb = thumbUrl("v1/foo.mov");
assert(thumb.includes("/so_0,w_120,h_120,c_fill/"), "map thumb transform");
assert(thumb.endsWith("/v1/foo.jpg"), "thumb is jpg");

console.log("cloud url ok");
