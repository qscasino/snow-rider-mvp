import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

// =========================
// CASINO SETTINGS
// =========================
const STORAGE = {
  BEST: "snowrider_best",
  LAST_PLAY: "snowrider_lastPlay",      // YYYY-MM-DD
  LAST_PRIZE: "snowrider_lastPrize",    // string
};

// Seteá esto a true si querés limitar 1 juego por día
const ONE_PLAY_PER_DAY = false;

// Premios (podés cambiar textos)
const PRIZES = [
  { key: "BONO_100", label: "Bono del 100%" },
  { key: "BONO_150", label: "Bono del 150%" },
  { key: "BONO_200", label: "Bono del 200% (Legendario)" },
];

// =========================
// UI
// =========================
const el = {
  preloader: document.getElementById("preloader"),
  barFill: document.getElementById("barFill"),
  barText: document.getElementById("barText"),

  hud: document.getElementById("hud"),
  score: document.getElementById("score"),
  best: document.getElementById("best"),
  soundBtn: document.getElementById("soundBtn"),

  startOverlay: document.getElementById("startOverlay"),
  playBtn: document.getElementById("playBtn"),
  howBtn: document.getElementById("howBtn"),
  playedWarn: document.getElementById("playedWarn"),

  howOverlay: document.getElementById("howOverlay"),
  backBtn: document.getElementById("backBtn"),

  prizeOverlay: document.getElementById("prizeOverlay"),
  prizeText: document.getElementById("prizeText"),
  prizeHint: document.getElementById("prizeHint"),
  claimBtn: document.getElementById("claimBtn"),
  closePrizeBtn: document.getElementById("closePrizeBtn"),

  gameOverOverlay: document.getElementById("gameOverOverlay"),
  finalScore: document.getElementById("finalScore"),
  restartBtn: document.getElementById("restartBtn"),
  menuBtn: document.getElementById("menuBtn"),
};

// =========================
// Audio (simple, desbloqueo mobile)
// =========================
let soundEnabled = true;
let audioUnlocked = false;

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  // Podés meter sonidos reales después
}

el.soundBtn.addEventListener("click", () => {
  unlockAudio();
  soundEnabled = !soundEnabled;
  el.soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  el.soundBtn.classList.toggle("muted", !soundEnabled);
});

window.addEventListener("pointerdown", unlockAudio, { once: true });

// =========================
// Helpers
// =========================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const todayKey = () => new Date().toISOString().slice(0, 10);

function canPlayToday() {
  if (!ONE_PLAY_PER_DAY) return true;
  const last = localStorage.getItem(STORAGE.LAST_PLAY);
  return last !== todayKey();
}

function markPlayedToday() {
  localStorage.setItem(STORAGE.LAST_PLAY, todayKey());
}

function setBest(v) {
  const cur = Number(localStorage.getItem(STORAGE.BEST) || 0);
  if (v > cur) localStorage.setItem(STORAGE.BEST, String(v));
}

function getBest() {
  return Number(localStorage.getItem(STORAGE.BEST) || 0);
}

// =========================
// Three.js setup
// =========================
let scene, camera, renderer;
let clock;

let running = false;
let gameStarted = false;
let gameOver = false;

const state = {
  lane: 0,                 // -1,0,1
  laneX: 0,                // smoothed
  speed: 18,               // base speed
  speedAdd: 0,             // increases over time
  score: 0,
  gifts: 0,                // gift count affects prize
};

const lanes = [-3.2, 0, 3.2];

// Objects
let sled;
const obstacles = [];
const gifts = [];

// Pools
const obstaclePool = [];
const giftPool = [];

// Spawn timers
let tObstacle = 0;
let tGift = 0;

// Ground scrolling illusion
let ground1, ground2;

// =========================
// Init
// =========================
startPreloader().then(async () => {
  init3D();
  initUI();
  animate();
  hidePreloader();
});

async function startPreloader() {
  // Simulación de carga (podés reemplazar con carga real de assets)
  let p = 0;
  return new Promise((resolve) => {
    const it = setInterval(() => {
      p += Math.random() * 18 + 6;
      if (p >= 100) {
        p = 100;
        clearInterval(it);
        resolve();
      }
      el.barFill.style.width = `${p}%`;
      el.barText.textContent = `${Math.floor(p)}%`;
    }, 140);
  });
}

