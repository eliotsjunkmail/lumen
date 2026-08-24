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
const theaterTitle = document.getElementById("theater-title");
const closeTheater = document.getElementById("close-theater");
const uploadNote = document.getElementById("upload-note");
const videoInputGate = document.getElementById("video-input-gate");
const videoInputField = document.getElementById("video-input-field");
const deleteBtn = document.getElementById("delete-btn");
const theaterDelete = document.getElementById("theater-delete");
const theaterClose = document.getElementById("theater-close");
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
      anchorDemoVideosToLaunch();
      updateGeoAnchors();
    },
    (err) => console.warn(err),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
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

function placementAlongLook(distance = 3.2) {
  const forward = getLookForwardFlat();
  const origin = camera ? camera.position : new THREE.Vector3(0, 1.4, 0);
  return [
    origin.x + forward.x * distance,
    1.4,
    origin.z + forward.z * distance,
  ];
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

    // Keep world-locked pins where they were aimed (camera frame).
    // Only non-locked geo nodes are repositioned via GPS ENU.
    if (!node.worldLocked) {
      const origin = state.originGeo || user;
      const enu = enuFromOrigin(origin.lat, origin.lng, node.lat, node.lng);
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

function createLabelTexture(title, blurb, { reserveDelete = false } = {}) {
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
  ctx.fillText("WATCH", 64, 110);
  ctx.fillStyle = "#eef7f0";
  ctx.font = "800 64px Syne, sans-serif";
  // Leave room on the right for the HTML × when this is a deletable upload
  const titleMax = reserveDelete ? 20 : 28;
  ctx.fillText(title.slice(0, titleMax), 64, 175);
  ctx.fillStyle = "rgba(238, 247, 240, 0.7)";
  ctx.font = "600 34px Manrope, sans-serif";
  ctx.fillText(blurb.slice(0, reserveDelete ? 28 : 40), 260, 110);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function applyVideoAspect(node) {
  const w = node.video.videoWidth || 16;
  const h = node.video.videoHeight || 9;
  if (w < 2 || h < 2) return;

  const aspect = w / h;
  const portrait = aspect < 1;
  // Match recorded orientation: tall phone clips stay portrait planes
  const base = portrait ? 2.05 : 1.35;
  const height = portrait ? base : base;
  const width = height * aspect;
  const maxW = portrait ? 1.55 : 2.8;
  const finalW = Math.min(width, maxW);
  const finalH = finalW / aspect;

  node.screen.geometry.dispose();
  node.screen.geometry = new THREE.PlaneGeometry(finalW, finalH);
  node.frame.geometry.dispose();
  node.frame.geometry = new THREE.PlaneGeometry(finalW + 0.14, finalH + 0.14);
  node.label.position.set(0, finalH * 0.5 + 0.55, 0.02);
  node.beacon.position.set(0, -finalH * 0.5 - 0.35, 0.05);
  node.screen.position.y = 0;
  node.frame.position.y = 0;
}

function createNode(item, index) {
  const group = new THREE.Group();
  group.position.set(...item.position);

  const video = makeVideoElement(item.src);
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.35),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
  );
  screen.position.y = 0.2;
  screen.userData.hit = true;

  const frame = new THREE.Mesh(
    new THREE.PlaneGeometry(2.56, 1.51),
    new THREE.MeshBasicMaterial({
      color: 0xc6ff4a,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    })
  );
  frame.position.z = -0.01;
  frame.position.y = 0.2;

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.55),
    new THREE.MeshBasicMaterial({
      map: createLabelTexture(item.title, item.blurb, {
        reserveDelete: Boolean(item.deletable),
      }),
      transparent: true,
      side: THREE.DoubleSide,
    })
  );
  label.position.set(0, 1.2, 0.02);

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
  radar.title = isUserPin ? "Your recording" : item.title || "Video";
  radarDots.appendChild(radar);

  const node = {
    ...item,
    demo: Boolean(item.demo),
    deletable: Boolean(item.deletable),
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
    baseY: item.position[1],
    phase: index * 1.1,
    previewing: false,
  };
  if (node.lat != null) {
    node.group.visible = node.inRange;
    node.radar.style.display = node.inRange ? "" : "none";
  }

  const onMeta = () => applyVideoAspect(node);
  if (video.readyState >= 1) onMeta();
  else video.addEventListener("loadedmetadata", onMeta, { once: true });

  return node;
}

