import {
  distanceMeters,
  nearestCachedPlace,
  placeCacheKey,
} from "../place-geo.js";

const westfield = { lat: 40.6568, lng: -74.3465 };
const key = placeCacheKey(westfield.lat, westfield.lng);

const cache = new Map();
cache.set(key, "Westfield, NJ");

if (nearestCachedPlace(cache, westfield.lat, westfield.lng) !== "Westfield, NJ") {
  throw new Error("exact cell should return the cached town");
}

// Jitter just across a .toFixed(3) rounding boundary (~111 m cell).
const jitterLat = Number((Math.floor(westfield.lat * 1000) / 1000).toFixed(3)) - 0.00001;
const jittered = { lat: jitterLat, lng: westfield.lng };
if (placeCacheKey(jittered.lat, jittered.lng) === key) {
  throw new Error("fixture should cross a cache-cell boundary");
}

const fromJitter = nearestCachedPlace(cache, jittered.lat, jittered.lng);
if (fromJitter !== "Westfield, NJ") {
  throw new Error(
    `GPS jitter across ${key} → ${placeCacheKey(jittered.lat, jittered.lng)} should still be Westfield, got ${fromJitter}`
  );
}

const d = distanceMeters(westfield.lat, westfield.lng, jittered.lat, jittered.lng);
if (!(d > 0 && d < 450)) {
  throw new Error(`boundary jitter should be well under 450 m, got ${d}`);
}

cache.set(placeCacheKey(40.7, -74.0), null);
if (nearestCachedPlace(cache, 40.7, -74.0) !== null) {
  throw new Error("pending/empty cache entries must not count as a town");
}

if (nearestCachedPlace(cache, 41.3, -72.9) !== null) {
  throw new Error("far GPS should not pick a distant cached town");
}

console.log("place-geo tests passed");
