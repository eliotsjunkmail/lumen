import * as THREE from "three";
import {
  cloudConfigured,
  loadSpots,
  publishSpot,
  deleteSpot,
  videoUrl,
  thumbUrl,
} from "./cloud.js";

const GEO_RANGE_FT = 25;
const GEO_RANGE_M = GEO_RANGE_FT * 0.3048;

/** Stable anonymous id so users can delete their own shared pins. */
function getDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem("lumen-device");
  } catch {
    /* private browsing */
  }
  if (!id) {
    id =
      crypto.randomUUID?.() ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      localStorage.setItem("lumen-device", id);
    } catch {
      /* ignore */
    }
  }
  return id;
}

// Sample clips are off by default — the field starts with shared pins only.
// To showcase clips for every visitor, add entries here (files in ./media):
// { id, title, blurb, src: "./media/name.mp4", position: [x, y, z], demo: true }
const CATALOG = [];

const gate = document.getElementById("gate");
const field = document.getElementById("field");
const enterBtn = document.getElementById("enter-btn");
const camEl = document.getElementById("cam");
const canvas = document.getElementById("stage");
const hudHint = document.getElementById("hud-hint");
const focusLabel = document.getElementById("focus-label");
const watchBtn = document.getElementById("watch-btn");
const statusEl = document.getElementById("status");
const radarDots = document.getElementById("radar-dots");
const theater = document.getElementById("theater");
const theaterVideo = document.getElementById("theater-video");
const theaterImage = document.getElementById("theater-image");
const theaterTitle = document.getElementById("theater-title");
const theaterScreenWrap = document.querySelector(".theater-screen-wrap");
const uploadNote = document.getElementById("upload-note");
const videoInputGate = document.getElementById("video-input-gate");
const videoInputField = document.getElementById("video-input-field");
const videoInputCapture = document.getElementById("video-input-capture");
const addBtn = document.getElementById("add-btn");
const addModal = document.getElementById("add-modal");
const addCapture = document.getElementById("add-capture");
const addCreate = document.getElementById("add-create");
const addClose = document.getElementById("add-close");
const createModal = document.getElementById("create-modal");
const createForm = document.getElementById("create-form");
const createInput = document.getElementById("create-input");
const createCancel = document.getElementById("create-cancel");
const createSubmit = document.getElementById("create-submit");
const createStatus = document.getElementById("create-status");
const createProgress = document.getElementById("create-progress");
const createProgressFill = document.getElementById("create-progress-fill");
const deleteBtn = document.getElementById("delete-btn");
const theaterDelete = document.getElementById("theater-delete");
const theaterClose = document.getElementById("theater-close");
const theaterDone = document.getElementById("theater-done");
const reactBurst = document.getElementById("react-burst");
const confirmModal = document.getElementById("confirm-modal");
const confirmCopy = document.getElementById("confirm-copy");
const confirmCancel = document.getElementById("confirm-cancel");
const confirmOk = document.getElementById("confirm-ok");
const nameModal = document.getElementById("name-modal");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const nameFile = document.getElementById("name-file");
const nameCancel = document.getElementById("name-cancel");
const locationPrompt = document.getElementById("location-prompt");
const locationCopy = document.getElementById("location-copy");
const locationBtn = document.getElementById("location-btn");
const radar = document.getElementById("radar");
const mapModal = document.getElementById("map-modal");
const mapBackdrop = document.getElementById("map-backdrop");
const mapClose = document.getElementById("map-close");
const mapViewport = document.getElementById("map-viewport");
const mapList = document.getElementById("map-list");
const mapSupport = document.getElementById("map-support");
const guide = document.getElementById("guide");
const guideArrow = document.getElementById("guide-arrow");
const guideLabel = document.getElementById("guide-label");

const state = {
  offsetYaw: 0,
  offsetPitch: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  focused: null,
  watchingNode: null,
  watching: false,
  theaterFromMap: false,
  booting: false,
  booted: false,
  pendingUploads: [],
  nameQueue: [],
  naming: false,
  uploadCount: 0,
  originGeo: null,
  userGeo: null,
  geoWatchId: null,
  demoGeoReady: false,
  mapOpen: false,
  selectedClusterId: null,
  mapArrowEls: new Map(),
  mapRowEls: new Map(),
  mapListAt: 0,
  leafletMap: null,
  leafletMarkers: new Map(),
  leafletYou: null,
  nodes: [],
  clock: new THREE.Clock(),
  hasGyro: false,
  orientReady: false,
  northAligned: false,
  theaterAnimId: null,
  dandelion: null,
  blow: null,
};

let renderer;
let scene;
let camera;
let statusTimer;

// Device-orientation → camera (Three.js DeviceOrientationControls math)
const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 on X
const _deviceQuat = new THREE.Quaternion();
const _offsetQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _to = new THREE.Vector3();
const _right = new THREE.Vector3();
const _place = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _upHeading = new THREE.Vector3();
const _northQuat = new THREE.Quaternion();
const _northForward = new THREE.Vector3();
const _camLocal = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function enuFromOrigin(originLat, originLng, lat, lng) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat - originLat);
  const dLng = toRad(lng - originLng);
  const east = dLng * Math.cos(toRad(originLat)) * R;
  const north = dLat * R;
  return { x: east, y: 0, z: -north };
}

function offsetLatLng(lat, lng, eastM, northM) {
  const R = 6378137;
  const dLat = (northM / R) * (180 / Math.PI);
  const dLng =
    (eastM / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

function readGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 4000 }
    );
  });
}

function setLocationUi(kind, message) {
  if (!locationPrompt) return;
  locationPrompt.classList.remove("is-ready", "is-denied");
  if (kind === "ready") locationPrompt.classList.add("is-ready");
  if (kind === "denied") locationPrompt.classList.add("is-denied");
  if (locationCopy) locationCopy.textContent = message;
  if (locationBtn) {
    locationBtn.disabled = kind === "ready" || kind === "pending";
    if (kind === "pending") locationBtn.textContent = "Checking…";
    else if (kind === "denied") locationBtn.textContent = "Try again";
    else if (kind === "ready") locationBtn.textContent = "Location on";
    else locationBtn.textContent = "Enable location";
  }
}

async function requestLocationAccess({ interactive = false } = {}) {
  if (!navigator.geolocation) {
    setLocationUi("denied", "This phone doesn’t support location.");
    return null;
  }

  setLocationUi(
    "pending",
    interactive
      ? "Allow location when your phone asks…"
      : "Checking location access…"
  );

  try {
    const geo = await readGps();
    state.userGeo = geo;
    state.originGeo = state.originGeo || { ...geo };
    startGeoWatch();
    updateRadarMapBackground();
    anchorDemoVideosToLaunch();
    updateGeoAnchors();
    setLocationUi(
      "ready",
      "Location on — pins work within 25 feet of where you stand."
    );
    return geo;
  } catch (err) {
    console.warn(err);
    const denied =
      err && (err.code === 1 || /denied/i.test(String(err.message || "")));
    setLocationUi(
      "denied",
      denied
        ? "Location is blocked. Enable it in Settings, then tap Try again."
        : "Couldn’t get location yet. Tap Enable location to allow access."
    );
    return null;
  }
}

async function initLocationOnLoad() {
  // Ask as soon as the app opens (HTTPS / GitHub Pages).
  // If the browser requires a tap, the Enable location button is ready.
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      if (status.state === "granted") {
        await requestLocationAccess({ interactive: false });
        return;
      }
      if (status.state === "denied") {
        setLocationUi(
          "denied",
          "Location is blocked. Enable it for this site in your phone settings."
        );
        return;
      }
    } catch {
      // Safari may not support permissions.query for geolocation
    }
  }

  setLocationUi(
    "ask",
    "Lumen needs your location to pin videos within 25 feet."
  );
  // Attempt immediately on load; many mobile browsers will show the system prompt.
  await requestLocationAccess({ interactive: false });
}

locationBtn?.addEventListener("click", () => {
  requestLocationAccess({ interactive: true });
});

initLocationOnLoad();

function startGeoWatch() {
  if (!navigator.geolocation || state.geoWatchId != null) return;
  state.geoWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      state.userGeo = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      if (!state.originGeo) state.originGeo = { ...state.userGeo };
      updateRadarMapBackground();
      anchorDemoVideosToLaunch();
      updateGeoAnchors();
    },
    (err) => console.warn(err),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

/** Light street-map tile behind the camera radar, centered on the user. */
function latLngToTile(lat, lng, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y, z: zoom };
}

function updateRadarMapBackground() {
  if (!radar) return;
  const geo = state.userGeo || state.originGeo;
  if (!geo) return;
  const key = `${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`;
  if (radar.dataset.mapKey === key) return;
  radar.dataset.mapKey = key;
  const { x, y, z } = latLngToTile(geo.lat, geo.lng, 15);
  // Match the Nearby map: light OSM street tiles
  radar.style.backgroundImage = `url("https://tile.openstreetmap.org/${z}/${x}/${y}.png")`;
}

/** Place sample clips around wherever this user opened the site. */
function anchorDemoVideosToLaunch() {
  const origin = state.originGeo;
  if (!origin || !state.nodes.length) return;

  for (const node of state.nodes) {
    if (!node.demo) continue;
    const east = node.anchorX ?? node.position?.[0] ?? 0;
    const north = -(node.anchorZ ?? node.position?.[2] ?? 0);
    const ll = offsetLatLng(origin.lat, origin.lng, east, north);
    node.lat = ll.lat;
    node.lng = ll.lng;
  }
  state.demoGeoReady = true;
  if (state.mapOpen) {
    refreshMapList();
    syncLeafletMarkers();
  }
}

function aimMetersOnGround(distance = 3.5) {
  const forward = getLookForwardFlat();
  forward.multiplyScalar(distance);
  return { east: forward.x, north: -forward.z };
}

/** Unsmoothed look direction on the ground plane (matches what the user is aiming). */
function getLookForwardFlat() {
  // Snap rig so placement isn't behind a slerp lag
  if (camera) updateCameraRig(1);

  const q = new THREE.Quaternion();
  if (state.orientReady) {
    _offsetQuat.setFromEuler(
      new THREE.Euler(state.offsetPitch, state.offsetYaw, 0, "YXZ")
    );
    q.copy(_deviceQuat).multiply(_offsetQuat);
  } else if (camera) {
    q.copy(camera.quaternion);
  } else {
    return new THREE.Vector3(0, 0, -1);
  }

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  forward.y = 0;
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  forward.normalize();
  return forward;
}

function placementAlongLook(distance = 3.2, y = 1.4) {
  const forward = getLookForwardFlat();
  const origin = camera ? camera.position : new THREE.Vector3(0, 1.4, 0);
  return [
    origin.x + forward.x * distance,
    y,
    origin.z + forward.z * distance,
  ];
}

function getLookForward() {
  if (!camera) return new THREE.Vector3(0, 0, -1);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
  return forward.normalize();
}

/** Birds, planes, and other airborne subjects sit in the sky instead of on the ground. */
function isFlyingSubject(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  return /\b(bird|birds|eagle|eagles|hawk|hawks|owl|owls|parrot|parrots|crow|crows|raven|ravens|sparrow|sparrows|pigeon|pigeons|dove|doves|seagull|seagulls|gull|gulls|albatross|hummingbird|hummingbirds|falcon|falcons|vulture|vultures|swan|swans|duck|ducks|goose|geese|heron|stork|pelican|toucan|macaw|canary|finch|robin|bluejay|cardinal|woodpecker|flamingo|peacock|condor|kite|kites|plane|planes|airplane|airplanes|aeroplane|aeroplanes|jet|jets|airliner|helicopter|helicopters|chopper|drone|drones|quadcopter|ufo|ufos|spaceship|spacecraft|rocket|rockets|butterfly|butterflies|moth|moths|dragonfly|dragonflies|bee|bees|wasp|wasps|hornet|hornets|fly|flies|firefly|bat|bats|pterodactyl|pteranodon|dragon|dragons|phoenix|griffin|griffon|pegasus|angel|angels|fairy|fairies|pixie|blimp|zeppelin|glider|paraglider|airship|seaplane|biplane|warplane|hot[- ]?air[- ]?balloon|hang[- ]?glider|superhero|superman|witch|hovering|soaring|flying|in flight|in the (air|sky)|with wings)\b/.test(
    t
  );
}

function defaultHudHint() {
  if (state.dandelion?.awaitingBlow) return "Blow into the mic to scatter the seeds";
  return "Within 25 ft, aim from any direction";
}