function hidePreloader() {
  el.preloader.style.transition = "opacity .5s ease, visibility .5s ease";
  el.preloader.style.opacity = "0";
  el.preloader.style.visibility = "hidden";
  el.preloader.style.pointerEvents = "none";
}

function init3D() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x061a24, 12, 70);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 6.8, 11.5);
  camera.lookAt(0, 2.4, -6);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x061a24);
  document.body.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x0b2c3b, 0.9);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(8, 12, 6);
  scene.add(dir);

  // Snow ground (2 tiles scrolling)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.9, metalness: 0.0 });
  const groundGeo = new THREE.PlaneGeometry(20, 60);

  ground1 = new THREE.Mesh(groundGeo, groundMat);
  ground1.rotation.x = -Math.PI / 2;
  ground1.position.z = -18;
  scene.add(ground1);

  ground2 = new THREE.Mesh(groundGeo, groundMat);
  ground2.rotation.x = -Math.PI / 2;
  ground2.position.z = -78; // behind
  scene.add(ground2);

  // Lane lines (subtle)
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xcfefff, transparent: true, opacity: 0.22 });
  const lineGeo = new THREE.BoxGeometry(0.06, 0.02, 60);
  [-1.6, 1.6].forEach((x) => {
    const ln1 = new THREE.Mesh(lineGeo, lineMat);
    ln1.position.set(x, 0.02, -48);
    scene.add(ln1);
  });

  // Sled (simple)
  sled = buildSled();
  sled.position.set(0, 0.35, 4);
  scene.add(sled);

  // Particles snow (cheap)
  addSnowParticles();

  clock = new THREE.Clock();

  window.addEventListener("resize", onResize);
}

function buildSled() {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xb33b2e, roughness: 0.55 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.45 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, 1.3), woodMat);
  base.position.y = 0.25;
  group.add(base);

  const railGeo = new THREE.BoxGeometry(0.22, 0.18, 2.0);
  const railL = new THREE.Mesh(railGeo, railMat);
  railL.position.set(-0.95, 0.12, 0);
  const railR = new THREE.Mesh(railGeo, railMat);
  railR.position.set(0.95, 0.12, 0);
  group.add(railL, railR);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 10, 24), baseMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.5, 0.62);
  group.add(handle);

  return group;
}

function addSnowParticles() {
  const geo = new THREE.BufferGeometry();
  const count = 600;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 26;
    positions[i * 3 + 1] = Math.random() * 12 + 1;
    positions[i * 3 + 2] = -Math.random() * 120;
  }

  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.7 });
  const pts = new THREE.Points(geo, mat);
  pts.userData.isSnow = true;
  scene.add(pts);
}

// =========================
// UI init
// =========================
function initUI() {
  el.best.textContent = String(getBest());

  // lock if one-play-per-day
  if (!canPlayToday()) {
    el.playedWarn.style.display = "block";
    el.playBtn.disabled = true;
    el.playBtn.style.opacity = "0.6";
  }

  el.playBtn.addEventListener("click", () => {
    if (!canPlayToday()) return;
    startGame();
  });

  el.howBtn.addEventListener("click", () => {
    el.startOverlay.classList.add("hidden");
    el.howOverlay.classList.remove("hidden");
  });

  el.backBtn.addEventListener("click", () => {
    el.howOverlay.classList.add("hidden");
    el.startOverlay.classList.remove("hidden");
  });

  el.restartBtn.addEventListener("click", () => {
    if (ONE_PLAY_PER_DAY && !canPlayToday()) return;
    restartGame();
  });

  el.menuBtn.addEventListener("click", () => {
    showMenu();
  });

  el.closePrizeBtn.addEventListener("click", () => {
    el.prizeOverlay.classList.add("hidden");
  });

  el.claimBtn.addEventListener("click", () => {
    // acá podés redirigir a WhatsApp / link / tracker
    // window.location.href = "https://wa.me/XXXXXXXXXX?text=Gané%20...";
    el.prizeOverlay.classList.add("hidden");
    showMenu();
  });

  // Touch swipe
  setupTouchControls();

  // Keyboard
  window.addEventListener("keydown", (e) => {
    if (!running) return;
    if (e.key === "ArrowLeft") setLane(state.lane - 1);
    if (e.key === "ArrowRight") setLane(state.lane + 1);
  });

  // Tap to start (mobile)
  window.addEventListener("pointerdown", () => {
    unlockAudio();
    if (!gameStarted && canPlayToday()) startGame();
  }, { passive: true });
}

