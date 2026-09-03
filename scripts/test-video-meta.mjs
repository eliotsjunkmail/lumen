import {
  parseIso6709,
  parseCaptureDate,
  macEpochToIso,
  formatTakenLabel,
  parseMp4CaptureMeta,
  readVideoCaptureMeta,
} from "../video-meta.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertClose(a, b, message) {
  if (Math.abs(a - b) > 0.0001) throw new Error(`${message}: ${a} !== ${b}`);
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

function encode(str) {
  return new TextEncoder().encode(str);
}

function concat(...parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function box(type, payload) {
  const typeBytes =
    typeof type === "string"
      ? Uint8Array.from([...type].map((c) => c.charCodeAt(0)))
      : type;
  const out = new Uint8Array(8 + payload.length);
  new DataView(out.buffer).setUint32(0, out.length);
  out.set(typeBytes, 4);
  out.set(payload, 8);
  return out;
}

function readerFrom(bytes) {
  return async (start, length) =>
    bytes.subarray(start, Math.min(bytes.length, start + length));
}

const xyzType = new Uint8Array([0xa9, 0x78, 0x79, 0x7a]);
const MAC_EPOCH_OFFSET = 2082844800;
const unix = Date.UTC(2024, 5, 15, 12, 0, 0) / 1000;
const macTime = unix + MAC_EPOCH_OFFSET;

{
  const ll = parseIso6709("+37.7749-122.4194+012.000/");
  assert(ll, "ISO 6709 should parse");
  assertClose(ll.lat, 37.7749, "lat");
  assertClose(ll.lng, -122.4194, "lng");
  assert(!parseIso6709("not a coordinate"), "reject junk");
  assert(!parseIso6709("+0.0+0.0/"), "reject null island");
}

{
  const iso = parseCaptureDate("2024-09-03T15:32:11-0700");
  assert(iso, "Apple creationdate should parse");
  assert(iso.startsWith("2024-09-03T"), iso);
  assert(parseCaptureDate("2024:09:03")?.startsWith("2024-09-03"), "©day");
}

{
  const iso = macEpochToIso(macTime);
  assert(iso === new Date(unix * 1000).toISOString(), `mvhd date ${iso}`);
}

{
  const label = formatTakenLabel("2024-09-03T22:32:11.000Z");
  assert(/Sep/.test(label) && /2024/.test(label), `label ${label}`);
}

{
  const ftyp = box(
    "ftyp",
    concat(encode("isom"), u32(0), encode("isom"))
  );
  const mvhd = box(
    "mvhd",
    concat(new Uint8Array([0, 0, 0, 0]), u32(macTime), u32(macTime), u32(1000), u32(1000), new Uint8Array(80))
  );
  const xyz = box(xyzType, encode("+37.7749-122.4194+012.000/"));
  const mp4 = concat(ftyp, box("moov", concat(mvhd, box("udta", xyz))));
  const meta = await parseMp4CaptureMeta(readerFrom(mp4), mp4.length);
  assertClose(meta.lat, 37.7749, "©xyz lat");
  assertClose(meta.lng, -122.4194, "©xyz lng");
  assert(meta.takenAt === new Date(unix * 1000).toISOString(), meta.takenAt);
}

{
  const loc = "+47.6062-122.3321/";
  const date = "2026-09-03T11:40:00-0700";
  const key1 = "com.apple.quicktime.location.ISO6709";
  const key2 = "com.apple.quicktime.creationdate";
  const keyBox = (name) => {
    const body = concat(encode("mdta"), encode(name));
    return concat(u32(4 + body.length), body);
  };
  const keys = box(
    "keys",
    concat(u32(0), u32(2), keyBox(key1), keyBox(key2))
  );
  const dataBox = (text) =>
    box("data", concat(u32(1), u32(0), encode(text)));
  const item = (index, text) =>
    box(new Uint8Array([0, 0, 0, index]), dataBox(text));
  const ilst = box("ilst", concat(item(1, loc), item(2, date)));
  const metaAtom = box("meta", concat(u32(0), keys, ilst));
  const mp4 = concat(
    box("ftyp", concat(encode("isom"), u32(0), encode("isom"))),
    box("moov", box("udta", metaAtom))
  );
  const meta = await parseMp4CaptureMeta(readerFrom(mp4), mp4.length);
  assertClose(meta.lat, 47.6062, "Apple ISO6709 lat");
  assertClose(meta.lng, -122.3321, "Apple ISO6709 lng");
  assert(meta.takenAt.startsWith("2026-09-03T"), meta.takenAt);
}

{
  const bytes = concat(
    box("ftyp", concat(encode("isom"), u32(0), encode("isom"))),
    box(
      "moov",
      box("udta", box(xyzType, encode("+51.5074-0.1278/")))
    )
  );
  const file = new File([bytes], "clip.mov", { type: "video/quicktime" });
  Object.defineProperty(file, "lastModified", { value: Date.parse("2020-01-15T08:00:00Z") });
  const meta = await readVideoCaptureMeta(file);
  assertClose(meta.lat, 51.5074, "File lat");
  assertClose(meta.lng, -0.1278, "File lng");
}

console.log("video-meta tests passed");
