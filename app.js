import * as THREE from "three";

const CATALOG = [
  {
    id: "bloom",
    title: "Bloom",
    blurb: "Dead ahead",
    src: "./media/flower.mp4",
    position: [0, 1.35, -4.0],
  },
  {
    id: "pulse",
    title: "Pulse",
    blurb: "North-east",
    src: "./media/clip-a.mp4",
    position: [3.2, 1.45, -2.4],
  },
  {
    id: "drift",
    title: "Drift",
    blurb: "North-west",
    src: "./media/clip-b.mp4",
    position: [-3.4, 1.25, -2.6],
  },
  {
    id: "rush",
    title: "Rush",
    blurb: "Over your shoulder",
    src: "./media/clip-c.mp4",
    position: [2.0, 1.55, 3.6],
  },
  {
    id: "glow",
    title: "Glow",
    blurb: "Far west",
    src: "./media/flower.mp4",
    position: [-2.8, 1.5, 2.8],
  },
];

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
  uploadCount: 0,
  nodes: [],
  clock: new THREE.Clock(),
  hasGyro: false,
  orientReady: false,
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

function setStatus(message, ms = 2800) {
  statusEl.textContent = message;
  statusEl.classList.add("is-on");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => statusEl.classList.remove("is-on"), ms);
}