function showMenu() {
  el.gameOverOverlay.classList.add("hidden");
  el.prizeOverlay.classList.add("hidden");
  el.howOverlay.classList.add("hidden");
  el.startOverlay.classList.remove("hidden");

  // enforce daily lock
  if (ONE_PLAY_PER_DAY && !canPlayToday()) {
    el.playedWarn.style.display = "block";
    el.playBtn.disabled = true;
    el.playBtn.style.opacity = "0.6";
  }
}

function startGame() {
  el.startOverlay.classList.add("hidden");
  el.howOverlay.classList.add("hidden");
  el.gameOverOverlay.classList.add("hidden");
  el.prizeOverlay.classList.add("hidden");

  gameStarted = true;
  running = true;
  gameOver = false;

  // mark daily play
  if (ONE_PLAY_PER_DAY) markPlayedToday();
}

function restartGame() {
  clearWorld();
  resetState();
  startGame();
}

function resetState() {
  state.lane = 0;
  state.laneX = 0;
  state.speed = 18;
  state.speedAdd = 0;
  state.score = 0;
  state.gifts = 0;

  tObstacle = 0;
  tGift = 0;

  sled.position.set(0, 0.35, 4);
  sled.rotation.set(0, 0, 0);

  el.score.textContent = "0";
  el.finalScore.textContent = "0";
}

function clearWorld() {
  // move active objects back to pools
  while (obstacles.length) {
    const o = obstacles.pop();
    o.visible = false;
    obstaclePool.push(o);
  }
  while (gifts.length) {
    const g = gifts.pop();
    g.visible = false;
    giftPool.push(g);
  }
}

// =========================
// Controls
// =========================
function setLane(l) {
  state.lane = clamp(l, -1, 1);
}

function setupTouchControls() {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  window.addEventListener("touchstart", (e) => {
    if (!running) return;
    if (!e.touches || !e.touches[0]) return;
    tracking = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener("touchend", (e) => {
    if (!running || !tracking) return;
    tracking = false;

    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // swipe threshold
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) setLane(state.lane + 1);
      else setLane(state.lane - 1);
    }
  }, { passive: true });
}

// =========================
// Spawning
// =========================
function spawnObstacle() {
  const obj = obstaclePool.pop() || buildObstacle();
  obj.visible = true;

  const lane = lanes[(Math.random() * 3) | 0];
  obj.position.set(lane, 0.55, -60);
  obj.userData.radius = 0.85;

  if (!obj.parent) scene.add(obj);
  obstacles.push(obj);
}

function buildObstacle() {
  // rock-like
  const geo = new THREE.DodecahedronGeometry(0.9, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8aa0aa, roughness: 0.95 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.type = "obstacle";
  return mesh;
}

function spawnGift() {
  const g = giftPool.pop() || buildGift();
  g.visible = true;

  const lane = lanes[(Math.random() * 3) | 0];
  g.position.set(lane, 0.9, -60);
  g.userData.radius = 0.65;

  if (!g.parent) scene.add(g);
  gifts.push(g);
}

function buildGift() {
  const group = new THREE.Group();

  const boxMat = new THREE.MeshStandardMaterial({ color: 0xc41e3a, roughness: 0.55 });
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), boxMat);
  group.add(box);

  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.95), ribbonMat);
  group.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.95), ribbonMat);
  group.add(r2);

  group.userData.type = "gift";
  return group;
}

// =========================
// Collision
// =========================
function hit(a, ar, b, br) {
  // simple distance on XZ plane
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return (dx * dx + dz * dz) <= (ar + br) * (ar + br);
}