function syncCreationStand(node) {
  if (!node || node.kind !== "image" || !node.screen?.geometry) return;
  const h = node.screen.geometry.parameters?.height || 1.35;
  if (node.flying) {
    node.restY = 2.55 + Math.min(0.75, h * 0.2);
    node.baseY = node.restY;
    node.velY = 0;
    node.settled = true;
  } else {
    node.restY = h * 0.5 + 0.02;
    if (node.settled) node.baseY = node.restY;
  }
  if (node.beacon) node.beacon.visible = false;
}

function updateGeoAnchors() {
  const user = state.userGeo || state.originGeo;
  if (!user) return;

  for (const node of state.nodes) {
    if (node.lat == null || node.lng == null) continue;

    const dist = distanceMeters(user.lat, user.lng, node.lat, node.lng);
    node.distanceM = dist;
    const inRange = dist <= GEO_RANGE_M;
    node.inRange = inRange;
    node.group.visible = inRange;
    if (node.radar) node.radar.style.display = inRange ? "" : "none";

    // Place relative to the user so scene distance matches GPS range checks.
    // (Origin-relative ENU left nearby pins stranded far from the camera.)
    if (!node.worldLocked) {
      const enu = enuFromOrigin(user.lat, user.lng, node.lat, node.lng);
      node.anchorX = enu.x;
      node.anchorZ = enu.z;
    }

    const feet = Math.max(1, Math.round(dist * 3.28084));
    node.blurb = inRange
      ? `${feet} ft · aim from any side`
      : `Out of range (${feet} ft)`;
    if (state.focused === node) hudHint.textContent = node.blurb;

    if (!inRange && state.focused === node) setFocus(null);
  }
}

function setStatus(message, ms = 2800) {
  statusEl.textContent = message;
  statusEl.classList.add("is-on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("is-on"), ms);
}

function createLabelTexture(title, blurb, { reserveDelete = false, thumbs = 0, kind = "video" } = {}) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(6, 16, 12, 0.72)";
  roundRect(ctx, 24, 36, 976, 184, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(198, 255, 74, 0.55)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#c6ff4a";
  ctx.font = "700 42px Manrope, sans-serif";
  ctx.fillText(kind === "image" ? "LOOK" : "WATCH", 64, 110);
  ctx.fillStyle = "#eef7f0";
  ctx.font = "800 64px Syne, sans-serif";
  // Leave room on the right for the HTML × when this is a deletable upload
  const titleMax = reserveDelete ? 18 : thumbs ? 22 : 28;
  ctx.fillText(title.slice(0, titleMax), 64, 175);
  ctx.fillStyle = "rgba(238, 247, 240, 0.7)";
  ctx.font = "600 34px Manrope, sans-serif";
  ctx.fillText(blurb.slice(0, reserveDelete ? 28 : 40), 260, 110);
  if (thumbs > 0) {
    ctx.font = "800 72px Manrope, Apple Color Emoji, Segoe UI Emoji, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(thumbs > 1 ? `👍${thumbs}` : "👍", 960, 155);
    ctx.textAlign = "left";
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createThumbsBadgeTexture(count) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(6, 16, 12, 0.55)";
  roundRect(ctx, 24, 24, 208, 208, 48);
  ctx.fill();
  ctx.font = "160px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👍", 128, 118);
  if (count > 1) {
    ctx.font = "700 56px Manrope, sans-serif";
    ctx.fillStyle = "#eef7f0";
    ctx.fillText(String(count), 128, 200);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function refreshNodeChrome(node) {
  if (!node?.label) return;
  const old = node.label.material.map;
  node.label.material.map = createLabelTexture(node.title, node.blurb || "", {
    reserveDelete: Boolean(node.deletable),
    thumbs: node.thumbs || 0,
    kind: node.kind || "video",
  });
  node.label.material.needsUpdate = true;
  old?.dispose?.();

  const count = node.thumbs || 0;
  if (count > 0) {
    if (!node.thumbsBadge) {
      const badge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({
          transparent: true,
          side: THREE.DoubleSide,
          depthTest: false,
        })
      );
      badge.position.set(0.95, 0.55, 0.04);
      node.group.add(badge);
      node.thumbsBadge = badge;
    }
    const prev = node.thumbsBadge.material.map;
    node.thumbsBadge.material.map = createThumbsBadgeTexture(count);
    node.thumbsBadge.material.needsUpdate = true;
    node.thumbsBadge.visible = true;
    prev?.dispose?.();
    // Keep badge in the top-right of the current video plane
    const w = node.screen?.geometry?.parameters?.width || 2.4;
    const h = node.screen?.geometry?.parameters?.height || 1.35;
    node.thumbsBadge.position.set(w * 0.42, h * 0.38, 0.04);
  } else if (node.thumbsBadge) {
    node.thumbsBadge.visible = false;
  }
}

function showThumbsBurst() {
  if (!reactBurst) return;
  reactBurst.hidden = false;
  reactBurst.classList.remove("is-on");
  // Retrigger CSS animation
  void reactBurst.offsetWidth;
  reactBurst.classList.add("is-on");
  clearTimeout(showThumbsBurst._t);
  showThumbsBurst._t = setTimeout(() => {
    reactBurst.classList.remove("is-on");
    reactBurst.hidden = true;
  }, 1100);
}

function addThumbsUp(node) {
  if (!node) return;
  node.thumbs = (node.thumbs || 0) + 1;
  refreshNodeChrome(node);
  showThumbsBurst();
  if (state.focused === node) {
    focusLabel.textContent = `${node.title} 👍`;
  }
  setStatus(`👍 on “${node.title}”`);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeVideoElement(src) {
  const video = document.createElement("video");
  video.src = src;
  // Blob/object URLs break if crossOrigin is forced
  if (!src.startsWith("blob:") && !src.startsWith("file:")) {
    video.crossOrigin = "anonymous";
  }
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  return video;
}

function nextRingPosition(index) {
  const radius = 3.6 + Math.floor(index / 8) * 1.15;
  const angle = (index * 2.399) % (Math.PI * 2); // golden-angle spread
  const y = 1.25 + (index % 3) * 0.18;
  return [Math.sin(angle) * radius, y, -Math.cos(angle) * radius];
}

/** Place along the current camera aim — where the phone is pointed when adding. */
function placementFromAim(spreadIndex = 0, spreadCount = 1) {
  if (!camera) return nextRingPosition(spreadIndex);

  camera.getWorldDirection(_forward);
  if (_forward.lengthSq() < 0.0001) _forward.set(0, 0, -1);

  _right.crossVectors(_forward, _worldUp);
  if (_right.lengthSq() < 0.0001) {
    _right.set(1, 0, 0);
  } else {
    _right.normalize();
  }

  const distance = 3.8;
  const spread = (spreadIndex - (spreadCount - 1) / 2) * 1.35;
  _place
    .copy(camera.position)
    .addScaledVector(_forward, distance)
    .addScaledVector(_right, spread);

  // Keep screens near eye height if the user is aiming almost flat
  if (Math.abs(_forward.y) < 0.35) {
    _place.y = camera.position.y + spreadIndex * 0.05;
  }

  return [_place.x, _place.y, _place.z];
}

function applyMediaAspect(node, width, height) {
  if (!node?.screen || !width || !height) return;
  const aspect = width / height;
  // Creations float a bit larger; videos keep the existing phone-friendly size
  const base = node.kind === "image" ? 2.1 : 2.4;
  const finalW = aspect >= 1 ? base : base * aspect;
  const finalH = finalW / aspect;

  node.screen.geometry.dispose();
  node.screen.geometry = new THREE.PlaneGeometry(finalW, finalH);
  node.frame.geometry.dispose();
  node.frame.geometry = new THREE.PlaneGeometry(finalW + 0.14, finalH + 0.14);
  node.label.position.set(0, finalH * 0.5 + 0.55, 0.02);
  node.beacon.position.set(0, -finalH * 0.5 - 0.35, 0.05);
  node.screen.position.y = 0;
  node.frame.position.y = 0;
  if (node.thumbsBadge) {
    node.thumbsBadge.position.set(finalW * 0.42, finalH * 0.38, 0.04);
  }
  syncCreationStand(node);
}

function applyVideoAspect(node) {
  const w = node.video?.videoWidth || 0;
  const h = node.video?.videoHeight || 0;
  if (w > 1 && h > 1) applyMediaAspect(node, w, h);
}

function createNode(item, index) {
  const group = new THREE.Group();
  group.position.set(...item.position);
  const kind = item.kind === "image" ? "image" : "video";

  let video = null;
  let texture;
  let pendingImage = null;
  let animCanvas = null;
  let animCtx = null;
  const animFrames = Array.isArray(item.animFrames) ? item.animFrames.slice() : [];

  if (kind === "image") {
    animCanvas = document.createElement("canvas");
    animCanvas.width = 768;
    animCanvas.height = 768;
    animCtx = animCanvas.getContext("2d");
    texture = new THREE.CanvasTexture(animCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    if (item.src && !animFrames.length) {
      pendingImage = new Image();
      if (!String(item.src).startsWith("blob:")) pendingImage.crossOrigin = "anonymous";
    }
  } else {
    video = makeVideoElement(item.src);
    texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
  }

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.35),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: kind === "image",
      alphaTest: kind === "image" ? 0.08 : 0,
      depthWrite: kind !== "image",
    })
  );
  screen.position.y = 0.2;
  screen.userData.hit = true;

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(2.56, 1.51),
    new THREE.MeshBasicMaterial({
      color: 0xc6ff4a,
      transparent: true,
      opacity: kind === "image" ? 0 : 0.18,
      side: THREE.DoubleSide,
    })
  );
  frame.position.z = -0.01;
  frame.position.y = 0.2;
  frame.visible = kind !== "image";

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({
      map: createLabelTexture(item.title, item.blurb, {
        reserveDelete: Boolean(item.deletable),
        kind,
      }),
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  label.position.set(0, 1.2, 0.02);
  label.visible = kind !== "image";

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xc6ff4a })
  );
  beacon.position.set(0, -0.65, 0.05);

  group.add(frame, screen, label, beacon);
  scene.add(group);

  const radar = document.createElement("span");
  const isUserPin = Boolean(item.deletable || item.worldLocked);
  radar.className = isUserPin ? "radar-dot radar-dot--user" : "radar-dot";
  radar.title = isUserPin
    ? kind === "image"
      ? "Your creation"
      : "Your recording"
    : item.title || "Video";
  radarDots.appendChild(radar);

  const node = {
    ...item,
    kind,
    demo: Boolean(item.demo),
    deletable: Boolean(item.deletable),
    thumbs: Number(item.thumbs) || 0,
    lat: item.lat ?? null,
    lng: item.lng ?? null,
    worldLocked: Boolean(item.worldLocked),
    inRange: item.lat == null ? true : Boolean(item.inRange),
    anchorX: item.position[0],
    anchorZ: item.position[2],
    group,
    screen,
    frame,
    label,
    beacon,
    video,
    texture,
    radar,
    flying: kind === "image" && Boolean(item.flying || isFlyingSubject(item.title)),
    settled: kind !== "image" ? true : Boolean(item.flying || item.settled),
    velY: Number(item.velY) || 0,
    restY: kind === "image" && !(item.flying || isFlyingSubject(item.title)) ? 1.07 : item.position[1],
    baseY: item.position[1],
    phase: index * 1.1,
    previewing: false,
    animFrames,
    animCanvas,
    animCtx,
    animIndex: -1,
    animUrls: Array.isArray(item.animUrls) ? item.animUrls.slice() : [],
  };
  if (node.lat != null) {
    node.group.visible = node.inRange;
    node.radar.style.display = node.inRange ? "" : "none";
  }

  if (video) {
    const onMeta = () => applyVideoAspect(node);
    if (video.readyState >= 1) onMeta();
    else video.addEventListener("loadedmetadata", onMeta, { once: true });
  }

  const paintFrame = (img) => {
    if (!node.animCanvas || !node.animCtx || !img) return;
    const w = img.naturalWidth || img.width || 768;
    const h = img.naturalHeight || img.height || 768;
    if (node.animCanvas.width !== w || node.animCanvas.height !== h) {
      node.animCanvas.width = w;
      node.animCanvas.height = h;
    }
    node.animCtx.clearRect(0, 0, node.animCanvas.width, node.animCanvas.height);
    node.animCtx.drawImage(img, 0, 0);
    node.texture.needsUpdate = true;
    applyMediaAspect(node, w, h);
  };

  if (pendingImage) {
    pendingImage.onload = () => {
      node.animFrames = [pendingImage];
      paintFrame(pendingImage);
    };
    pendingImage.onerror = () => {
      console.warn("Creation image failed to decode");
      setStatus("Creation image failed to load", 3200);
    };
    pendingImage.src = item.src;
  } else if (animFrames.length) {
    paintFrame(animFrames[0]);
    node.animIndex = 0;
  }

  if (node.thumbs > 0) refreshNodeChrome(node);

  return node;
}

