// Public Cloudinary web config (safe to ship — unsigned presets are meant
// for browser uploads; no API secret ever ships to the client).
// Fill these from Cloudinary Dashboard:
//   cloud name — shown on the dashboard home
//   preset — Settings → Upload → Upload presets → Add (Signing mode: Unsigned)
export const CLOUDINARY_CLOUD_NAME = "";
export const CLOUDINARY_UPLOAD_PRESET = "";

export function isCloudConfigured() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
}
