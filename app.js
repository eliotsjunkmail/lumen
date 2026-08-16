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

const state = {
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  dragging: false,
  lastX: 0,
  lastY: 0,
  focused: null,
  watching: false,
  booting: false,
  booted: false,
  nodes: [],
  clock: new THREE.Clock(),
};

let renderer;
let scene;
let camera;
let statusTimer;

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
  video.crossOrigin = "anonymous";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("playsinline", "");
  return video;
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

  state.nodes = CATALOG.map((item, index) => {
    const group = new THREE.Group();
    group.position.set(...item.position);
    group.lookAt(0, item.position[1], 0);

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

    return {
      ...item,
      group,
      screen,
      frame,
      beacon,
      video,
      texture,
      radar,
      baseY: item.position[1],
      phase: index * 1.1,
      previewing: false,
    };
  });
}

function updateCameraRig(dt) {
  state.yaw += (state.targetYaw - state.yaw) * Math.min(1, dt * 10);
  state.pitch += (state.targetPitch - state.pitch) * Math.min(1, dt * 10);
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.85, 0.85);

  const euler = new THREE.Euler(state.pitch, state.yaw, 0, "YXZ");
  camera.quaternion.setFromEuler(euler);
}

function updateNodes(t) {
  for (const node of state.nodes) {
    node.group.position.y = node.baseY + Math.sin(t * 1.2 + node.phase) * 0.08;
    node.beacon.scale.setScalar(1 + Math.sin(t * 3 + node.phase) * 0.25);

    const hot = state.focused === node;
    node.frame.material.opacity = hot ? 0.55 : 0.16;
    node.beacon.material.color.set(hot ? 0xffffff : 0xc6ff4a);
    node.radar.classList.toggle("is-hot", hot);

    // Billboard-ish facing: keep screen facing viewer horizontally
    const dx = camera.position.x - node.group.position.x;
    const dz = camera.position.z - node.group.position.z;
    node.group.rotation.y = Math.atan2(dx, dz);
  }
}

function updateRadar() {
  const radius = 34;
  for (const node of state.nodes) {
    const dx = node.group.position.x - camera.position.x;
    const dz = node.group.position.z - camera.position.z;
    // Rotate into view space using yaw
    const cos = Math.cos(-state.yaw);
    const sin = Math.sin(-state.yaw);
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
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  let best = null;
  let bestScore = Infinity;

  for (const node of state.nodes) {
    const to = node.group.position.clone().sub(camera.position);
    const dist = to.length();
    if (dist < 0.4 || dist > 12) continue;
    to.normalize();
    const ang = Math.acos(THREE.MathUtils.clamp(forward.dot(to), -1, 1));
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
}

function openTheater(node) {
  if (!node) return;
  state.watching = true;
  pausePreviews(null);
  field.classList.add("is-watching");
  theater.hidden = false;
  theaterTitle.textContent = node.title;
  theaterVideo.src = node.src;
  theaterVideo.muted = false;
  theaterVideo.play().catch(() => setStatus("Tap play on the video to start"));
  setStatus(`Watching ${node.title}`);
}

function closeTheaterMode() {
  state.watching = false;
  field.classList.remove("is-watching");
  theater.hidden = true;
  theaterVideo.pause();
  theaterVideo.removeAttribute("src");
  theaterVideo.load();
  if (state.focused) ensurePreview(state.focused);
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

function enableOrientation() {
  const handler = (event) => {
    if (state.dragging || state.watching) return;
    if (event.alpha == null || event.beta == null) return;
    const yaw = THREE.MathUtils.degToRad(event.alpha);
    const pitch = THREE.MathUtils.degToRad(event.beta - 90);
    state.targetYaw = -yaw;
    state.targetPitch = THREE.MathUtils.clamp(pitch, -0.85, 0.85);
  };

  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    DeviceOrientationEvent.requestPermission()
      .then((res) => {
        if (res === "granted") {
          window.addEventListener("deviceorientation", handler, true);
        } else {
          setStatus("Drag to look — motion permission denied");
        }
      })
      .catch(() => setStatus("Drag with your finger to look around"));
  } else {
    window.addEventListener("deviceorientation", handler, true);
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
    state.targetYaw -= dx * 0.005;
    state.targetPitch -= dy * 0.004;
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

  let cameraOk = false;
  try {
    await startCamera();
    cameraOk = true;
  } catch (err) {
    console.error(err);
    camEl.style.background =
      "radial-gradient(circle at 30% 20%, #1a3a2a, #06100c 60%)";
  }

  // Always enter the field — never leave the user stuck on Opening…
  bootField(
    cameraOk
      ? "Drag to look · aim at a screen · tap Watch"
      : "Camera blocked — drag to explore demo videos"
  );
  state.booting = false;
}

enterBtn.addEventListener("click", enterField);
watchBtn.addEventListener("click", () => openTheater(state.focused));
closeTheater.addEventListener("click", closeTheaterMode);

// Desktop keyboard nudge
window.addEventListener("keydown", (e) => {
  if (state.watching) return;
  const step = 0.08;
  if (e.key === "ArrowLeft") state.targetYaw += step;
  if (e.key === "ArrowRight") state.targetYaw -= step;
  if (e.key === "ArrowUp") state.targetPitch += step * 0.7;
  if (e.key === "ArrowDown") state.targetPitch -= step * 0.7;
  if (e.key === "Enter" && state.focused) openTheater(state.focused);
  if (e.key === "Escape") closeTheaterMode();
});