function disposeNode(node) {
  scene.remove(node.group);
  node.radar?.remove();
  removeLeafletMarker(node);
  if (node.video) {
    try {
      node.video.pause();
    } catch {
      /* ignore */
    }
    node.video.removeAttribute("src");
    node.video.load();
  }
    if (node.objectUrl) URL.revokeObjectURL(node.objectUrl);
  if (Array.isArray(node.animUrls)) {
    for (const u of node.animUrls) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
  }
node.texture?.dispose();
  node.screen.geometry.dispose();
  node.frame.geometry.dispose();
  node.label.geometry.dispose();
  node.beacon.geometry.dispose();
  node.screen.material.dispose();
  node.frame.material.dispose();
  node.label.material.map?.dispose();
  node.label.material.dispose();
  node.beacon.material.dispose();
  if (node.thumbsBadge) {
    node.thumbsBadge.geometry.dispose();
    node.thumbsBadge.material.map?.dispose();
    node.thumbsBadge.material.dispose();
  }
}

function removeNode(node) {
  if (!node?.deletable) return;

  if (node.cloudId) {
    deleteSpot(node.cloudId, node.storagePath, node.deleteToken).catch((err) =>
      console.warn("Cloud delete failed", err)
    );
  }

  if (state.watchingNode === node) closeTheaterMode();
  disposeNode(node);
  state.nodes = state.nodes.filter((n) => n !== node);

  if (state.focused === node) setFocus(null);
  else updateDeleteControls();

  if (state.mapOpen) refreshMapList();
  syncLeafletMarkers();
  setStatus(`Removed ${node.title}`);
}

function updateDeleteControls() {
  const canDelete = Boolean(state.focused?.deletable) && !state.watching;
  deleteBtn.hidden = !canDelete;
  if (!canDelete) {
    deleteBtn.style.visibility = "hidden";
  }
  if (theaterDelete) {
    theaterDelete.hidden = !(
      state.watching && state.watchingNode?.deletable
    );
  }
}

/** Pin the × to the right side of the title label (red-circle spot). */
function positionDeleteBtn() {
  const node = state.focused;
  if (!node?.deletable || state.watching || deleteBtn.hidden || !camera || !node.label) {
    return;
  }

  const w = (node.label.geometry.parameters?.width ?? 2.2) * 0.5;
  // Sit in the title bar on the far right, vertically centered in the label
  _corner.set(w - 0.12, 0.02, 0.05);
  node.label.localToWorld(_corner);
  _corner.project(camera);

  if (_corner.z > 1) {
    deleteBtn.style.visibility = "hidden";
    return;
  }

  const x = (_corner.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-_corner.y * 0.5 + 0.5) * window.innerHeight;
  deleteBtn.style.visibility = "visible";
  deleteBtn.style.left = `${x}px`;
  deleteBtn.style.top = `${y}px`;
}

function buildScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.4, 0);

  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const hemi = new THREE.HemisphereLight(0xe8ffe0, 0x102018, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(2, 4, 1);
  scene.add(key);

  const ground = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 8.5, 64),
    new THREE.MeshBasicMaterial({
      color: 0xc6ff4a,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.01;
  scene.add(ground);

  state.nodes = CATALOG.map((item, index) => createNode(item, index));
  anchorDemoVideosToLaunch();
  updateGeoAnchors();
}

function getScreenOrientRad() {
  const angle =
    screen.orientation?.angle ??
    (typeof window.orientation === "number" ? window.orientation : 0);
  return THREE.MathUtils.degToRad(angle);
}

function setDeviceQuaternion(alphaDeg, betaDeg, gammaDeg, compassDeg) {
  const alpha = THREE.MathUtils.degToRad(alphaDeg);
  const beta = THREE.MathUtils.degToRad(betaDeg);
  const gamma = THREE.MathUtils.degToRad(gammaDeg);
  const orient = getScreenOrientRad();

  // Device frame → world, then aim through the back camera
  _euler.set(beta, alpha, -gamma, "YXZ");
  _deviceQuat.setFromEuler(_euler);
  _deviceQuat.multiply(_q1);
  _deviceQuat.multiply(_q0.setFromAxisAngle(_zee, -orient));

  // Align scene north (-Z) with real compass north once, so GPS directions
  // stored while recording stay true across sessions and devices.
  if (!state.northAligned && compassDeg != null && Number.isFinite(compassDeg)) {
    _northForward.set(0, 0, -1).applyQuaternion(_deviceQuat);
    _northForward.y = 0;
    // Wait until the phone is upright enough for a stable heading
    if (_northForward.lengthSq() > 0.12) {
      _northForward.normalize();
      const sceneYaw = Math.atan2(_northForward.x, -_northForward.z);
      const trueYaw = THREE.MathUtils.degToRad(compassDeg);
      _northQuat.setFromAxisAngle(_worldUp, sceneYaw - trueYaw);
      state.northAligned = true;
    }
  }
  if (state.northAligned) _deviceQuat.premultiply(_northQuat);

  state.orientReady = true;
}

function updateCameraRig(dt) {
  _offsetQuat.setFromEuler(
    new THREE.Euler(state.offsetPitch, state.offsetYaw, 0, "YXZ")
  );

  if (state.orientReady) {
    // World-locked look: phone gyro drives the camera; drag is a small calibration offset
    _targetQuat.copy(_deviceQuat).multiply(_offsetQuat);
  } else {
    // Desktop / no gyro: free-look from drag / keys only
    _targetQuat.copy(_offsetQuat);
  }

  // Fast slerp keeps screens feeling glued in space while softening sensor noise
  const blend = state.hasGyro ? Math.min(1, dt * 28) : Math.min(1, dt * 14);
  camera.quaternion.slerp(_targetQuat, blend);
}

function updateNodes(t, dt) {
  for (const node of state.nodes) {
    if (node.anchorX != null) node.group.position.x = node.anchorX;
    if (node.anchorZ != null) node.group.position.z = node.anchorZ;

    if (node.kind === "image") {
      if (node.flying) {
        node.group.position.y =
          node.baseY + Math.sin(t * 1.35 + node.phase) * 0.18;
      } else {
        if (!node.settled) {
          node.velY = (node.velY || 0) - 9.8 * dt;
          node.baseY += node.velY * dt;
          const floorY = node.restY ?? 0.7;
          if (node.baseY <= floorY) {
            node.baseY = floorY;
            if (node.velY < -2.4) node.velY = -node.velY * 0.22;
            else {
              node.velY = 0;
              node.settled = true;
            }
          }
        }
        node.group.position.y = node.baseY;
      }
      if (node.beacon) node.beacon.visible = false;
    } else {
      node.group.position.y = node.baseY + Math.sin(t * 1.2 + node.phase) * 0.08;
      node.beacon.scale.setScalar(1 + Math.sin(t * 3 + node.phase) * 0.25);
    }

    const hot = state.focused === node;
    if (node.kind === "image") {
      node.frame.visible = false;
      // Flipbook + idle sway so creations feel alive
      if (node.animFrames?.length > 1 && node.animCtx) {
        const fps = 7;
        const idx = Math.floor(t * fps) % node.animFrames.length;
        if (idx !== node.animIndex) {
          node.animIndex = idx;
          const img = node.animFrames[idx];
          if (img) {
            node.animCtx.clearRect(0, 0, node.animCanvas.width, node.animCanvas.height);
            node.animCtx.drawImage(img, 0, 0);
            node.texture.needsUpdate = true;
          }
        }
      }
      const swayAmp = node.flying ? 0.055 : 0.028;
      const sway = Math.sin(t * 2.4 + node.phase) * swayAmp;
      const breathe = 1 + Math.sin(t * 3.1 + node.phase) * (node.flying ? 0.04 : 0.02);
      node.screen.rotation.z = sway;
      node.screen.scale.setScalar(breathe);
    } else {
      node.frame.material.opacity = hot ? 0.55 : 0.16;
      node.screen.rotation.z = 0;
      node.screen.scale.set(1, 1, 1);
      node.beacon.material.color.set(hot ? 0xffffff : 0xc6ff4a);
    }

    // Billboard: readable from any direction when in range
    const dx = camera.position.x - node.group.position.x;
    const dz = camera.position.z - node.group.position.z;
    node.group.rotation.y = Math.atan2(dx, dz);
  }
}

function isNodeInView(node) {
  if (!node?.group?.visible) return false;
  camera.getWorldDirection(_forward);
  _to.copy(node.group.position).sub(camera.position);
  const dist = _to.length();
  if (dist < 0.35 || dist > GEO_RANGE_M + 4) return false;
  _to.normalize();
  const ang = Math.acos(THREE.MathUtils.clamp(_forward.dot(_to), -1, 1));
  // Same aim cone as lock-on — only then count as "in view"
  return ang <= 0.48;
}

function updateRadar() {
  const radius = 34;
  const center = 42;
  camera.getWorldDirection(_forward);
  const yaw = Math.atan2(_forward.x, _forward.z);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);

  for (const node of state.nodes) {
    if (!node.radar || node.radar.style.display === "none") continue;

    const dx = node.group.position.x - camera.position.x;
    const dz = node.group.position.z - camera.position.z;
    const right = dx * cos - dz * sin;
    const forward = dx * sin + dz * cos;
    const dist = Math.hypot(right, forward) || 1;
    const clamped = Math.min(dist / 6.5, 1);
    const x = center - (right / dist) * radius * clamped;
    const y = center - (forward / dist) * radius * clamped;
    node.radar.style.left = `${x}px`;
    node.radar.style.top = `${y}px`;

    // Green only when that video is actually in the camera view
    const inView = isNodeInView(node);
    node.radar.classList.toggle("is-in-view", inView);
    node.radar.classList.remove("is-hot", "is-ahead");
  }
}

function getLookYaw() {
  if (!camera) return state.lastYaw ?? 0;
  camera.getWorldDirection(_forward);
  let x = _forward.x;
  let z = _forward.z;

  // Holding the phone flat to read the map collapses forward's ground
  // projection. Fall back to the phone's top edge (camera up) for heading:
  // looking down, camera-up points where the top of the phone faces.
  if (Math.hypot(x, z) < 0.35) {
    _upHeading.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const sign = _forward.y < 0 ? 1 : -1;
    x = _upHeading.x * sign;
    z = _upHeading.z * sign;
  }

  if (Math.hypot(x, z) < 0.05) return state.lastYaw ?? 0;
  state.lastYaw = Math.atan2(x, -z);
  return state.lastYaw;
}

function nodeGroundOffset(node) {
  const user = state.userGeo || state.originGeo;
  if (user && node.lat != null && node.lng != null) {
    const enu = enuFromOrigin(user.lat, user.lng, node.lat, node.lng);
    return { east: enu.x, north: -enu.z };
  }
  if (camera && node.group) {
    return {
      east: node.group.position.x - camera.position.x,
      north: -(node.group.position.z - camera.position.z),
    };
  }
  return {
    east: node.anchorX ?? 0,
    north: -(node.anchorZ ?? 0),
  };
}

function removeLeafletMarker(_node) {
  // Clusters are rebuilt from live nodes; drop stale markers via sync.
  if (state.leafletMap) syncLeafletMarkers();
}

