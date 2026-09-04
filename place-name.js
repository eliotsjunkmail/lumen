/** Drop civic prefixes/suffixes so labels stay short, e.g. Coolbaugh, PA. */
export function formatTownName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";

  const comma = raw.lastIndexOf(",");
  let locality = (comma === -1 ? raw : raw.slice(0, comma)).trim();
  const region = (comma === -1 ? "" : raw.slice(comma + 1)).trim();

  locality = locality.replace(
    /^(the\s+)?(charter\s+township|civil\s+township|census[- ]designated place|municipality|township|borough|village|parish|town|city)\s+of\s+/i,
    ""
  );
  locality = locality.replace(
    /\s+(charter\s+township|civil\s+township|census[- ]designated place|municipality|township|borough|village|parish)$/i,
    ""
  );
  locality = locality.replace(/\s+/g, " ").trim();
  if (!locality) return raw;
  return region ? `${locality}, ${region}` : locality;
}
