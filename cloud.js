// Shared-world sync via Cloudinary unsigned uploads.
// Videos are tagged, pin metadata (title/GPS/owner) rides in the context
// field, and visitors load everything through the public list-by-tag JSON.
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  isCloudConfigured,
} from "./config.js";

const TAG = "lumen-spot";

export function cloudConfigured() {
  return isCloudConfigured();
}

export function deliveryVideoPath(path) {
  return String(path || "").replace(/\.\w+$/, ".mp4");
}

export function videoUrl(path) {
  const mp4Path = deliveryVideoPath(path);
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/${mp4Path}`;
}

/** Small poster frame Cloudinary renders from the video's first second. */
export function thumbUrl(path) {
  const jpg = String(path || "").replace(/\.\w+$/, ".jpg");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/so_0,w_120,h_120,c_fill/${jpg}`;
}

/** Field-size still so clips are visible before a video frame decodes. */
export function posterUrl(path) {
  const jpg = String(path || "").replace(/\.\w+$/, ".jpg");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/upload/so_0,w_900,c_limit,q_auto/${jpg}`;
}

export async function loadSpots() {
  // Cache-buster: the list JSON is CDN-cached, keep pins reasonably fresh
  const res = await fetch(
    `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/video/list/${TAG}.json?t=${Math.floor(
      Date.now() / 30000
    )}`
  );
  if (res.status === 404) return []; // no shared clips yet
  if (!res.ok) throw new Error(`Loading shared pins failed (${res.status})`);
  const data = await res.json();

  return (data.resources || [])
    .map((r) => {
      const ctx = r.context?.custom || {};
      return {
        id: r.public_id,
        title: ctx.title || "Shared clip",
        lat: Number.parseFloat(ctx.lat),
        lng: Number.parseFloat(ctx.lng),
        owner: ctx.owner || "",
        takenAt: parseTakenAt(ctx.taken),
        video_path: `v${r.version}/${r.public_id}.${r.format || "mp4"}`,
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

function parseTakenAt(value) {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 1995 || y > 2100) return null;
  return d.toISOString();
}

function safeTakenContext(value) {
  const iso = parseTakenAt(value);
  if (!iso) return "";
  return iso.replace(/[|=]/g, "");
}

export async function publishSpot(file, { title, lat, lng, owner, takenAt }) {
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  form.append("tags", TAG);
  // context uses | and = as separators — strip them from the title
  const safeTitle = String(title).replace(/[|=]/g, " ").trim();
  const taken = safeTakenContext(takenAt);
  form.append(
    "context",
    taken
      ? `title=${safeTitle}|lat=${lat}|lng=${lng}|owner=${owner}|taken=${taken}`
      : `title=${safeTitle}|lat=${lat}|lng=${lng}|owner=${owner}`
  );

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
    { method: "POST", body: form }
  );
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(
      detail?.error?.message || `Video upload failed (${res.status})`
    );
  }
  const data = await res.json();
  return {
    id: data.public_id,
    path: `v${data.version}/${data.public_id}.${data.format || "mp4"}`,
    url: data.secure_url,
    // Only present when the preset enables "Return delete token" —
    // allows undoing an upload for ~10 minutes without any API secret
    deleteToken: data.delete_token || null,
  };
}

export async function deleteSpot(id, path, deleteToken) {
  if (!deleteToken) {
    throw new Error("No delete token — clip can only be removed right after upload");
  }
  const form = new FormData();
  form.append("token", deleteToken);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/delete_by_token`,
    { method: "POST", body: form }
  );
  if (!res.ok) throw new Error(`Cloud delete failed (${res.status})`);
}
