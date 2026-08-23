// Shared-world sync via Supabase REST (no SDK needed).
// Videos live in the public "videos" storage bucket; pin metadata in "spots".
import { SUPABASE_URL, SUPABASE_ANON_KEY, isCloudConfigured } from "./config.js";

const BUCKET = "videos";

function authHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

export function cloudConfigured() {
  return isCloudConfigured();
}

export function videoUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export async function loadSpots() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/spots?select=*&order=created_at.desc&limit=200`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Loading shared pins failed (${res.status})`);
  return res.json();
}

export async function publishSpot(file, { title, lat, lng, owner }) {
  const ext = (file.name?.match(/\.(\w+)$/)?.[1] || "mp4").toLowerCase();
  const path = `${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const upload = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": file.type || "video/mp4",
      },
      body: file,
    }
  );
  if (!upload.ok) throw new Error(`Video upload failed (${upload.status})`);

  const insert = await fetch(`${SUPABASE_URL}/rest/v1/spots`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ title, lat, lng, video_path: path, owner }),
  });
  if (!insert.ok) {
    // Roll back the orphaned file so storage doesn't fill with unlisted clips
    fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).catch(() => {});
    throw new Error(`Saving the pin failed (${insert.status})`);
  }

  const [row] = await insert.json();
  return { id: row.id, path, url: videoUrl(path) };
}

export async function deleteSpot(id, path) {
  await fetch(`${SUPABASE_URL}/rest/v1/spots?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (path) {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    }).catch(() => {});
  }
}
