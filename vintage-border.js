/** Seeded 0–1 RNG (Mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value) {
  let h = 2166136261;
  const s = String(value ?? "");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function notch(t, at, width = 0.055) {
  const d = (t - at) / width;
  if (Math.abs(d) > 1) return 0;
  return Math.cos(d * Math.PI * 0.5) ** 2;
}

/**
 * Irregular inner hole for a vintage print, clockwise from the top-left.
 * Inward normals nibble the photo; right-edge notches mimic film clips.
 */
export function vintageInnerPath(width, height, seed = 1, steps = 28) {
  const rand = mulberry32(seed);
  const insetX = width * (0.058 + rand() * 0.022);
  const insetY = height * (0.05 + rand() * 0.02);
  const amp = Math.min(insetX, insetY);
  const left = insetX;
  const right = width - insetX;
  const top = insetY;
  const bottom = height - insetY;
  const pts = [];

  const addEdge = (x0, y0, x1, y1, nx, ny, extras) => {
    const f1 = 2 + Math.floor(rand() * 3);
    const p1 = rand() * Math.PI * 2;
    const f2 = 6 + Math.floor(rand() * 4);
    const p2 = rand() * Math.PI * 2;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const wobble =
        Math.sin(t * Math.PI * f1 + p1) * amp * 0.2 +
        Math.sin(t * Math.PI * f2 + p2) * amp * 0.1;
      const bite = extras ? extras(t) * amp : 0;
      pts.push({
        x: x0 + (x1 - x0) * t + nx * (wobble + bite),
        y: y0 + (y1 - y0) * t + ny * (wobble + bite),
      });
    }
  };

  addEdge(left, top, right, top, 0, 1, (t) => notch(t, 0.18, 0.05) * 0.45);
  addEdge(right, top, right, bottom, -1, 0, (t) => {
    return notch(t, 0.28, 0.06) * 0.9 + notch(t, 0.67, 0.055) * 0.8;
  });
  addEdge(right, bottom, left, bottom, 0, -1, (t) => notch(t, 0.62, 0.04) * 0.3);
  addEdge(left, bottom, left, top, 1, 0, (t) => notch(t, 0.42, 0.04) * 0.35);
  return pts;
}

export function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const hit =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Paint an alpha film frame: opaque black border, transparent jagged hole. */
export function drawVintageFrame(ctx, width, height, seed = 1) {
  const rand = mulberry32(seed);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#070707";
  roundedRectPath(ctx, 0, 0, width, height, Math.min(width, height) * 0.028);
  ctx.fill();

  const hole = vintageInnerPath(width, height, seed);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  hole.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const speckle = rand();
    if (speckle < 0.014) {
      const g = 160 + rand() * 80;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
      data[i + 3] = 170 + rand() * 70;
    } else if (speckle < 0.02) {
      const g = 18 + rand() * 28;
      data[i] = g;
      data[i + 1] = g;
      data[i + 2] = g;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.strokeStyle = "rgba(220, 220, 220, 0.28)";
  ctx.lineWidth = Math.max(1, width / 700);
  for (let i = 0; i < 6; i += 1) {
    ctx.beginPath();
    ctx.moveTo(rand() * width, rand() * height);
    ctx.quadraticCurveTo(
      rand() * width,
      rand() * height,
      rand() * width,
      rand() * height
    );
    ctx.stroke();
  }
  ctx.restore();
}

export function makeVintageFrameCanvas(width, height, seed = 1) {
  const w = Math.max(32, Math.round(width));
  const h = Math.max(32, Math.round(height));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  drawVintageFrame(ctx, w, h, seed);
  return canvas;
}

export function vintageFrameDataUrl(width = 512, height = 512, seed = 42) {
  return makeVintageFrameCanvas(width, height, seed).toDataURL("image/png");
}