/** Group videos within ~40 m so one callout can show the count. */
function clusterMapNodes(nodes) {
  const clusters = [];
  const assigned = new Set();
  const maxM = 40;

  for (const node of nodes) {
    if (node.lat == null || node.lng == null || assigned.has(node.id)) continue;
    const group = [node];
    assigned.add(node.id);
    for (const other of nodes) {
      if (other.lat == null || other.lng == null || assigned.has(other.id)) continue;
      const d = haversineMeters(node.lat, node.lng, other.lat, other.lng);
      if (d <= maxM) {
        group.push(other);
        assigned.add(other.id);
      }
    }
    const lat = group.reduce((s, n) => s + n.lat, 0) / group.length;
    const lng = group.reduce((s, n) => s + n.lng, 0) / group.length;
    // Prefer the most recently added node in this cluster as the tap target
    group.sort(
      (a, b) => state.nodes.indexOf(b) - state.nodes.indexOf(a)
    );
    clusters.push({
      id: `c:${group
        .map((n) => n.id)
        .sort()
        .join("|")}`,
      lat,
      lng,
      count: group.length,
      nodes: group,
      primary: group[0],
    });
  }
  return clusters;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function movieCalloutHtml(count, selected = false) {
  const sel = selected ? " is-selected" : "";
  return `
    <div class="map-callout${sel}">
      <div class="map-callout-bubble">
        <span class="map-callout-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/>
            <path d="M8 5V3M16 5V3M3 10h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10 12.2l5 2.8-5 2.8v-5.6z" fill="currentColor"/>
          </svg>
        </span>
        <span class="map-callout-count">${count}</span>
      </div>
      <span class="map-callout-tail" aria-hidden="true"></span>
    </div>
  `.trim();
}

function selectMapCluster(clusterId) {
  state.selectedClusterId =
    state.selectedClusterId === clusterId ? null : clusterId;
  syncLeafletMarkers();
  refreshMapList();
  if (mapSupport) {
    mapSupport.textContent = state.selectedClusterId
      ? "Showing clips at this pin · tap again to clear."
      : "Pinch to zoom, drag to pan.";
  }
}

function clearMapClusterSelection() {
  if (!state.selectedClusterId) return;
  state.selectedClusterId = null;
  syncLeafletMarkers();
  refreshMapList();
  if (mapSupport && state.mapOpen) {
    mapSupport.textContent = "Pinch to zoom, drag to pan.";
  }
}

/** Add/move a callout for each video cluster; drop markers for removed ones. */
function syncLeafletMarkers() {
  if (!state.leafletMap || !window.L) return;
  const L = window.L;
  const geoNodes = state.nodes.filter((n) => n.lat != null && n.lng != null);
  const clusters = clusterMapNodes(geoNodes);
  const liveIds = new Set(clusters.map((c) => c.id));

  if (state.selectedClusterId && !liveIds.has(state.selectedClusterId)) {
    state.selectedClusterId = null;
  }

  for (const cluster of clusters) {
    let marker = state.leafletMarkers.get(cluster.id);
    const selected = state.selectedClusterId === cluster.id;
    const title =
      cluster.count === 1
        ? cluster.primary.title
        : `${cluster.count} videos here`;
    const iconOpts = {
      className: "map-callout-icon-wrap",
      html: movieCalloutHtml(cluster.count, selected),
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    };
    const bindClick = (m, c) => {
      m.off("click");
      m.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        selectMapCluster(c.id);
      });
    };
    if (!marker) {
      marker = L.marker([cluster.lat, cluster.lng], {
        icon: L.divIcon(iconOpts),
        title,
        riseOnHover: true,
        zIndexOffset: selected ? 600 : 400,
      }).addTo(state.leafletMap);
      marker._lumenCount = cluster.count;
      marker._lumenSelected = selected;
      bindClick(marker, cluster);
      state.leafletMarkers.set(cluster.id, marker);
    } else {
      marker.setLatLng([cluster.lat, cluster.lng]);
      if (
        marker._lumenCount !== cluster.count ||
        marker._lumenSelected !== selected
      ) {
        marker._lumenCount = cluster.count;
        marker._lumenSelected = selected;
        marker.setIcon(L.divIcon(iconOpts));
      }
      marker.setZIndexOffset(selected ? 600 : 400);
      marker.options.title = title;
      bindClick(marker, cluster);
    }
  }

  for (const [id, marker] of state.leafletMarkers) {
    if (!liveIds.has(id)) {
      marker.remove();
      state.leafletMarkers.delete(id);
    }
  }
}

/** Zoom/pan to fit the user and every geo-tagged video. */
function fitMapToPins() {
  if (!state.leafletMap || !window.L) return;
  const L = window.L;
  const origin = state.userGeo || state.originGeo;
  const points = origin ? [[origin.lat, origin.lng]] : [];
  for (const node of state.nodes) {
    if (node.lat != null && node.lng != null) points.push([node.lat, node.lng]);
  }
  if (!points.length) return;
  if (points.length === 1) {
    state.leafletMap.setView(points[0], 17);
  } else {
    state.leafletMap.fitBounds(L.latLngBounds(points), {
      padding: [32, 32],
      maxZoom: 18,
    });
  }
}

let leafletPromise = null;

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(link);
  });
}

function loadLeaflet() {
  if (!leafletPromise) {
    leafletPromise = (async () => {
      await loadStylesheet(
        "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css"
      );
      await loadScript("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js");
      return window.L;
    })().catch((err) => {
      leafletPromise = null;
      throw err;
    });
  }
  return leafletPromise;
}

/** Build the real map once; safe to call again on every open. */
async function ensureLeafletMap(origin) {
  const L = await loadLeaflet();
  if (!state.leafletMap) {
    const el = document.getElementById("leaflet-map");
    state.leafletMap = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      center: [origin.lat, origin.lng],
      zoom: 16,
      maxZoom: 19,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      subdomains: "abc",
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(state.leafletMap);

    const youIcon = L.divIcon({
      className: "map-you-icon",
      html: `<span class="map-you-dot" aria-hidden="true"><span class="map-you-pulse"></span></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    state.leafletYou = L.marker([origin.lat, origin.lng], {
      icon: youIcon,
      interactive: false,
      // Stay under callout pins so the blue dot never covers them
      zIndexOffset: -200,
    }).addTo(state.leafletMap);

    state.leafletMap.on("click", () => clearMapClusterSelection());
  }
  // Container was hidden (display:none) while created, so Leaflet needs a nudge
  requestAnimationFrame(() => state.leafletMap?.invalidateSize());
  syncLeafletMarkers();
}

/** Under ¼ mile → feet; over → quarter-mile steps ("5½ miles"). */
function formatMapDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1320) return `${Math.max(1, Math.round(feet))} ft`;
  const quarters = Math.round((feet / 5280) * 4) / 4;
  const whole = Math.floor(quarters);
  const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[quarters - whole] || "";
  const num = whole ? `${whole}${frac}` : frac;
  return `${num} ${quarters <= 1 ? "mile" : "miles"}`;
}

// Reverse-geocode cache: pins cluster, so round to ~100m cells
const placeCache = new Map();

function lookupPlace(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (placeCache.has(key)) return placeCache.get(key);
  placeCache.set(key, null); // pending

  fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
  )
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      const city = data.city || data.locality || "";
      const stateCode =
        (data.principalSubdivisionCode || "").split("-").pop() ||
        data.principalSubdivision ||
        "";
      const place =
        city && stateCode ? `${city}, ${stateCode}` : city || stateCode;
      if (place) {
        placeCache.set(key, place);
        if (state.mapOpen) refreshMapList();
      }
    })
    .catch(() => {});
  return null;
}

function buildMapListRow(node) {
  const li = document.createElement("li");
  li.innerHTML = `
    <button type="button" class="map-list-play" aria-label="Watch">
      <span class="map-thumb"><span class="map-thumb-ph"></span></span>
      <span class="map-list-body">
        <span class="map-list-title"></span>
        <span class="map-list-meta"></span>
      </span>
    </button>
    <span class="map-list-dir">
      <span class="map-list-arrow">
        <svg viewBox="0 0 24 24"><path d="M12 2 L19 15 L12 11.6 L5 15 Z" /></svg>
      </span>
      <span class="map-list-dist"></span>
    </span>
  `;
  const play = li.querySelector(".map-list-play");
  play.addEventListener("click", () => openTheater(node, { fromMap: true }));
  return {
    li,
    play,
    thumbWrap: li.querySelector(".map-thumb"),
    title: li.querySelector(".map-list-title"),
    meta: li.querySelector(".map-list-meta"),
    dist: li.querySelector(".map-list-dist"),
    arrow: li.querySelector(".map-list-arrow"),
    thumbSrc: null,
  };
}

/** Rewrite only what changed per row — avoids re-decoding thumbnails every tick. */
function refreshMapList() {
  if (!mapList) return;

  let sourceNodes = state.nodes;
  if (state.selectedClusterId) {
    const geoNodes = state.nodes.filter((n) => n.lat != null && n.lng != null);
    const cluster = clusterMapNodes(geoNodes).find(
      (c) => c.id === state.selectedClusterId
    );
    sourceNodes = cluster ? cluster.nodes : state.nodes;
  }

  const rows = sourceNodes
    .map((node) => {
      const off = nodeGroundOffset(node);
      const dist = Math.hypot(off.east, off.north);
      return { node, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  if (!rows.length) {
    mapList.innerHTML = `<li class="map-list-empty">${
      state.selectedClusterId
        ? "No clips at this pin"
        : "No videos on the map yet"
    }</li>`;
    state.mapRowEls = new Map();
    return;
  }
  mapList.querySelector(".map-list-empty")?.remove();

  if (!state.mapRowEls) state.mapRowEls = new Map();
  const liveIds = new Set();

  rows.forEach(({ node, dist }, index) => {
    liveIds.add(node.id);
    let row = state.mapRowEls.get(node.id);
    if (!row) {
      row = buildMapListRow(node);
      state.mapRowEls.set(node.id, row);
    }

    // Keep DOM order matching sort order without rebuilding rows
    const atIndex = mapList.children[index];
    if (atIndex !== row.li) mapList.insertBefore(row.li, atIndex || null);

    if (row.title.textContent !== node.title) row.title.textContent = node.title;
    row.play.setAttribute(
      "aria-label",
      `${node.kind === "image" ? "View" : "Watch"} ${node.title}`
    );

    const place =
      node.lat != null && node.lng != null ? lookupPlace(node.lat, node.lng) : null;
    const meta = [node.deletable ? "Your pin" : null, place]
      .filter(Boolean)
      .join(" · ");
    if (row.meta.textContent !== meta) row.meta.textContent = meta;

    const distLabel = formatMapDistance(dist);
    if (row.dist.textContent !== distLabel) row.dist.textContent = distLabel;

    const thumb =
      node.thumbUrl || (node.storagePath ? thumbUrl(node.storagePath) : null);
    if (thumb && row.thumbSrc !== thumb) {
      row.thumbSrc = thumb;
      row.thumbWrap.innerHTML = `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" />`;
    }
  });

  for (const [id, row] of state.mapRowEls) {
    if (!liveIds.has(id)) {
      row.li.remove();
      state.mapRowEls.delete(id);
    }
  }

  state.mapArrowEls = new Map();
  for (const [id, row] of state.mapRowEls) {
    state.mapArrowEls.set(id, row.arrow);
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Per-frame while the map is open: move the "you" marker, rotate its heading,
 * and rotate each list row's arrow relative to where you're currently facing. */
function updateMapView() {
  if (!state.mapOpen) return;
  const yaw = getLookYaw();

  const origin = state.userGeo || state.originGeo;
  if (state.leafletMap && state.leafletYou) {
    if (origin) state.leafletYou.setLatLng([origin.lat, origin.lng]);
  }

  for (const node of state.nodes) {
    const arrow = state.mapArrowEls.get(node.id);
    if (!arrow) continue;
    const off = nodeGroundOffset(node);
    const bearing = Math.atan2(off.east, off.north);
    arrow.style.transform = `rotate(${((bearing - yaw) * 180) / Math.PI}deg)`;
  }
}

async function openMapModal() {
  if (!mapModal || state.watching) return;
  state.mapOpen = true;
  mapModal.hidden = false;
  refreshMapList();

  const origin = state.userGeo || state.originGeo;
  if (mapSupport) {
    mapSupport.textContent = origin
      ? "Pinch to zoom, drag to pan."
      : "Enable location to see the map.";
  }

  if (!origin) {
    if (mapViewport) {
      mapViewport.innerHTML = `<p class="map-placeholder">Enable location to see videos on the map.</p>`;
    }
    return;
  }

  if (mapViewport && !mapViewport.querySelector("#leaflet-map")) {
    mapViewport.innerHTML = `<div id="leaflet-map" class="leaflet-map"></div>`;
  }

  try {
    await ensureLeafletMap(origin);
    fitMapToPins();
  } catch (err) {
    console.warn("Map failed to load", err);
    if (mapViewport) {
      mapViewport.innerHTML = `<p class="map-placeholder">Map couldn’t load — check your connection.</p>`;
    }
  }
}

function closeMapModal() {
  if (!mapModal) return;
  state.mapOpen = false;
  state.selectedClusterId = null;
  mapModal.hidden = true;
}

/** Translucent arrow that points the way to the nearest video. */
function updateGuideArrow() {
  if (!guide || !camera) return;

  if (state.watching || state.mapOpen) {
    guide.classList.remove("is-on");
    return;
  }

  let best = null;
  let bestDist = Infinity;
  for (const node of state.nodes) {
    if (!node.group.visible) continue;
    if (node.lat != null && !node.inRange) continue;
    const d = camera.position.distanceTo(node.group.position);
    if (d < 0.35) continue;
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }

  // Nothing to point at, or it's already on screen — fade out
  if (!best || isNodeInView(best)) {
    guide.classList.remove("is-on");
    return;
  }

  _camLocal.copy(best.group.position);
  camera.worldToLocal(_camLocal);

  let rot;
  if (_camLocal.z > 0) {
    // Target is behind — steer a hard turn toward its side
    rot = (_camLocal.x >= 0 ? 1 : -1) * Math.PI * 0.72;
  } else {
    rot = Math.atan2(_camLocal.x, _camLocal.y);
  }

  const radius = 92;
  const ox = Math.sin(rot) * radius;
  const oy = -Math.cos(rot) * radius;
  guide.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
  guideArrow.style.transform = `rotate(${THREE.MathUtils.radToDeg(rot)}deg)`;

  const feet = Math.max(1, Math.round(bestDist * 3.28084));
  guideLabel.textContent = `${best.title} · ${feet} ft`;
  guide.classList.add("is-on");
}

async function ensurePreview(node) {
  if (!node || node.previewing || state.watching) return;
  if (!node.video || node.kind === "image") return;
  try {
    node.video.currentTime = Math.min(1, node.video.duration || 1);
    await node.video.play();
    node.previewing = true;
  } catch {
    // Autoplay may fail until gesture; ignore
  }
}

function pausePreviews(exceptId) {
  for (const node of state.nodes) {
    if (node.id === exceptId) continue;
    if (node.video) {
      try {
        node.video.pause();
      } catch {
        /* ignore */
      }
    }
    node.previewing = false;
  }
}

function pickCenter() {
  // Aim-cone focus: must be in range for geo pins; billboard faces you from any side
  camera.getWorldDirection(_forward);
  let best = null;
  let bestScore = Infinity;
  const maxDist = GEO_RANGE_M + 4;

  for (const node of state.nodes) {
    if (!node.group.visible) continue;
    if (node.lat != null && !node.inRange) continue;
    _to.copy(node.group.position).sub(camera.position);
    const dist = _to.length();
    if (dist < 0.35 || dist > maxDist) continue;
    _to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(_forward.dot(_to), -1, 1));
    if (ang > 0.48) continue;
    const score = ang * 2.2 + dist * 0.08;
    if (score < bestScore) {
      bestScore = score;
      best = node;
    }
  }
  return best;
}

function setFocus(node) {
  state.focused = node;
  field.classList.toggle("is-locked", Boolean(node));
  if (node) {
    focusLabel.textContent = node.thumbs
      ? `${node.title} 👍${node.thumbs > 1 ? node.thumbs : ""}`
      : node.title;
    hudHint.textContent = node.blurb || "Aim locked";
    watchBtn.disabled = false;
    watchBtn.textContent = node.kind === "image" ? "View" : "Watch";
    ensurePreview(node);
    pausePreviews(node.id);
  } else {
    focusLabel.textContent = "Scan the field";
    hudHint.textContent = defaultHudHint();
    // Keep Watch tappable so we can prompt to aim (disabled buttons eat taps on iOS)
    watchBtn.disabled = false;
    watchBtn.textContent = "Watch";
    pausePreviews(null);
  }
  updateDeleteControls();
}

function openTheater(node, opts = {}) {
  if (!node) return;
  const fromMap = Boolean(opts.fromMap) || state.mapOpen;
  closeMapModal();
  closeConfirmModal();
  closeAddModal();
  state.watching = true;
  state.watchingNode = node;
  state.theaterFromMap = fromMap;
  pausePreviews(null);
  field.classList.add("is-watching");
  theater.hidden = false;
  theaterTitle.textContent = node.thumbs
    ? `${node.title} 👍${node.thumbs > 1 ? node.thumbs : ""}`
    : node.title;
  theaterDelete.hidden = !node.deletable;

  const isImage = node.kind === "image";
  theaterScreenWrap?.classList.toggle("is-image", isImage);
  if (theaterImage) theaterImage.hidden = !isImage;
  if (theaterVideo) theaterVideo.hidden = isImage;

  if (isImage) {
    theaterVideo.pause();
    theaterVideo.removeAttribute("src");
    theaterVideo.load();
    stopTheaterImageAnim();
    theaterImage.alt = node.title || "Creation";
    const frames = node.animFrames?.length
      ? node.animFrames
      : null;
    if (frames?.length) {
      let i = 0;
      const paint = () => {
        const img = frames[i % frames.length];
        if (img?.src) theaterImage.src = img.src;
        else if (node.animUrls?.[i % frames.length]) {
          theaterImage.src = node.animUrls[i % frames.length];
        }
        i += 1;
      };
      paint();
      state.theaterAnimId = setInterval(paint, 140);
    } else {
      theaterImage.src = node.src;
    }
    setStatus(`Viewing ${node.title}`);
  } else {
    stopTheaterImageAnim();
    if (theaterImage) {
      theaterImage.removeAttribute("src");
      theaterImage.alt = "";
    }
    const knownW = node.video?.videoWidth || 0;
    const knownH = node.video?.videoHeight || 0;
    theaterVideo.style.aspectRatio =
      knownW > 1 && knownH > 1 ? `${knownW} / ${knownH}` : "9 / 16";
    theaterVideo.loop = true;
    theaterVideo.removeAttribute("controls");
    theaterVideo.setAttribute("playsinline", "");
    theaterVideo.setAttribute("webkit-playsinline", "");
    theaterVideo.src = node.src;
    theaterVideo.muted = false;
    theaterVideo.play().catch(() => {
      theaterVideo.muted = true;
      theaterVideo.play().catch(() => setStatus("Tap the video to start"));
    });
    setStatus(`Watching ${node.title}`);
  }
  updateDeleteControls();
}

function closeTheaterMode() {
  const returnToMap = state.theaterFromMap;
  closeConfirmModal();
  stopTheaterImageAnim();
  state.watching = false;
  state.watchingNode = null;
  state.theaterFromMap = false;
  field.classList.remove("is-watching");
  theater.hidden = true;
  theaterDelete.hidden = true;
  theaterScreenWrap?.classList.remove("is-image");
  if (theaterImage) {
    theaterImage.hidden = true;
    theaterImage.removeAttribute("src");
    theaterImage.alt = "";
  }
  if (theaterVideo) {
    theaterVideo.hidden = false;
    theaterVideo.pause();
    theaterVideo.removeAttribute("src");
    theaterVideo.load();
  }
  if (state.focused) ensurePreview(state.focused);
  updateDeleteControls();
  if (returnToMap) openMapModal();
}

function openConfirmModal(message) {
  if (!confirmModal) return;
  if (confirmCopy) confirmCopy.textContent = message;
  confirmModal.hidden = false;
}

function closeConfirmModal() {
  if (!confirmModal) return;
  confirmModal.hidden = true;
}

function requestTheaterDelete() {
  const node = state.watchingNode || state.focused;
  if (!node?.deletable) return;
  openConfirmModal(`Delete “${node.title}”? This can’t be undone.`);
}

function stopTheaterImageAnim() {
  if (state.theaterAnimId) {
    clearInterval(state.theaterAnimId);
    state.theaterAnimId = null;
  }
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera API unavailable in this browser");
  }

  camEl.setAttribute("playsinline", "");
  camEl.setAttribute("webkit-playsinline", "");
  camEl.muted = true;
  camEl.autoplay = true;
  camEl.playsInline = true;

  // Rear camera only — uploads come from Add / camera roll
  const attempts = [
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    { audio: false, video: true },
  ];

  let stream = null;
  let lastError = null;
  for (const constraints of attempts) {
    try {
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia(constraints),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Camera request timed out")), 8000)
        ),
      ]);
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!stream) throw lastError || new Error("Could not open camera");

  camEl.srcObject = stream;
  // iOS can hang forever on await video.play() — never block the field on it
  try {
    const playPromise = camEl.play();
    if (playPromise && typeof playPromise.then === "function") {
      await Promise.race([
        playPromise,
        new Promise((resolve) => setTimeout(resolve, 1200)),
      ]);
    }
  } catch {
    // Autoplay quirks — stream is still attached; frames usually appear anyway
  }
}

