// Read capture GPS + date from phone videos (MP4 / QuickTime).
// iPhone writes ISO 6709 in QuickTime metadata; many Androids use ©xyz / loci.

const CONTAINERS = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "udta",
  "meta",
  "ilst",
  "moof",
  "traf",
]);

const GPS_ATOMS = new Set(["©xyz", "xyz ", "XYZ ", "loci"]);
const DATE_ATOMS = new Set(["©day"]);

const ISO6709_RE =
  /([+-]\d{1,2}\.\d+)([+-]\d{1,3}\.\d+)(?:[+-]\d+(?:\.\d+)?)?\/?/;

const MAC_EPOCH_OFFSET = 2082844800;

export function parseIso6709(text) {
  if (!text) return null;
  const m = String(text).match(ISO6709_RE);
  if (!m) return null;
  const lat = Number.parseFloat(m[1]);
  const lng = Number.parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export function parseCaptureDate(text) {
  if (!text) return null;
  const raw = String(text).replace(/\0/g, "").trim();
  if (!raw) return null;

  // Apple ©day and similar: 2024:09:03 or 2024-09-03
  const dayOnly = raw.match(/^(\d{4})[:./-](\d{2})[:./-](\d{2})$/);
  if (dayOnly) {
    const noon = new Date(`${dayOnly[1]}-${dayOnly[2]}-${dayOnly[3]}T12:00:00Z`);
    return isPlausibleDate(noon) ? noon.toISOString() : null;
  }

  // creationdate: 2024-09-03T15:32:11-0700 or 2024:09:03T15:32:11+0000
  const normalized = raw
    .replace(/^(\d{4}):(\d{2}):(\d{2})(?=\s|T)/, "$1-$2-$3")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  if (!/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(normalized)) return null;
  const parsed = new Date(normalized);
  return isPlausibleDate(parsed) ? parsed.toISOString() : null;
}

export function formatTakenLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!isPlausibleDate(d)) return "";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function macEpochToIso(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 1000) return null;
  const unix = n - MAC_EPOCH_OFFSET;
  const d = new Date(unix * 1000);
  return isPlausibleDate(d) ? d.toISOString() : null;
}

function isPlausibleDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  return y >= 1995 && y <= 2100;
}

function fourCC(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

function decodeUtf8(bytes, start = 0, end = bytes.length) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(
      bytes.subarray(start, end)
    );
  } catch {
    return "";
  }
}

function readU32(bytes, offset) {
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + offset,
    4
  ).getUint32(0, false);
}

function parseKeysAtom(bytes) {
  if (bytes.length < 8) return [];
  const count = readU32(bytes, 4);
  const keys = [];
  let off = 8;
  for (let i = 0; i < count && off + 8 <= bytes.length; i += 1) {
    const keySize = readU32(bytes, off);
    if (keySize < 8 || off + keySize > bytes.length) break;
    keys.push(decodeUtf8(bytes, off + 8, off + keySize).replace(/\0/g, ""));
    off += keySize;
  }
  return keys;
}

function stringsFromDataAtom(bytes) {
  // iTunes/QuickTime `data` payload: 4-byte type + 4-byte locale + value
  const bodies = [bytes];
  if (bytes.length > 8) bodies.push(bytes.subarray(8));
  if (bytes.length > 4) bodies.push(bytes.subarray(4));
  return bodies.map((b) => decodeUtf8(b).replace(/\0/g, "").trim());
}

async function readSlice(read, start, length) {
  if (length <= 0) return new Uint8Array(0);
  const chunk = await read(start, length);
  return chunk || new Uint8Array(0);
}

async function walkBoxes(read, fileSize, start, end, onBox, depth = 0) {
  if (depth > 14) return;
  let off = start;
  while (off + 8 <= end && off + 8 <= fileSize) {
    const header = await readSlice(read, off, 16);
    if (header.length < 8) break;
    let size = readU32(header, 0);
    const type = fourCC(header, 4);
    let headerSize = 8;
    if (size === 1) {
      if (header.length < 16) break;
      const hi = readU32(header, 8);
      const lo = readU32(header, 12);
      size = hi * 4294967296 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < headerSize) break;
    const boxEnd = Math.min(off + size, end, fileSize);
    await onBox(type, off + headerSize, boxEnd, depth);
    off = boxEnd;
  }
}

function applyGps(found, text) {
  if (found.lat != null) return;
  const ll = parseIso6709(text);
  if (!ll) return;
  found.lat = ll.lat;
  found.lng = ll.lng;
}

function applyDate(found, text, preferred = false) {
  const iso = parseCaptureDate(text);
  if (!iso) return;
  if (preferred) found.preferredDate = iso;
  else if (!found.atomDate) found.atomDate = iso;
}