function disposeNode(node) {
  scene.remove(node.group);
  node.radar?.remove();
  removeLeafletMarker(node);
  try {
    node.video.pause();
  } catch {
    /* ignore */
  }
  node.video.removeAttribute("src");
  node.video.load();
  if (node.objectUrl) URL.revokeObjectURL(node.objectUrl);
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
  if (state.watching && state.focused?.deletable) {
    theaterDelete.hidden = false;
  } else if (!state.watching) {
    theaterDelete.hidden = true;
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

function updateNodes(t) {
  for (const node of state.nodes) {
    if (node.anchorX != null) node.group.position.x = node.anchorX;
    if (node.anchorZ != null) node.group.position.z = node.anchorZ;
    node.group.position.y = node.baseY + Math.sin(t * 1.2 + node.phase) * 0.08;
    node.beacon.scale.setScalar(1 + Math.sin(t * 3 + node.phase) * 0.25);

    const hot = state.focused === node;
    node.frame.material.opacity = hot ? 0.55 : 0.16;
    node.beacon.material.color.set(hot ? 0xffffff : 0xc6ff4a);

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
  if (dist < 0.35 || dist > 14) return false;
  _to.normalize();
  const ang = Math.acos(THREE.MathUtils.clamp(_forward.dot(_to), -1, 1));
  // Same aim cone as lock-on — only then count as "in view"
  return ang <= 0.42;
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

function removeLeafletMarker(node) {
  const marker = state.leafletMarkers.get(node.id);
  if (!marker) return;
  marker.remove();
  state.leafletMarkers.delete(node.id);
}

/** Add/move a marker for every geo-tagged video; drop markers for removed ones. */
function syncLeafletMarkers() {
  if (!state.leafletMap || !window.L) return;
  const L = window.L;
  const liveIds = new Set();

  for (const node of state.nodes) {
    if (node.lat == null || node.lng == null) continue;
    liveIds.add(node.id);
    let marker = state.leafletMarkers.get(node.id);
    if (!marker) {
      const icon = L.divIcon({
        className: node.deletable ? "map-marker map-marker--mine" : "map-marker",
        html: `<span class="map-marker-dot"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      marker = L.marker([node.lat, node.lng], { icon, title: node.title }).addTo(
        state.leafletMap
      );
      marker.on("click", () => openTheater(node));
      state.leafletMarkers.set(node.id, marker);
    } else {
      marker.setLatLng([node.lat, node.lng]);
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
      html: `<span class="map-you-arrow"></span>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    state.leafletYou = L.marker([origin.lat, origin.lng], {
      icon: youIcon,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(state.leafletMap);
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
    <span class="map-list-arrow">
      <svg viewBox="0 0 24 24"><path d="M12 2 L19 15 L12 11.6 L5 15 Z" /></svg>
    </span>
  `;
  const play = li.querySelector(".map-list-play");
  play.addEventListener("click", () => openTheater(node));
  return {
    li,
    play,
    thumbWrap: li.querySelector(".map-thumb"),
    title: li.querySelector(".map-list-title"),
    meta: li.querySelector(".map-list-meta"),
    arrow: li.querySelector(".map-list-arrow"),
    thumbSrc: null,
  };
}

/** Rewrite only what changed per row — avoids re-decoding thumbnails every tick. */
function refreshMapList() {
  if (!mapList) return;
  const rows = state.nodes
    .map((node) => {
      const off = nodeGroundOffset(node);
      const dist = Math.hypot(off.east, off.north);
      return { node, dist };
    })
    .sort((a, b) => a.dist - b.dist);

  if (!rows.length) {
    mapList.innerHTML = `<li class="map-list-empty">No videos on the map yet</li>`;
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
    row.play.setAttribute("aria-label", `Watch ${node.title}`);

    const place =
      node.lat != null && node.lng != null ? lookupPlace(node.lat, node.lng) : null;
    const meta = [node.deletable ? "Your pin" : null, formatMapDistance(dist), place]
      .filter(Boolean)
      .join(" · ");
    if (row.meta.textContent !== meta) row.meta.textContent = meta;

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
    const arrowEl = state.leafletYou.getElement()?.querySelector(".map-you-arrow");
    if (arrowEl) {
      arrowEl.style.transform = `rotate(${(yaw * 180) / Math.PI}deg)`;
    }
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
    node.video.pause();
    node.previewing = false;
  }
}

function pickCenter() {
  // Aim-cone focus: must be in range for geo pins; billboard faces you from any side
  camera.getWorldDirection(_forward);
  let best = null;
  let bestScore = Infinity;

  for (const node of state.nodes) {
    if (!node.group.visible) continue;
    if (node.lat != null && !node.inRange) continue;
    _to.copy(node.group.position).sub(camera.position);
    const dist = _to.length();
    if (dist < 0.35 || dist > 14) continue;
    _to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(_forward.dot(_to), -1, 1));
    if (ang > 0.42) continue;
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
    focusLabel.textContent = node.title;
    hudHint.textContent = node.blurb || "Aim locked";
    watchBtn.disabled = false;
    ensurePreview(node);
    pausePreviews(node.id);
  } else {
    focusLabel.textContent = "Scan the field";
    hudHint.textContent = "Within 25 ft, aim from any direction";
    watchBtn.disabled = true;
    pausePreviews(null);
  }
  updateDeleteControls();
}

function openTheater(node) {
  if (!node) return;
  closeMapModal();
  state.watching = true;
  state.watchingNode = node;
  pausePreviews(null);
  field.classList.add("is-watching");
  theater.hidden = false;
  theaterTitle.textContent = node.title;
  theaterDelete.hidden = !node.deletable;
  const knownW = node.video?.videoWidth || 0;
  const knownH = node.video?.videoHeight || 0;
  theaterVideo.style.aspectRatio = knownW > 1 && knownH > 1 ? `${knownW} / ${knownH}` : "9 / 16";
  theaterVideo.src = node.src;
  theaterVideo.muted = false;
  theaterVideo.play().catch(() => setStatus("Tap play on the video to start"));
  setStatus(`Watching ${node.title}`);
  updateDeleteControls();
}

function closeTheaterMode() {
  state.watching = false;
  state.watchingNode = null;
  field.classList.remove("is-watching");
  theater.hidden = true;
  theaterDelete.hidden = true;
  theaterVideo.pause();
  theaterVideo.removeAttribute("src");
  theaterVideo.load();
  if (state.focused) ensurePreview(state.focused);
  updateDeleteControls();
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
  const onDown = (x, y) => {
    state.dragging = true;
    state.lastX = x;
    state.lastY = y;
  };
  const onMove = (x, y) => {
    if (!state.dragging || state.watching) return;
    const dx = x - state.lastX;
    const dy = y - state.lastY;
    state.lastX = x;
    state.lastY = y;
    // Manual offset (desktop free-look, or gyro calibration nudge on phone)
    state.offsetYaw -= dx * 0.005;
    state.offsetPitch -= dy * 0.004;
    state.offsetPitch = THREE.MathUtils.clamp(state.offsetPitch, -1.2, 1.2);
  };
  const onUp = () => {
    state.dragging = false;
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    onDown(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointermove", (e) => onMove(e.clientX, e.clientY));
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  canvas.addEventListener("click", () => {
    if (state.watching) return;
    const node = pickCenter() || state.focused;
    if (node) openTheater(node);
  });
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = state.clock.getDelta();
  const t = state.clock.elapsedTime;
  updateCameraRig(dt);
  updateNodes(t);
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
  if (camEl.srcObject) {
    camEl.play().catch(() => {});
  }

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
      setStatus("Enable location to pin videos within 25 ft", 4500);
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

  const origin = state.originGeo || state.userGeo;
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

    const node = createNode(
      {
        id: nodeId,
        title: row.title || "Shared clip",
        blurb: "Shared pin",
        src: videoUrl(row.video_path),
        position,
        // Unsigned uploads can only be deleted shortly after publishing,
        // so previously shared pins load as view-only
        deletable: false,
        lat: row.lat,
        lng: row.lng,
        inRange: false,
        cloudId: row.id,
        storagePath: row.video_path,
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

  bootField(
    cameraOk
      ? motionOk
        ? "Turn your phone — videos stay fixed in space"
        : "Motion blocked — drag to look around"
      : "Camera blocked — drag to explore demo videos"
  );

  if (!motionOk) {
    setStatus("Allow motion access for world-locked AR", 4200);
  }
  state.booting = false;
}

enterBtn.addEventListener("click", enterField);
watchBtn.addEventListener("click", () => openTheater(state.focused));
closeTheater.addEventListener("click", closeTheaterMode);
theaterClose.addEventListener("click", closeTheaterMode);
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
  const node = state.watchingNode || state.focused;
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

// Desktop keyboard nudge
window.addEventListener("keydown", (e) => {
  if (state.watching) return;
  const step = 0.08;
  if (e.key === "ArrowLeft") state.offsetYaw += step;
  if (e.key === "ArrowRight") state.offsetYaw -= step;
  if (e.key === "ArrowUp") state.offsetPitch += step * 0.7;
  if (e.key === "ArrowDown") state.offsetPitch -= step * 0.7;
  state.offsetPitch = THREE.MathUtils.clamp(state.offsetPitch, -1.2, 1.2);
  if (e.key === "Enter" && state.focused) openTheater(state.focused);
  if (e.key === "Escape") {
    if (state.mapOpen) {
      closeMapModal();
      return;
    }
    closeTheaterMode();
  }
});