async function requestMotionPermission() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      const res = await DeviceOrientationEvent.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

function enableOrientation() {
  const onOrient = (event) => {
    if (state.watching) return;
    if (event.alpha == null || event.beta == null || event.gamma == null) return;
    state.hasGyro = true;
    // iOS exposes a true compass heading; absolute Android events encode it
    // in alpha (0 = facing north → heading = 360 - alpha)
    let compass = null;
    if (typeof event.webkitCompassHeading === "number" && event.webkitCompassHeading >= 0) {
      compass = event.webkitCompassHeading;
    } else if (event.absolute === true) {
      compass = (360 - event.alpha) % 360;
    }
    setDeviceQuaternion(event.alpha, event.beta, event.gamma, compass);
  };

  let listening = false;
  const start = (type) => {
    if (listening) return;
    listening = true;
    window.addEventListener(type, onOrient, true);
  };

  if ("ondeviceorientationabsolute" in window) {
    const absHandler = (event) => {
      window.removeEventListener("deviceorientationabsolute", absHandler, true);
      start("deviceorientationabsolute");
      onOrient(event);
    };
    window.addEventListener("deviceorientationabsolute", absHandler, true);
    // Fallback if absolute never arrives (common on some phones)
    setTimeout(() => {
      if (!listening) start("deviceorientation");
    }, 1200);
  } else {
    start("deviceorientation");
  }
}

function bindLookControls() {
  let ptrStart = null;
  let ptrMoved = false;

  const onDown = (x, y) => {
    state.dragging = true;
    state.lastX = x;
    state.lastY = y;
    ptrStart = { x, y, t: performance.now() };
    ptrMoved = false;
  };
  const onMove = (x, y) => {
    if (!state.dragging || state.watching) return;
    const dx = x - state.lastX;
    const dy = y - state.lastY;
    state.lastX = x;
    state.lastY = y;
    if (ptrStart && Math.hypot(x - ptrStart.x, y - ptrStart.y) > 10) {
      ptrMoved = true;
    }
    // Manual offset (desktop free-look, or gyro calibration nudge on phone)
    state.offsetYaw -= dx * 0.005;
    state.offsetPitch -= dy * 0.004;
    state.offsetPitch = THREE.MathUtils.clamp(state.offsetPitch, -1.2, 1.2);
  };
  const onUp = (x, y) => {
    state.dragging = false;
    if (state.watching || !ptrStart) {
      ptrStart = null;
      return;
    }
    const dt = performance.now() - ptrStart.t;
    const dist = Math.hypot(x - ptrStart.x, y - ptrStart.y);
    const wasTap = !ptrMoved && dist < 14 && dt < 500;
    ptrStart = null;
    if (!wasTap) return;

    const node = pickNodeAt(x, y) || pickCenter() || state.focused;
    if (node) openTheater(node);
    else setStatus("Aim the brackets at a pin, then tap Watch", 3200);
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    onDown(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener("pointerup", (e) => onUp(e.clientX, e.clientY));
  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
    ptrStart = null;
  });
}

/** Prefer a direct hit on a pin screen/label when the user taps. */
function pickNodeAt(clientX, clientY) {
  if (!camera || !renderer || !state.nodes.length) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  _raycaster.setFromCamera(_pointerNdc, camera);

  const hitMeshes = [];
  for (const node of state.nodes) {
    if (!node.group?.visible) continue;
    if (node.lat != null && !node.inRange) continue;
    if (node.screen) hitMeshes.push(node.screen);
    if (node.label) hitMeshes.push(node.label);
    if (node.frame?.visible) hitMeshes.push(node.frame);
  }
  if (!hitMeshes.length) return null;

  const hits = _raycaster.intersectObjects(hitMeshes, false);
  if (!hits.length) return null;
  const mesh = hits[0].object;
  return (
    state.nodes.find(
      (n) => n.screen === mesh || n.label === mesh || n.frame === mesh
    ) || null
  );
}

function resolveWatchNode() {
  return state.focused || pickCenter();
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// —— Hand gestures: thumbs-up reacts on the focused video ——
let handLandmarker = null;
let handLoadPromise = null;
let lastHandVideoTs = -1;
let lastHandCheckAt = 0;
let lastThumbUpAt = 0;
let thumbGestureArmed = true;

async function ensureHandLandmarker() {
  if (handLandmarker) return handLandmarker;
  if (handLoadPromise) return handLoadPromise;
  handLoadPromise = (async () => {
    const mod = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm"
    );
    const vision = await mod.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
    );
    const options = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    };

    // GPU fails on many iPhones — fall back to CPU
    try {
      options.baseOptions.delegate = "GPU";
      handLandmarker = await mod.HandLandmarker.createFromOptions(vision, options);
    } catch (gpuErr) {
      console.warn("Hand landmarker GPU unavailable, using CPU", gpuErr);
      options.baseOptions.delegate = "CPU";
      handLandmarker = await mod.HandLandmarker.createFromOptions(vision, options);
    }
    return handLandmarker;
  })().catch((err) => {
    console.warn("Hand landmarker unavailable", err);
    handLoadPromise = null;
    return null;
  });
  return handLoadPromise;
}