function createLabelTexture(title, blurb) {
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
  ctx.fillText(title.slice(0, 28), 64, 175);
  ctx.fillStyle = "rgba(238, 247, 240, 0.7)";
  ctx.font = "600 34px Manrope, sans-serif";
  ctx.fillText(blurb.slice(0, 40), 260, 110);
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

function titleFromFile(file, fallbackIndex) {
  const base = (file.name || `Video ${fallbackIndex}`).replace(/\.[^.]+$/, "");
  return base.slice(0, 28) || `Video ${fallbackIndex}`;
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
      map: createLabelTexture(item.title, item.blurb),
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
  radar.className = "radar-dot";
  radarDots.appendChild(radar);

  const node = {
    ...item,
    deletable: Boolean(item.deletable),
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

  const onMeta = () => applyVideoAspect(node);
  if (video.readyState >= 1) onMeta();
  else video.addEventListener("loadedmetadata", onMeta, { once: true });

  return node;
}

function disposeNode(node) {
  scene.remove(node.group);
  node.radar?.remove();
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

  if (state.watchingNode === node) closeTheaterMode();
  disposeNode(node);
  state.nodes = state.nodes.filter((n) => n !== node);

  if (state.focused === node) setFocus(null);
  else updateDeleteControls();

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

/** Pin the × to the focused video's top-right corner in screen space. */
function positionDeleteBtn() {
  const node = state.focused;
  if (!node?.deletable || state.watching || deleteBtn.hidden || !camera) {
    return;
  }

  const w = (node.screen.geometry.parameters?.width ?? 2.4) * 0.5;
  const h = (node.screen.geometry.parameters?.height ?? 1.35) * 0.5;
  // Slightly outside the frame corner so it sits on the green border TR
  _corner.set(w + 0.02, h + 0.02, 0.04);
  node.screen.localToWorld(_corner);
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

  if (state.pendingUploads.length) {
    const pending = state.pendingUploads.splice(0, state.pendingUploads.length);
    const placePending = () => {
      addUploadedFiles(pending, { silent: true });
      updateUploadNote(0);
      setStatus("Your videos were placed where the lens opened");
    };
    // Wait briefly for gyro so placement matches phone orientation
    let tries = 0;
    const wait = () => {
      tries += 1;
      if (state.orientReady || tries > 50) placePending();
      else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }
}

function getScreenOrientRad() {
  const angle =
    screen.orientation?.angle ??
    (typeof window.orientation === "number" ? window.orientation : 0);
  return THREE.MathUtils.degToRad(angle);
}

function setDeviceQuaternion(alphaDeg, betaDeg, gammaDeg) {
  const alpha = THREE.MathUtils.degToRad(alphaDeg);
  const beta = THREE.MathUtils.degToRad(betaDeg);
  const gamma = THREE.MathUtils.degToRad(gammaDeg);
  const orient = getScreenOrientRad();

  // Device frame → world, then aim through the back camera
  _euler.set(beta, alpha, -gamma, "YXZ");
  _deviceQuat.setFromEuler(_euler);
  _deviceQuat.multiply(_q1);
  _deviceQuat.multiply(_q0.setFromAxisAngle(_zee, -orient));
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
    node.group.position.y = node.baseY + Math.sin(t * 1.2 + node.phase) * 0.08;
    node.beacon.scale.setScalar(1 + Math.sin(t * 3 + node.phase) * 0.25);

    const hot = state.focused === node;
    node.frame.material.opacity = hot ? 0.55 : 0.16;
    node.beacon.material.color.set(hot ? 0xffffff : 0xc6ff4a);
    node.radar.classList.toggle("is-hot", hot);

    // Billboard: keep screen facing viewer horizontally
    const dx = camera.position.x - node.group.position.x;
    const dz = camera.position.z - node.group.position.z;
    node.group.rotation.y = Math.atan2(dx, dz);
  }
}

function updateRadar() {
  const radius = 34;
  camera.getWorldDirection(_forward);
  const yaw = Math.atan2(_forward.x, _forward.z);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);

  for (const node of state.nodes) {
    const dx = node.group.position.x - camera.position.x;
    const dz = node.group.position.z - camera.position.z;
    const rx = dx * cos - dz * sin;
    const rz = dx * sin + dz * cos;
    const dist = Math.hypot(rx, rz) || 1;
    const clamped = Math.min(dist / 6.5, 1);
    const x = 42 + (rx / dist) * radius * clamped;
    const y = 42 + (rz / dist) * radius * clamped;
    node.radar.style.left = `${x}px`;
    node.radar.style.top = `${y}px`;
  }
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
  // Aim-cone focus: closest screen near view center (Pokémon Go style lock-on)
  camera.getWorldDirection(_forward);
  let best = null;
  let bestScore = Infinity;

  for (const node of state.nodes) {
    _to.copy(node.group.position).sub(camera.position);
    const dist = _to.length();
    if (dist < 0.4 || dist > 12) continue;
    _to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(_forward.dot(_to), -1, 1));
    if (ang > 0.38) continue; // ~22 degrees
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
    hudHint.textContent = node.blurb;
    watchBtn.disabled = false;
    ensurePreview(node);
    pausePreviews(node.id);
  } else {
    focusLabel.textContent = "Scan the field";
    hudHint.textContent = "Look around to find videos";
    watchBtn.disabled = true;
    pausePreviews(null);
  }
  updateDeleteControls();
}

function openTheater(node) {
  if (!node) return;
  state.watching = true;
  state.watchingNode = node;
  pausePreviews(null);
  field.classList.add("is-watching");
  theater.hidden = false;
  theaterTitle.textContent = node.title;
  theaterDelete.hidden = !node.deletable;
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
    setDeviceQuaternion(event.alpha, event.beta, event.gamma);
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
  // Re-kick camera playback now that the video is visible (helps iOS)
  if (camEl.srcObject) {
    camEl.play().catch(() => {});
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
      ? "1 video ready — Open lens to place it in AR"
      : `${count} videos ready — Open lens to place them in AR`;
}

function addUploadedFiles(fileList, { silent = false } = {}) {
  const files = [...fileList].filter((f) => f.type.startsWith("video/"));
  if (!files.length) {
    if (!silent) setStatus("Pick video files (mp4, mov, etc.)");
    return 0;
  }

  // Before the field boots, queue for later (placed along aim when lens opens)
  if (!state.booted || !scene) {
    state.pendingUploads.push(...files);
    updateUploadNote(state.pendingUploads.length);
    if (!silent) {
      setStatus(
        files.length === 1
          ? "Video added — tap Open lens"
          : `${files.length} videos added — tap Open lens`
      );
    }
    return files.length;
  }

  let added = 0;
  const total = files.length;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i];
    state.uploadCount += 1;
    const index = state.nodes.length;
    const url = URL.createObjectURL(file);
    const item = {
      id: `upload-${state.uploadCount}`,
      title: titleFromFile(file, state.uploadCount),
      blurb: "From your phone",
      src: url,
      position: placementFromAim(i, total),
      objectUrl: url,
      deletable: true,
    };
    const node = createNode(item, index);
    state.nodes.push(node);
    added += 1;
  }

  if (!silent) {
    setStatus(
      added === 1
        ? "Placed where you’re aiming — tap × to remove"
        : `${added} videos placed along your aim — tap × to remove`
    );
  }
  return added;
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
  if (e.key === "Escape") closeTheaterMode();
});