// =========================
// Game Over / Prize
// =========================
function endGame() {
  running = false;
  gameOver = true;

  el.finalScore.textContent = String(Math.floor(state.score));
  el.gameOverOverlay.classList.remove("hidden");

  // update best
  setBest(Math.floor(state.score));
  el.best.textContent = String(getBest());

  // decide prize based on gifts collected
  const prize = pickPrize(state.gifts, state.score);
  localStorage.setItem(STORAGE.LAST_PRIZE, prize.label);

  // show prize popup a moment later (casino feel)
  setTimeout(() => {
    el.prizeText.textContent = prize.label;
    el.prizeOverlay.classList.remove("hidden");
  }, 450);
}

function pickPrize(giftsCount, score) {
  // Simple rules:
  // - 200% si juntó muchos regalos o hizo score alto
  // - 150% intermedio
  // - 100% base
  if (giftsCount >= 6 || score >= 900) return PRIZES[2];
  if (giftsCount >= 3 || score >= 450) return PRIZES[1];
  return PRIZES[0];
}

// =========================
// Loop
// =========================
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // Keep camera follow slight
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, state.laneX * 0.20, 0.05);

  // update snow particles
  const snow = scene.children.find(o => o.userData && o.userData.isSnow);
  if (snow) {
    const pos = snow.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3 + 2] += (dt * (state.speed + state.speedAdd)) * 0.35;
      if (pos.array[i * 3 + 2] > 8) pos.array[i * 3 + 2] = -120;
    }
    pos.needsUpdate = true;
  }

  if (running) {
    updateGame(dt);
  }

  renderer.render(scene, camera);
}

function updateGame(dt) {
  // smooth lane movement
  const targetX = lanes[state.lane + 1];
  state.laneX = THREE.MathUtils.lerp(state.laneX, targetX, 0.14);

  sled.position.x = state.laneX;
  sled.rotation.z = THREE.MathUtils.lerp(sled.rotation.z, -state.lane * 0.08, 0.12);

  // speed increase slowly
  state.speedAdd = Math.min(state.speedAdd + dt * 0.65, 14);

  // score increases with speed
  state.score += dt * (30 + state.speedAdd * 3.2);
  el.score.textContent = String(Math.floor(state.score));

  // spawn obstacles
  tObstacle += dt;
  const obstacleEvery = clamp(0.9 - state.speedAdd * 0.02, 0.42, 0.9);
  if (tObstacle >= obstacleEvery) {
    tObstacle = 0;
    spawnObstacle();
  }

  // spawn gifts
  tGift += dt;
  const giftEvery = 1.2;
  if (tGift >= giftEvery) {
    tGift = 0;
    if (Math.random() < 0.55) spawnGift();
  }

  // move obstacles/gifts towards player (increase z)
  const vz = (state.speed + state.speedAdd) * dt;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.position.z += vz;

    // slight rotation
    o.rotation.x += dt * 0.6;
    o.rotation.y += dt * 0.9;

    // collision
    if (hit(sled.position, 0.85, o.position, o.userData.radius)) {
      endGame();
      return;
    }

    // cleanup
    if (o.position.z > 10) {
      obstacles.splice(i, 1);
      o.visible = false;
      obstaclePool.push(o);
    }
  }

  for (let i = gifts.length - 1; i >= 0; i--) {
    const g = gifts[i];
    g.position.z += vz;
    g.rotation.y += dt * 1.6;

    if (hit(sled.position, 0.85, g.position, g.userData.radius)) {
      state.gifts++;
      // little bonus score
      state.score += 60;
      gifts.splice(i, 1);
      g.visible = false;
      giftPool.push(g);
      continue;
    }

    if (g.position.z > 10) {
      gifts.splice(i, 1);
      g.visible = false;
      giftPool.push(g);
    }
  }

  // scroll ground
  ground1.position.z += vz;
  ground2.position.z += vz;

  if (ground1.position.z > 42) ground1.position.z = -78;
  if (ground2.position.z > 42) ground2.position.z = -78;
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