function applyMvhdDate(found, bytes) {
  if (bytes.length < 8) return;
  const version = bytes[0];
  let seconds;
  if (version === 1 && bytes.length >= 20) {
    // 64-bit creation time — use low 32 bits (good through year 2106)
    seconds = readU32(bytes, 8);
  } else if (bytes.length >= 8) {
    seconds = readU32(bytes, 4);
  }
  const iso = macEpochToIso(seconds);
  if (iso && !found.mvhdDate) found.mvhdDate = iso;
}

export async function parseMp4CaptureMeta(read, fileSize) {
  const found = {
    lat: null,
    lng: null,
    preferredDate: null,
    atomDate: null,
    mvhdDate: null,
    keys: [],
  };

  const visit = async (type, payloadStart, payloadEnd, depth) => {
    const payloadSize = payloadEnd - payloadStart;
    if (payloadSize < 0) return;

    if (type === "mdat" || type === "free" || type === "skip" || type === "wide") {
      return;
    }

    if (type === "keys" && payloadSize < 65536) {
      const bytes = await readSlice(read, payloadStart, payloadSize);
      found.keys = parseKeysAtom(bytes);
      return;
    }

    if ((type === "mvhd" || type === "mdhd") && payloadSize < 256) {
      const bytes = await readSlice(read, payloadStart, payloadSize);
      applyMvhdDate(found, bytes);
      return;
    }

    if (GPS_ATOMS.has(type) && payloadSize < 4096) {
      const bytes = await readSlice(read, payloadStart, payloadSize);
      for (const s of stringsFromDataAtom(bytes)) applyGps(found, s);
      return;
    }

    if (DATE_ATOMS.has(type) && payloadSize < 4096) {
      const bytes = await readSlice(read, payloadStart, payloadSize);
      for (const s of stringsFromDataAtom(bytes)) applyDate(found, s);
      return;
    }

    if (type === "data" && payloadSize < 4096) {
      const bytes = await readSlice(read, payloadStart, payloadSize);
      for (const s of stringsFromDataAtom(bytes)) {
        applyGps(found, s);
        applyDate(found, s);
      }
      return;
    }

    // Indexed ilst items: type is 1-based key index as 4 raw bytes
    const index = type.charCodeAt(3) || 0;
    const looksIndexed = type.charCodeAt(0) === 0 && type.charCodeAt(1) === 0;
    if (looksIndexed && index > 0 && payloadSize < 8192) {
      const key = found.keys[index - 1] || "";
      const bytes = await readSlice(read, payloadStart, payloadSize);
      const texts = stringsFromDataAtom(bytes);
      if (/location\.ISO6709|location\.iso6709|©xyz|xyz/i.test(key)) {
        for (const s of texts) applyGps(found, s);
      }
      if (/creationdate|creation_date|©day|date/i.test(key)) {
        for (const s of texts) applyDate(found, s, true);
      }
      await walkBoxes(read, fileSize, payloadStart, payloadEnd, visit, depth + 1);
      return;
    }

    if (CONTAINERS.has(type)) {
      if (type === "meta") {
        // ISO FullBox has a 4-byte version/flags prefix; QuickTime often does not.
        await walkBoxes(read, fileSize, payloadStart, payloadEnd, visit, depth + 1);
        if (payloadSize > 4) {
          await walkBoxes(
            read,
            fileSize,
            payloadStart + 4,
            payloadEnd,
            visit,
            depth + 1
          );
        }
        return;
      }
      await walkBoxes(read, fileSize, payloadStart, payloadEnd, visit, depth + 1);
    }
  };

  await walkBoxes(read, fileSize, 0, fileSize, visit, 0);

  return {
    lat: found.lat,
    lng: found.lng,
    takenAt: found.preferredDate || found.atomDate || found.mvhdDate || null,
  };
}

export async function readVideoCaptureMeta(file) {
  if (!file) return { lat: null, lng: null, takenAt: null };
  const read = async (start, length) => {
    if (start >= file.size || length <= 0) return new Uint8Array(0);
    const end = Math.min(file.size, start + length);
    const buf = await file.slice(start, end).arrayBuffer();
    return new Uint8Array(buf);
  };

  let meta = { lat: null, lng: null, takenAt: null };
  try {
    meta = await parseMp4CaptureMeta(read, file.size);
  } catch (err) {
    console.warn("Video metadata read failed", err);
  }

  if (!meta.takenAt && file.lastModified) {
    const d = new Date(file.lastModified);
    if (isPlausibleDate(d)) meta.takenAt = d.toISOString();
  }
  return meta;
}