function landmarkDist2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Landmark thumbs-up: thumb up, other fingertips curled. */
function isThumbsUpPose(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const thumbMcp = landmarks[2];
  const indexMcp = landmarks[5];
  const wrist = landmarks[0];

  const thumbLen = landmarkDist2d(thumbMcp, thumbTip);
  if (thumbLen < 0.06) return false;

  // Thumb tip is the highest fingertip (image y grows downward)
  const otherTips = [8, 12, 16, 20].map((i) => landmarks[i]);
  const thumbHighest = otherTips.every((t) => thumbTip.y < t.y - 0.02);
  const thumbExtended = thumbTip.y < thumbIp.y && thumbTip.y < thumbMcp.y;

  // Other fingers curled: tip below its PIP
  const curled = [8, 12, 16, 20].every((tipIdx) => {
    const tip = landmarks[tipIdx];
    const pip = landmarks[tipIdx - 2];
    return tip.y > pip.y - 0.01;
  });

  // Thumb away from the index tip
  const notPinching = landmarkDist2d(thumbTip, landmarks[8]) > 0.12;

  // Palm roughly facing camera (wrist below knuckles)
  const palmUp = wrist.y > indexMcp.y;

  return thumbHighest && thumbExtended && curled && notPinching && palmUp;
}

function updateHandGestures(nowMs) {
  if (!handLandmarker || !camEl) return;
  if (state.watching || state.mapOpen || state.booting || state.naming) return;
  if (camEl.readyState < 2 || !camEl.videoWidth) return;
  if (nowMs - lastHandCheckAt < 66) return; // ~15 fps
  lastHandCheckAt = nowMs;

  let ts = nowMs;
  if (ts <= lastHandVideoTs) ts = lastHandVideoTs + 1;
  lastHandVideoTs = ts;

  let result;
  try {
    result = handLandmarker.detectForVideo(camEl, ts);
  } catch {
    return;
  }

  const landmarks = result?.landmarks?.[0];
  if (!landmarks) {
    thumbGestureArmed = true;
    return;
  }

  if (!state.focused || !state.focused.group?.visible) {
    thumbGestureArmed = true;
    return;
  }

  const isThumb = isThumbsUpPose(landmarks);
  if (!isThumb) {
    thumbGestureArmed = true;
    return;
  }

  if (!thumbGestureArmed || nowMs - lastThumbUpAt < 1600) return;
  thumbGestureArmed = false;
  lastThumbUpAt = nowMs;
  addThumbsUp(state.focused);
}

function makePappusTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  grd.addColorStop(0, "rgba(255,255,252,0.95)");
  grd.addColorStop(0.22, "rgba(255,250,240,0.72)");
  grd.addColorStop(0.55, "rgba(245,240,230,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  // Fine filaments so it reads as a seed, not a blob
  g.strokeStyle = "rgba(255,252,245,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function fibonacciSphere(count, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push(
      new THREE.Vector3(
        Math.cos(theta) * r * radius,
        y * radius,
        Math.sin(theta) * r * radius
      )
    );
  }
  return pts;
}

function spawnDandelionPuff() {
  if (!scene || state.dandelion) return;

  const puffTex = makePappusTexture();
  const group = new THREE.Group();
  const head = new THREE.Group();
  head.position.y = 0.08;
  group.add(head);

  const stemMat = new THREE.MeshBasicMaterial({ color: 0x5a8a3a });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 1.12, 8), stemMat);
  stem.position.y = -0.56;
  group.add(stem);

  const calyx = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x3d6b24 })
  );
  head.add(calyx);

  const leaf = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x4f8a32, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
  );
  leaf.position.set(0.07, -0.72, 0.01);
  leaf.rotation.z = 0.45;
  group.add(leaf);

  const seedMat = new THREE.SpriteMaterial({
    map: puffTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.92,
  });
  const kernelMat = new THREE.MeshBasicMaterial({ color: 0x6b4a22 });
  const kernelGeo = new THREE.SphereGeometry(0.007, 6, 5);

  const seeds = [];
  const pts = fibonacciSphere(90, 0.2);
  for (let i = 0; i < pts.length; i++) {
    const local = pts[i];
    const sprite = new THREE.Sprite(seedMat.clone());
    sprite.scale.set(0.14, 0.14, 0.14);
    sprite.position.copy(local);
    head.add(sprite);

    const kernel = new THREE.Mesh(kernelGeo, kernelMat);
    kernel.position.copy(local).multiplyScalar(0.55);
    head.add(kernel);

    seeds.push({
      sprite,
      kernel,
      local: local.clone(),
      vx: 0,
      vy: 0,
      vz: 0,
      scattered: false,
      life: 0,
      maxLife: 6.5 + Math.random() * 2.4,
      spin: Math.random() * Math.PI * 2,
    });
  }

  scene.add(group);
    state.dandelion = {
    group,
    head,
    stem,
    leaf,
    seeds,
    puffTex,
    kernelGeo,
    awaitingBlow: true,
    scattered: false,
    locked: false,
    lockAt: 0.55,
    age: 0,
    blowHold: 0,
    fade: 1,
  };
  plantDandelionInFront();

  if (!state.focused) hudHint.textContent = defaultHudHint();
  setStatus("A dandelion — blow into the mic", 4200);
}

function plantDandelionInFront() {
  const d = state.dandelion;
  if (!d?.group || !camera) return;
  const flat = getLookForwardFlat();
  d.group.position.set(
    camera.position.x + flat.x * 1.55,
    1.16,
    camera.position.z + flat.z * 1.55
  );
}

function uiBlocksBlow() {
  if (state.watching || state.naming || state.mapOpen) return true;
  if (createModal && !createModal.hidden) return true;
  if (addModal && !addModal.hidden) return true;
  if (nameModal && !nameModal.hidden) return true;
  if (confirmModal && !confirmModal.hidden) return true;
  return false;
}

function sampleBlow() {
  const b = state.blow;
  if (!b?.analyser) return 0;
  if (b.ctx?.state === "suspended") b.ctx.resume().catch(() => {});
  if (!b.freq) b.freq = new Uint8Array(b.analyser.frequencyBinCount);
  if (!b.time) b.time = new Float32Array(b.analyser.fftSize);
  b.analyser.getByteFrequencyData(b.freq);
  if (typeof b.analyser.getFloatTimeDomainData === "function") {
    b.analyser.getFloatTimeDomainData(b.time);
  } else {
    const bytes = b.byteTime || (b.byteTime = new Uint8Array(b.analyser.fftSize));
    b.analyser.getByteTimeDomainData(bytes);
    for (let i = 0; i < bytes.length; i++) b.time[i] = (bytes[i] - 128) / 128;
  }

  let rms = 0;
  for (let i = 0; i < b.time.length; i++) rms += b.time[i] * b.time[i];
  rms = Math.sqrt(rms / Math.max(1, b.time.length));

  const n = b.freq.length;
  const lowEnd = Math.max(2, Math.floor(n * 0.1));
  const highStart = Math.floor(n * 0.22);
  let low = 0;
  let high = 0;
  for (let i = 0; i < lowEnd; i++) low += b.freq[i];
  for (let i = highStart; i < n; i++) high += b.freq[i];
  low /= lowEnd;
  high /= Math.max(1, n - highStart);

  // Blow is broadband hiss: energy in highs plus a noticeable RMS.
  // Speech is more low/mid; require highs so talking is less likely to trigger.
  if (rms < 0.04 || high < 16) return 0;
  if (high < low * 0.42) return 0;
  return rms * 3.2 + high / 255;
}

function scatterDandelion(strength = 1) {
  const d = state.dandelion;
  if (!d || d.scattered) return;
  d.scattered = true;
  d.awaitingBlow = false;
  d.locked = true;

  const look = getLookForward();
  const amp = THREE.MathUtils.clamp(strength, 0.55, 2.4);
  const right = new THREE.Vector3().crossVectors(look, _worldUp);
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(right, look).normalize();

  d.group.updateMatrixWorld(true);
  const headWorld = new THREE.Vector3();
  d.head.getWorldPosition(headWorld);

  for (const seed of d.seeds) {
    seed.sprite.updateMatrixWorld(true);
    const world = new THREE.Vector3();
    seed.sprite.getWorldPosition(world);
    d.head.remove(seed.sprite);
    d.head.remove(seed.kernel);
    scene.add(seed.sprite);
    scene.add(seed.kernel);
    seed.sprite.position.copy(world);
    seed.kernel.position.copy(world);

    const forwardSpeed = (2.8 + Math.random() * 2.6) * amp;
    const side = (Math.random() - 0.5) * 2.8 * amp;
    const lift = (0.35 + Math.random() * 1.4) * amp;
    seed.vx = look.x * forwardSpeed + right.x * side + up.x * lift;
    seed.vy = look.y * forwardSpeed + right.y * side + up.y * lift + 0.45;
    seed.vz = look.z * forwardSpeed + right.z * side + up.z * lift;
    seed.scattered = true;
    seed.life = 0;
  }

  if (!state.focused) hudHint.textContent = "Within 25 ft, aim from any direction";
  setStatus("Seeds on the wind", 2600);
}

function updateDandelion(t, dt) {
  const d = state.dandelion;
  if (!d) return;
  d.age += dt;

  if (!d.locked) {
    plantDandelionInFront();
    if (d.age >= d.lockAt) d.locked = true;
  }

  if (!d.scattered) {
    d.head.rotation.y = t * 0.35;
    const breathe = 1 + Math.sin(t * 1.8) * 0.04;
    d.head.scale.setScalar(breathe);
    for (const seed of d.seeds) {
      const wobble = 1 + Math.sin(t * 3.2 + seed.spin) * 0.06;
      seed.sprite.scale.set(0.14 * wobble, 0.14 * wobble, 0.14);
    }

    if (!uiBlocksBlow()) {
      const score = sampleBlow();
      if (score > 0) d.blowHold += dt;
      else d.blowHold = Math.max(0, d.blowHold - dt * 2);
      if (d.blowHold > 0.07) scatterDandelion(score || 1);
    }
    return;
  }

  // Stem leans after the blow
  d.stem.rotation.z = THREE.MathUtils.lerp(d.stem.rotation.z, 0.18, Math.min(1, dt * 2));
  d.fade = Math.max(0, d.fade - dt * 0.12);
  d.stem.material.opacity = 0.35 + d.fade * 0.65;
  d.stem.material.transparent = true;
  if (d.leaf.material) {
    d.leaf.material.opacity = d.fade * 0.7;
  }

  let alive = 0;
  for (const seed of d.seeds) {
    if (!seed.scattered) continue;
    seed.life += dt;
    if (seed.life > seed.maxLife) {
      seed.sprite.visible = false;
      seed.kernel.visible = false;
      continue;
    }
    alive += 1;
    // Light seeds: float forward, settle slowly
    seed.vy -= 1.55 * dt;
    seed.vx *= 1 - 0.55 * dt;
    seed.vz *= 1 - 0.55 * dt;
    seed.vy *= 1 - 0.28 * dt;
    seed.sprite.position.x += seed.vx * dt;
    seed.sprite.position.y += seed.vy * dt;
    seed.sprite.position.z += seed.vz * dt;
    if (seed.sprite.position.y < 0.04) {
      seed.sprite.position.y = 0.04;
      seed.vy = Math.abs(seed.vy) * 0.18;
      seed.vx *= 0.82;
      seed.vz *= 0.82;
    }
    seed.kernel.position.copy(seed.sprite.position);
    seed.kernel.position.y -= 0.012;
    const fade = 1 - seed.life / seed.maxLife;
    seed.sprite.material.opacity = 0.2 + fade * 0.72;
    const s = 0.09 + fade * 0.05;
    seed.sprite.scale.set(s, s, s);
  }

  if (alive === 0 && d.fade <= 0.02) {
    scene.remove(d.group);
    d.puffTex?.dispose();
    d.kernelGeo?.dispose();
    for (const seed of d.seeds) {
      scene.remove(seed.sprite);
      scene.remove(seed.kernel);
      seed.sprite.material?.dispose();
    }
    state.dandelion = null;
  }
}

async function startBlowMic() {
  if (state.blow || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.38;
    src.connect(analyser);
    state.blow = { stream, ctx, analyser };
  } catch (err) {
    console.warn("Mic unavailable for dandelion blow", err);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, state.clock.getDelta());
  const t = state.clock.elapsedTime;
  updateCameraRig(dt);
  updateNodes(t, dt);
  updateDandelion(t, dt);
  updateRadar();
  updateGuideArrow();
  updateMapView();
  if (state.mapOpen && t - state.mapListAt > 1.25) {
    state.mapListAt = t;
    refreshMapList();
  }
  // Keep geo pins synced if watch hasn't fired yet
  if (state.userGeo) updateGeoAnchors();

  if (!state.watching) {
    const node = pickCenter();
    if (node !== state.focused) setFocus(node);
  }

  updateHandGestures(performance.now());
  positionDeleteBtn();
  renderer.render(scene, camera);
}

