import { formatTownName } from "./place-name.js";

/** Haversine distance in meters. */
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Reverse-geocode cache cells (~100 m). */
export function placeCacheKey(lat, lng) {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

/**
 * Town for a GPS point: exact cell, else the nearest cached place within maxM.
 * GPS jitter across a toFixed(3) boundary must still count as the same town.
 */
export function nearestCachedPlace(cache, lat, lng, maxM = 450) {
  const exact = formatTownName(cache.get(placeCacheKey(lat, lng)));
  if (exact) return exact;
  let best = null;
  let bestD = maxM;
  for (const [key, place] of cache) {
    if (!place) continue;
    const [plat, plng] = key.split(",").map(Number);
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue;
    const d = distanceMeters(lat, lng, plat, plng);
    if (d <= bestD) {
      bestD = d;
      best = formatTownName(place);
    }
  }
  return best || null;
}

export function regionCode(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.split("-").pop();
  if (iso && iso.length >= 2 && iso.length <= 3) return iso.toUpperCase();
  return s;
}

export function townFromBigDataCloud(data) {
  if (!data || typeof data !== "object") return "";
  const city = formatTownName(data.city || data.locality || "");
  const stateCode =
    regionCode(data.principalSubdivisionCode) || data.principalSubdivision || "";
  return formatTownName(
    city && stateCode ? `${city}, ${stateCode}` : city || stateCode
  );
}

export function townFromNominatim(data) {
  if (!data || typeof data !== "object") return "";
  const a = data.address || {};
  const city = formatTownName(
    a.city || a.town || a.village || a.hamlet || a.municipality || ""
  );
  const stateCode = regionCode(a["ISO3166-2-lvl4"]) || a.state || "";
  return formatTownName(
    city && stateCode ? `${city}, ${stateCode}` : city || stateCode
  );
}

async function fetchJson(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** BigDataCloud first, Nominatim if that is empty or times out. */
export async function fetchTownName(lat, lng) {
  const bdc = await fetchJson(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
  );
  const fromBdc = townFromBigDataCloud(bdc);
  if (fromBdc) return fromBdc;
  const nom = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
  );
  return townFromNominatim(nom) || "";
}