function bootField(message) {
  if (state.booted) {
    setStatus(message);
    return;
  }
  state.booted = true;

  try {
    buildScene();
  } catch (err) {
    console.error(err);
    setStatus("3D view failed — try refreshing");
  }

  bindLookControls();
  enableOrientation();
  window.addEventListener("resize", onResize);

  gate.hidden = true;
  gate.setAttribute("aria-hidden", "true");
  gate.style.display = "none";
  field.hidden = false;
  field.removeAttribute("hidden");
  field.style.display = "block";

  if (renderer) animate();
  setStatus(message);
  spawnDandelionPuff();
  if (camEl.srcObject) {
    camEl.play().catch(() => {});
  }
  // Warm the hand tracker in the background
  ensureHandLandmarker().catch(() => {});

  if (state.pendingUploads.length) {
    state.nameQueue.push(...state.pendingUploads.splice(0));
    updateUploadNote(0);
  }

  (async () => {
    try {
      const geo = await readGps();
      state.userGeo = geo;
      state.originGeo = geo;
      startGeoWatch();
      anchorDemoVideosToLaunch();
      updateGeoAnchors();
    } catch (err) {
      console.warn(err);
      if (!state.dandelion?.awaitingBlow) {
        setStatus("Enable location to pin videos within 25 ft", 4500);
      }
    }
    syncSharedSpots();
    await processNameQueue();
  })();
}

/** Load everyone's shared pins from the cloud into the field. */
async function syncSharedSpots() {
  if (!cloudConfigured() || !scene) return;

  let rows = [];
  try {
    rows = await loadSpots();
  } catch (err) {
    console.warn(err);
    return;
  }

  const origin = state.userGeo || state.originGeo;
  let added = 0;

  for (const row of rows) {
    const nodeId = `spot-${row.id}`;
    if (state.nodes.some((n) => n.id === nodeId)) continue;
    // Skip clips this session already shows as freshly published uploads
    if (state.nodes.some((n) => n.cloudId === row.id)) continue;
    if (row.lat == null || row.lng == null || !row.video_path) continue;

    let position = [0, 1.4, -3.5];
    if (origin) {
      const enu = enuFromOrigin(origin.lat, origin.lng, row.lat, row.lng);
      position = [enu.x, 1.4, enu.z];
    }

    const isOwner = Boolean(row.owner) && row.owner === getDeviceId();
    const node = createNode(
      {
        id: nodeId,
        title: row.title || "Shared clip",
        blurb: isOwner ? "Your pin" : "Shared pin",
        src: videoUrl(row.video_path),
        position,
        // Own pins can be removed locally; cloud wipe needs a delete token
        // (available briefly after upload). Others stay view-only.
        deletable: isOwner,
        lat: row.lat,
        lng: row.lng,
        inRange: false,
        cloudId: row.id,
        storagePath: row.video_path,
        owner: row.owner || "",
      },
      state.nodes.length
    );
    state.nodes.push(node);
    added += 1;
  }

  if (added) {
    updateGeoAnchors();
    if (state.mapOpen) {
      refreshMapList();
      syncLeafletMarkers();
    }
    setStatus(
      added === 1 ? "Loaded 1 shared pin" : `Loaded ${added} shared pins`
    );
  }
}

async function enterField() {
  if (state.booting || state.booted) return;
  state.booting = true;
  enterBtn.disabled = true;
  enterBtn.textContent = "Opening…";

  // Ask for motion while still in the user-gesture turn (required on iOS)
  const motionOk = await requestMotionPermission();

  let cameraOk = false;
  try {
    await startCamera();
    cameraOk = true;
  } catch (err) {
    console.error(err);
    camEl.style.background =
      "radial-gradient(circle at 30% 20%, #1a3a2a, #06100c 60%)";
  }

  startBlowMic();

  if (!motionOk) {
    setStatus("Allow motion access for world-locked AR", 4200);
  }

  bootField(
    cameraOk
      ? motionOk
        ? "Thumbs-up to react · Add to pin or create"
        : "Motion blocked — drag to look · Add to pin or create"
      : "Camera blocked — drag to explore demo videos"
  );

  state.booting = false;
}

enterBtn.addEventListener("click", enterField);
watchBtn.addEventListener("click", () => {
  const node = resolveWatchNode();
  if (node) openTheater(node);
  else setStatus("Aim the brackets at a pin, then tap Watch", 3200);
});
theaterClose.addEventListener("click", closeTheaterMode);
theaterDone?.addEventListener("click", closeTheaterMode);
theaterVideo.addEventListener("click", () => {
  if (theaterVideo.paused) {
    theaterVideo.play().catch(() => {});
  } else if (theaterVideo.muted) {
    theaterVideo.muted = false;
  }
});
theaterVideo.addEventListener("loadedmetadata", () => {
  const w = theaterVideo.videoWidth;
  const h = theaterVideo.videoHeight;
  if (w > 1 && h > 1) theaterVideo.style.aspectRatio = `${w} / ${h}`;
});
radar?.addEventListener("click", (e) => {
  e.stopPropagation();
  openMapModal();
});
mapClose?.addEventListener("click", closeMapModal);
mapBackdrop?.addEventListener("click", closeMapModal);
deleteBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (state.focused?.deletable) removeNode(state.focused);
});
theaterDelete.addEventListener("click", (e) => {
  e.stopPropagation();
  requestTheaterDelete();
});
confirmCancel?.addEventListener("click", closeConfirmModal);
confirmModal?.addEventListener("click", (e) => {
  if (e.target === confirmModal) closeConfirmModal();
});
confirmOk?.addEventListener("click", (e) => {
  e.stopPropagation();
  const node = state.watchingNode || state.focused;
  closeConfirmModal();
  if (node?.deletable) removeNode(node);
});

function updateUploadNote(count) {
  if (!uploadNote) return;
  if (!count) {
    uploadNote.hidden = true;
    uploadNote.textContent = "";
    return;
  }
  uploadNote.hidden = false;
  uploadNote.textContent =
    count === 1
      ? "1 video selected — Open lens to name & pin it"
      : `${count} videos selected — Open lens to name & pin them`;
}

// —— Content-aware default names (MobileNet, lazy-loaded) ——
let visionModelPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function loadVisionModel() {
  if (!visionModelPromise) {
    visionModelPromise = (async () => {
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js"
      );
      await loadScript(
        "https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js"
      );
      return window.mobilenet.load({ version: 2, alpha: 0.5 });
    })().catch((err) => {
      visionModelPromise = null;
      throw err;
    });
  }
  return visionModelPromise;
}

/** Grab a representative frame as a square canvas for classification. */
function grabVideoFrame(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error("Frame grab failed"));
    };
    const timer = setTimeout(() => fail(new Error("Frame grab timed out")), 6000);

    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("error", () => {
      clearTimeout(timer);
      fail(video.error || new Error("Video decode failed"));
    });
    video.addEventListener(
      "loadeddata",
      () => {
        const finish = () => {
          if (settled) return;
          try {
            const size = 224;
            const c = document.createElement("canvas");
            c.width = size;
            c.height = size;
            const ctx = c.getContext("2d");
            const vw = video.videoWidth || size;
            const vh = video.videoHeight || size;
            const s = Math.min(vw, vh);
            ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, size, size);
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(c);
          } catch (err) {
            clearTimeout(timer);
            fail(err);
          }
        };
        const target = Math.min(0.6, (video.duration || 1) * 0.25);
        video.addEventListener("seeked", finish, { once: true });
        try {
          video.currentTime = target;
        } catch {
          finish();
        }
      },
      { once: true }
    );
    video.src = url;
  });
}

function titleCase(text) {
  return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1));
}

async function suggestVideoName(file) {
  const frame = await grabVideoFrame(file);
  const model = await loadVisionModel();
  const preds = await model.classify(frame);
  const label = preds?.[0]?.className?.split(",")[0]?.trim();
  if (!label) throw new Error("No label from classifier");
  return titleCase(label).slice(0, 40);
}

function fallbackName() {
  const time = new Date().toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Clip ${time}`;
}

function focusNameInput() {
  nameInput.focus();
  nameInput.select();
  try {
    nameInput.setSelectionRange(0, nameInput.value.length);
  } catch {
    /* selection not supported */
  }
}

function openNameModal(file) {
  return new Promise((resolve) => {
    state.naming = true;
    nameFile.textContent = file.name || "Video";
    nameInput.value = fallbackName();
    nameModal.hidden = false;
    // Focus synchronously — iOS only shows the keyboard inside a user gesture
    focusNameInput();

    let userTyped = false;
    const markTyped = () => {
      userTyped = true;
    };
    nameInput.addEventListener("input", markTyped);

    // Swap in a name from what's actually in the video, unless the user typed
    suggestVideoName(file)
      .then((name) => {
        if (!userTyped && !nameModal.hidden) {
          nameInput.value = name;
          focusNameInput();
        }
      })
      .catch((err) => console.warn("Name suggestion failed", err));

    const cleanup = () => {
      nameForm.removeEventListener("submit", onSubmit);
      nameCancel.removeEventListener("click", onCancel);
      nameInput.removeEventListener("input", markTyped);
      nameModal.hidden = true;
      state.naming = false;
    };

    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    const onSubmit = (e) => {
      e.preventDefault();
      const name = nameInput.value.trim().slice(0, 80);
      if (!name) return;
      cleanup();
      resolve(name);
    };

    nameForm.addEventListener("submit", onSubmit);
    nameCancel.addEventListener("click", onCancel);
  });
}

async function placeNamedVideo(file, name) {
  state.uploadCount += 1;
  const url = URL.createObjectURL(file);

  let geo = state.userGeo || state.originGeo;
  if (!geo) {
    try {
      geo = await readGps();
      state.userGeo = geo;
      state.originGeo = state.originGeo || geo;
      startGeoWatch();
    } catch (err) {
      console.warn(err);
      setStatus("Location permission needed to geo-pin videos", 4200);
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  // Place in the direction the phone is aimed right now (visual world lock).
  // GPS stores the pin's ground location for range checks and the field map.
  const position = placementAlongLook(3.2);
  const aim = aimMetersOnGround(3.2);
  const pinGeo = offsetLatLng(geo.lat, geo.lng, aim.east, aim.north);

  const node = createNode(
    {
      id: `upload-${state.uploadCount}`,
      title: name,
      blurb: "Within 25 ft · aim from any side",
      src: url,
      position,
      objectUrl: url,
      deletable: true,
      lat: pinGeo.lat,
      lng: pinGeo.lng,
      inRange: true,
      worldLocked: true,
    },
    state.nodes.length
  );
  state.nodes.push(node);
  updateGeoAnchors();
  if (state.mapOpen) {
    refreshMapList();
    syncLeafletMarkers();
  }
  setStatus(`“${name}” pinned where you’re aiming`);

  // Map-list thumbnail for this fresh upload (shared pins get Cloudinary's)
  grabVideoFrame(file)
    .then((frame) => {
      node.thumbUrl = frame.toDataURL("image/jpeg", 0.65);
      if (state.mapOpen) refreshMapList();
    })
    .catch(() => {});

  // Publish in the background so anyone, on any browser, can load this pin
  if (cloudConfigured()) {
    setStatus(`Publishing “${name}”…`, 6000);
    publishSpot(file, {
      title: name,
      lat: pinGeo.lat,
      lng: pinGeo.lng,
      owner: getDeviceId(),
    })
      .then((res) => {
        node.cloudId = res.id;
        node.storagePath = res.path;
        node.deleteToken = res.deleteToken;
        setStatus(`“${name}” shared — anyone here can watch it`);
      })
      .catch((err) => {
        console.warn(err);
        setStatus("Couldn’t publish — clip stays on this phone", 4200);
      });
  }

  return node;
}

/** Pull a short display title out of a create prompt. */
function titleFromCreatePrompt(prompt) {
  let t = String(prompt || "").trim();
  t = t.replace(/^(please\s+)?(create|make|generate|draw|show|add)\s+(me\s+)?(a|an|the)\s+/i, "");
  t = t.replace(/^(please\s+)?(create|make|generate|draw|show|add)\s+/i, "");
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "Creation";
  return t.charAt(0).toUpperCase() + t.slice(1).slice(0, 47);
}

function buildCreateImageUrl(subject) {
  const flying = isFlyingSubject(subject);
  const pose = flying
    ? "in flight, airborne, wings spread, not standing, no perch, high in the air"
    : "standing on the ground, full body, feet visible, upright";
  const prompt = [
    subject,
    pose,
    "full body",
    "centered",
    "isolated object cutout",
    "pure white background",
    "no shadow",
    "no ground",
    "no text",
    "studio product photo",
  ].join(", ");
  const seed = Math.floor(Math.random() * 1e9);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(
    prompt
  )}?width=640&height=640&nologo=true&seed=${seed}`;
}

function loadHtmlImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!String(src).startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

function withTimeout(promise, ms, label = "Timed out") {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (err) => {
        clearTimeout(id);
        reject(err);
      }
    );
  });
}

/**
 * Knock out near-white (and sampled corner) background so the creation
 * floats over the camera feed like a sticker.
 */
async function cutoutTransparentPng(sourceUrl) {
  const img = await loadHtmlImage(sourceUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    return [d[i], d[i + 1], d[i + 2]];
  };
  const corners = [
    sample(2, 2),
    sample(w - 3, 2),
    sample(2, h - 3),
    sample(w - 3, h - 3),
  ];
  const bg = corners
    .reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / corners.length);

  const dist = (r, g, b) => Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  const isBg = (r, g, b) => {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return dist(r, g, b) < 48 || (luma > 235 && dist(r, g, b) < 90);
  };

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (isBg(r, g, b)) {
      d[i + 3] = 0;
      continue;
    }
    const dd = dist(r, g, b);
    if (dd < 78) {
      d[i + 3] = Math.max(0, Math.min(255, Math.round(((dd - 48) / 30) * 255)));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return { canvas, img };
}

/** Local flipbook: warp one cutout into a looping idle animation. */
async function synthesizeAnimFrames(sourceCanvas, frameCount = 6) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const src = sourceCanvas.getContext("2d").getImageData(0, 0, w, h);
  const animFrames = [];
  const animUrls = [];

  for (let f = 0; f < frameCount; f += 1) {
    const phase = (f / frameCount) * Math.PI * 2;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const out = ctx.createImageData(w, h);
    const amp = Math.max(4, Math.round(w * 0.028));

    for (let y = 0; y < h; y += 1) {
      const wave =
        Math.sin((y / h) * Math.PI * 3 + phase) * amp +
        Math.sin((y / h) * Math.PI + phase * 1.4) * (amp * 0.35);
      const shift = Math.round(wave);
      for (let x = 0; x < w; x += 1) {
        const sx = Math.min(w - 1, Math.max(0, x - shift));
        const si = (y * w + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = src.data[si + 3];
      }
    }
    ctx.putImageData(out, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Couldn’t encode frame"))),
        "image/png"
      );
    });
    const url = URL.createObjectURL(blob);
    const img = await loadHtmlImage(url);
    animFrames.push(img);
    animUrls.push(url);
  }

  return { animFrames, animUrls, src: animUrls[0] };
}

function setCreateProgress(pct, message) {
  if (createProgress) createProgress.hidden = false;
  if (createProgressFill) {
    createProgressFill.style.width = `${Math.max(4, Math.min(100, pct))}%`;
  }
  if (createStatus) createStatus.textContent = message || "";
}

/** One network image + local animation frames (avoids multi-request hangs). */
async function generateCreationAnim(prompt, onProgress) {
  const subject = titleFromCreatePrompt(prompt);
  onProgress?.(8, "Asking for a cutout…");

  const url = buildCreateImageUrl(subject);
  const res = await withTimeout(
    fetch(url, { mode: "cors" }),
    28000,
    "Create timed out — try again"
  );
  if (!res.ok) throw new Error(`Create failed (${res.status})`);
  onProgress?.(35, "Downloading…");
  const raw = await withTimeout(res.blob(), 20000, "Download timed out");
  const rawUrl = URL.createObjectURL(raw);
  try {
    onProgress?.(55, "Cutting out the background…");
    const { canvas } = await cutoutTransparentPng(rawUrl);
    onProgress?.(72, "Animating…");
    const anim = await synthesizeAnimFrames(canvas, 6);
    onProgress?.(92, "Pinning…");
    return { title: subject, ...anim };
  } finally {
    URL.revokeObjectURL(rawUrl);
  }
}

async function placeNamedCreation(creation) {
  state.uploadCount += 1;
  const { title: name, animFrames, animUrls, src } = creation;

  let geo = state.userGeo || state.originGeo;
  if (!geo) {
    try {
      geo = await readGps();
      state.userGeo = geo;
      state.originGeo = state.originGeo || geo;
      startGeoWatch();
    } catch (err) {
      console.warn(err);
      setStatus("Location permission needed to geo-pin creations", 4200);
      throw err;
    }
  }

  const flying = isFlyingSubject(name);
  const spawnY = flying ? 2.72 : (camera?.position.y ?? 1.4) + 1.05;
  const position = placementAlongLook(3.2, spawnY);
  const aim = aimMetersOnGround(3.2);
  const pinGeo = offsetLatLng(geo.lat, geo.lng, aim.east, aim.north);

  const node = createNode(
    {
      id: `create-${state.uploadCount}`,
      kind: "image",
      title: name,
      blurb: flying ? "Flying above · aim from any side" : "On the ground · aim from any side",
      src,
      animFrames,
      animUrls,
      position,
      flying,
      settled: flying,
      deletable: true,
      lat: pinGeo.lat,
      lng: pinGeo.lng,
      inRange: true,
      worldLocked: true,
    },
    state.nodes.length
  );
  state.nodes.push(node);
  updateGeoAnchors();
  if (state.mapOpen) {
    refreshMapList();
    syncLeafletMarkers();
  }
  node.thumbUrl = src;
  setFocus(node);
  setStatus(
    flying ? `“${name}” is flying where you’re aiming` : `“${name}” landed where you’re aiming`
  );
  return node;
}

function closeAddModal() {
  if (addModal) addModal.hidden = true;
}

function openAddModal() {
  if (!addModal) return;
  if (state.watching || state.naming) return;
  closeCreateModal(true);
  addModal.hidden = false;
}

function closeCreateModal(silent = false) {
  if (!createModal) return;
  createModal.hidden = true;
  if (createProgress) createProgress.hidden = true;
  if (createProgressFill) createProgressFill.style.width = "8%";
  if (createStatus) createStatus.textContent = "";
  if (createSubmit) {
    createSubmit.disabled = false;
    createSubmit.textContent = "Create here";
  }
  if (createInput) createInput.disabled = false;
  if (createCancel) createCancel.disabled = false;
  if (!silent && createInput) createInput.value = "";
}

function openCreateModal() {
  if (!createModal) return;
  closeAddModal();
  if (createProgress) createProgress.hidden = true;
  if (createProgressFill) createProgressFill.style.width = "8%";
  if (createStatus) createStatus.textContent = "";
  if (createSubmit) {
    createSubmit.disabled = false;
    createSubmit.textContent = "Create here";
  }
  if (createInput) {
    createInput.disabled = false;
    createInput.value = createInput.value || "";
  }
  if (createCancel) createCancel.disabled = false;
  createModal.hidden = false;
  // Focus after paint so iOS shows the keyboard
  requestAnimationFrame(() => createInput?.focus());
}

async function processNameQueue() {
  if (state.naming) return;
  while (state.nameQueue.length) {
    if (!state.booted || !scene) break;
    const file = state.nameQueue.shift();
    const name = await openNameModal(file);
    if (!name) continue;
    try {
      await placeNamedVideo(file, name);
    } catch (err) {
      console.error(err);
    }
  }
  updateUploadNote(state.nameQueue.length + state.pendingUploads.length);
}

function addUploadedFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("video/"));
  if (!files.length) {
    setStatus("Pick video files (mp4, mov, etc.)");
    return 0;
  }

  // Warm the classifier so the content-based name lands quickly
  loadVisionModel().catch(() => {});

  if (!state.booted || !scene) {
    state.pendingUploads.push(...files);
    updateUploadNote(state.pendingUploads.length);
    setStatus(
      files.length === 1
        ? "Video selected — Open lens to name & pin"
        : `${files.length} videos selected — Open lens to name & pin`
    );
    return files.length;
  }

  state.nameQueue.push(...files);
  processNameQueue();
  return files.length;
}

function onPickVideos(event) {
  const input = event.target;
  addUploadedFiles(input.files || []);
  input.value = "";
}

videoInputGate?.addEventListener("change", onPickVideos);
videoInputField?.addEventListener("change", onPickVideos);
videoInputCapture?.addEventListener("change", onPickVideos);

addBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  openAddModal();
});
addClose?.addEventListener("click", closeAddModal);
addModal?.addEventListener("click", (e) => {
  if (e.target === addModal) closeAddModal();
});
addCreate?.addEventListener("click", () => {
  openCreateModal();
});
addCapture?.addEventListener("click", () => {
  closeAddModal();
  videoInputCapture?.click();
});
createCancel?.addEventListener("click", () => closeCreateModal());
createModal?.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});
createForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const prompt = createInput?.value?.trim();
  if (!prompt) {
    createInput?.focus();
    return;
  }
  if (!state.booted || !scene) {
    setStatus("Open the lens first, then create");
    return;
  }
  if (createSubmit) {
    createSubmit.disabled = true;
    createSubmit.textContent = "Creating…";
  }
  if (createInput) createInput.disabled = true;
  if (createCancel) createCancel.disabled = true;
  setCreateProgress(6, "Starting…");
  setStatus("Creating…", 20000);
  try {
    const creation = await generateCreationAnim(prompt, (pct, msg) => {
      setCreateProgress(pct, msg);
      if (msg) setStatus(msg, 20000);
    });
    setCreateProgress(96, "Pinning…");
    await placeNamedCreation(creation);
    setCreateProgress(100, "Done");
    closeCreateModal();
  } catch (err) {
    console.warn(err);
    setCreateProgress(100, err?.message || "Couldn’t create — try again");
    setStatus(err?.message || "Couldn’t create that — try again", 4200);
    if (createSubmit) {
      createSubmit.disabled = false;
      createSubmit.textContent = "Create here";
    }
    if (createInput) createInput.disabled = false;
    if (createCancel) createCancel.disabled = false;
  }
});

// Desktop keyboard nudge
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (confirmModal && !confirmModal.hidden) {
      closeConfirmModal();
      return;
    }
    if (createModal && !createModal.hidden) {
      closeCreateModal();
      return;
    }
    if (addModal && !addModal.hidden) {
      closeAddModal();
      return;
    }
    if (state.watching) {
      closeTheaterMode();
      return;
    }
    if (state.mapOpen) {
      closeMapModal();
      return;
    }
  }
  if (state.watching) return;
  const step = 0.08;
  if (e.key === "ArrowLeft") state.offsetYaw += step;
  if (e.key === "ArrowRight") state.offsetYaw -= step;
  if (e.key === "ArrowUp") state.offsetPitch += step * 0.7;
  if (e.key === "ArrowDown") state.offsetPitch -= step * 0.7;
  state.offsetPitch = THREE.MathUtils.clamp(state.offsetPitch, -1.2, 1.2);
  if (e.key === "Enter") {
    const node = resolveWatchNode();
    if (node) openTheater(node);
  }
});

window.__lumenScatterDandelion = (strength) => scatterDandelion(Number(strength) || 1.1);
window.__lumenIsFlyingSubject = isFlyingSubject;
window.__lumenNodeYs = () =>
  state.nodes
    .filter((n) => n.kind === "image")
    .map((n) => ({
      title: n.title,
      flying: n.flying,
      settled: n.settled,
      y: Number(n.group.position.y.toFixed(3)),
      restY: Number((n.restY ?? 0).toFixed(3)),
      baseY: Number(n.baseY.toFixed(3)),
    }));
window.__lumenPlaceTest = async (title, side = 0) => {
  const name = String(title || "Dog");
  const flying = isFlyingSubject(name);
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 512;
  canvasEl.height = 640;
  const ctx = canvasEl.getContext("2d");
  ctx.fillStyle = flying ? "#3aa0ff" : "#ff3a1a";
  ctx.beginPath();
  ctx.ellipse(256, 380, 150, 210, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(name, 256, 80);
  const img = new Image();
  img.src = canvasEl.toDataURL();
  if (!img.complete) {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
  }
  const spawnY = flying ? 2.72 : (camera?.position.y ?? 1.4) + 1.05;
  const position = placementAlongLook(3.2, spawnY);
  position[0] += Number(side) || 0;
  const node = createNode(
    {
      id: `test-${Date.now()}`,
      kind: "image",
      title: name,
      blurb: flying ? "Flying above" : "On the ground",
      src: img.src,
      animFrames: [img],
      position,
      flying,
      settled: flying,
      deletable: true,
    },
    state.nodes.length
  );
  state.nodes.push(node);
  return { flying, spawnY, restY: node.restY, baseY: node.baseY };
};
