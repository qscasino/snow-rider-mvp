import * as THREE from "three";

/**
 * Snow Rider — Reto (3 carriles)
 * - 3 intentos
 * - Meta = 200%
 * - Si fallás los 3 = 100% consuelo
 * - Controles: teclado, botones, swipe
 * - GitHub Pages OK (rutas relativas)
 */

const STORAGE_KEY = "snow_rider_level_v1";

const $ = (id) => document.getElementById(id);

// UI
const preloader = $("preloader");
const barFill = $("barFill");
const barText = $("barText");

const progressText = $("progressText");
const triesText = $("triesText");
const bestText = $("bestText");

const startOverlay = $("startOverlay");
const howOverlay = $("howOverlay");
const failOverlay = $("failOverlay");
const resultOverlay = $("resultOverlay");

const playBtn = $("playBtn");
const howBtn = $("howBtn");
const backBtn = $("backBtn");
const retryBtn = $("retryBtn");
const menuBtn = $("menuBtn");

const claimBtn = $("claimBtn");
const closeBtn = $("closeBtn");

const triesWarn = $("triesWarn");
const triesLeftText = $("triesLeftText");

const resultTitle = $("resultTitle");
const resultText = $("resultText");
const resultBadge = $("resultBadge");

const leftBtn = $("leftBtn");
const rightBtn = $("rightBtn");
const soundBtn = $("soundBtn");

const gameWrap = $("gameWrap");

// Simple “sound” (sin archivos)
let soundEnabled = true;
const beep = (freq=440, dur=0.08, type="sine", vol=0.03) => {
  if (!soundEnabled) return;
  try{
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  }catch(e){}
};

soundBtn.addEventListener("click", async () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "🔊" : "🔇";
  beep(soundEnabled ? 880 : 220, 0.06, "square", 0.02);
});

// -------------------- GAME STATE --------------------
const lanes = [-2.2, 0, 2.2];
let laneIndex = 1;          // start center
let targetX = lanes[laneIndex];

let state = "menu";         // menu | playing | paused | won | out
let attemptsLeft = 3;

let best = 0;
let progress = 0;

let distance = 0;
const finishDistance = 520; // ajustá meta (más alto = más largo)
let speed = 28;             // velocidad base

// Obstacles
const obstacles = [];
let nextSpawn = 0;

// Persistencia
const saved = loadSave();
attemptsLeft = saved.attemptsLeft ?? 3;
best = saved.best ?? 0;
bestText.textContent = `${Math.floor(best)}%`;
triesText.textContent = attemptsLeft;

if (saved.completed) {
  // Ya ganó antes
  triesWarn.style.display = "block";
  showResult(200, true);
}

// -------------------- THREE SETUP --------------------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07131d, 18, 95);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 6.2, 10.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
gameWrap.appendChild(renderer.domElement);

// Lights
const hemi = new THREE.HemisphereLight(0xbfe9ff, 0x07131d, 0.9);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(6, 10, 6);
dir.castShadow = false;
scene.add(dir);

// Ground (pista)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 220, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0xdff7ff, roughness: 0.9, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -70);
scene.add(ground);

// Side snow banks
const bankMat = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.95 });
const bankGeo = new THREE.BoxGeometry(6, 1.1, 220);
const bankL = new THREE.Mesh(bankGeo, bankMat);
bankL.position.set(-11, 0.55, -70);
scene.add(bankL);

const bankR = bankL.clone();
bankR.position.x = 11;
scene.add(bankR);

// Lane strips (colores tipo referencia)
const stripGeo = new THREE.BoxGeometry(1.7, 0.06, 220);
const stripColors = [0x4ea3ff, 0xffd26a, 0xff5a5a, 0x4dff9a];
const stripXs = [-3.3, -1.1, 1.1, 3.3];
stripXs.forEach((x, i) => {
  const strip = new THREE.Mesh(stripGeo, new THREE.MeshStandardMaterial({
    color: stripColors[i], roughness: 0.65, metalness: 0.05
  }));
  strip.position.set(x, 0.04, -70);
  scene.add(strip);
});

// Player sled (simple)
const sled = new THREE.Group();
const sledBase = new THREE.Mesh(
  new THREE.BoxGeometry(2.2, 0.35, 2.8),
  new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 })
);
sledBase.position.y = 0.35;

const plankGeo = new THREE.BoxGeometry(0.35, 0.18, 2.6);
const plankCols = [0x4ea3ff, 0xffd26a, 0xff5a5a, 0x4dff9a];
[-0.75, -0.25, 0.25, 0.75].forEach((x, i) => {
  const plank = new THREE.Mesh(plankGeo, new THREE.MeshStandardMaterial({ color: plankCols[i], roughness: 0.55 }));
  plank.position.set(x, 0.52, 0);
  sled.add(plank);
});
sled.add(sledBase);
sled.position.set(0, 0, 6);
scene.add(sled);

// “Meta” (gate)
const finishGate = new THREE.Group();
const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 4.2, 10);
const leftPole = new THREE.Mesh(poleGeo, poleMat);
leftPole.position.set(-4.4, 2.1, 0);
const rightPole = leftPole.clone();
rightPole.position.x = 4.4;

const banner = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 1.1, 0.2),
  new THREE.MeshStandardMaterial({ color: 0xffd26a, roughness: 0.35, metalness: 0.05 })
);
banner.position.set(0, 3.7, 0);

finishGate.add(leftPole, rightPole, banner);
finishGate.position.set(0, 0, -finishDistance);
scene.add(finishGate);

// Decorative “snow particles” (muy liviano)
const snow = [];
const snowGeo = new THREE.SphereGeometry(0.05, 6, 6);
const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
for (let i = 0; i < 90; i++) {
  const p = new THREE.Mesh(snowGeo, snowMat);
  p.position.set((Math.random() - 0.5) * 40, Math.random() * 18 + 2, -Math.random() * 110);
  p.userData.v = Math.random() * 0.9 + 0.25;
  snow.push(p);
  scene.add(p);
}

// -------------------- OBSTACLES --------------------
const treeMat = new THREE.MeshStandardMaterial({ color: 0x1fb96b, roughness: 0.9 });
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.95 });
const snowmanMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a8a99, roughness: 0.95 });

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.2, 10), trunkMat);
  trunk.position.y = 0.6;
  const top1 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.3, 10), treeMat);
  top1.position.y = 1.45;
  const top2 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 10), treeMat);
  top2.position.y = 2.1;
  g.add(trunk, top1, top2);
  g.userData.radius = 0.65;
  return g;
}

function makeSnowman() {
  const g = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), snowmanMat);
  b1.position.y = 0.55;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 10), snowmanMat);
  b2.position.y = 1.25;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), snowmanMat);
  head.position.y = 1.82;

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xff7a3d, roughness: 0.6 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.82, 0.32);

  g.add(b1, b2, head, nose);
  g.userData.radius = 0.6;
  return g;
}

function makeRock() {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55, 0), rockMat);
  rock.position.y = 0.55;
  rock.userData.radius = 0.55;
  return rock;
}

function spawnObstacle(z) {
  // Elegimos carril, asegurando que no sea injusto
  const lane = Math.floor(Math.random() * 3);
  const t = Math.random();

  let obj;
  if (t < 0.42) obj = makeTree();
  else if (t < 0.84) obj = makeSnowman();
  else obj = makeRock();

  obj.position.set(lanes[lane], 0, z);
  obj.userData.lane = lane;
  obj.userData.hit = false;
  obstacles.push(obj);
  scene.add(obj);
}

// -------------------- CONTROLS --------------------
function moveLeft() {
  if (state !== "playing") return;
  laneIndex = Math.max(0, laneIndex - 1);
  targetX = lanes[laneIndex];
  beep(520, 0.06, "triangle", 0.02);
}
function moveRight() {
  if (state !== "playing") return;
  laneIndex = Math.min(2, laneIndex + 1);
  targetX = lanes[laneIndex];
  beep(520, 0.06, "triangle", 0.02);
}

leftBtn.addEventListener("click", moveLeft);
rightBtn.addEventListener("click", moveRight);

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") moveLeft();
  if (e.key === "ArrowRight") moveRight();
});

// Swipe mobile
let touchX = null;
window.addEventListener("touchstart", (e) => {
  if (!e.touches?.length) return;
  touchX = e.touches[0].clientX;
}, { passive: true });

window.addEventListener("touchend", (e) => {
  if (touchX == null) return;
  const endX = e.changedTouches?.[0]?.clientX ?? touchX;
  const dx = endX - touchX;
  touchX = null;
  if (Math.abs(dx) < 30) return;
  if (dx < 0) moveLeft();
  else moveRight();
}, { passive: true });

// -------------------- UI BUTTONS --------------------
howBtn.addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  howOverlay.classList.remove("hidden");
});
backBtn.addEventListener("click", () => {
  howOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

playBtn.addEventListener("click", () => {
  if (attemptsLeft <= 0) {
    triesWarn.style.display = "block";
    showResult(100, false);
    return;
  }
  startOverlay.classList.add("hidden");
  startGame();
});

retryBtn.addEventListener("click", () => {
  failOverlay.classList.add("hidden");
  startGame(true);
});
menuBtn.addEventListener("click", () => {
  failOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

closeBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});
claimBtn.addEventListener("click", () => {
  // acá podés integrar tu lógica de “reclamar” (link / whatsapp / etc.)
  beep(880, 0.08, "square", 0.03);
  resultOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

// -------------------- GAME FLOW --------------------
function startGame(isRetry=false) {
  // reset run
  state = "playing";
  distance = 0;
  progress = 0;
  laneIndex = 1;
  targetX = lanes[laneIndex];
  sled.position.x = 0;

  // clear obstacles
  for (const o of obstacles) scene.remove(o);
  obstacles.length = 0;

  // spawn schedule
  nextSpawn = 18; // primer spawn luego de un poco
  speed = 28;

  // si no es retry (es una corrida nueva) no consumimos intento aún
  // consumimos el intento cuando chocás (más amigable)
  updateHUD();
  beep(740, 0.06, "square", 0.02);
}

function crash() {
  if (state !== "playing") return;
  state = "paused";

  attemptsLeft = Math.max(0, attemptsLeft - 1);
  saveGame();

  triesText.textContent = attemptsLeft;
  triesLeftText.textContent = attemptsLeft;

  beep(180, 0.12, "sawtooth", 0.03);

  if (attemptsLeft <= 0) {
    // se quedó sin intentos -> consuelo 100%
    setTimeout(() => showResult(100, false), 450);
  } else {
    failOverlay.classList.remove("hidden");
  }
}

function win() {
  if (state !== "playing") return;
  state = "won";
  saveGame({ completed: true });
  beep(880, 0.10, "square", 0.03);
  setTimeout(() => showResult(200, true), 450);
}

function showResult(percent, isWin) {
  resultOverlay.classList.remove("hidden");
  failOverlay.classList.add("hidden");
  howOverlay.classList.add("hidden");
  startOverlay.classList.add("hidden");

  if (isWin) {
    resultBadge.textContent = "🏁 ¡Meta!";
    resultTitle.textContent = "¡Llegaste a la meta!";
    resultText.textContent = "Bono del 200%";
  } else {
    resultBadge.textContent = "🎁 Consuelo";
    resultTitle.textContent = "Intentos agotados";
    resultText.textContent = "Bono del 100%";
  }
}

// -------------------- SAVE / LOAD --------------------
function loadSave() {
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  }catch(e){
    return {};
  }
}

function saveGame(extra={}) {
  best = Math.max(best, progress);
  bestText.textContent = `${Math.floor(best)}%`;

  const data = {
    attemptsLeft,
    best,
    completed: !!(extra.completed || loadSave().completed)
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function updateHUD() {
  progressText.textContent = `${Math.floor(progress)}%`;
  triesText.textContent = attemptsLeft;
  bestText.textContent = `${Math.floor(best)}%`;
}

// -------------------- LOOP --------------------
let last = performance.now();

function tick(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;

  // preloader fake progress
  if (!preloader.classList.contains("hidden")) {
    const current = parseFloat(barText.textContent) || 0;
    const next = Math.min(100, current + (Math.random() * 8 + 3));
    barFill.style.width = `${next}%`;
    barText.textContent = `${Math.floor(next)}%`;
    if (next >= 100) {
      preloader.classList.add("hidden");
    }
  }

  // Snow particles always
  for (const p of snow) {
    p.position.y -= p.userData.v * dt * 2.2;
    p.position.z += dt * 10;
    if (p.position.y < 1) p.position.y = Math.random() * 16 + 6;
    if (p.position.z > 10) p.position.z = -Math.random() * 110;
  }

  if (state === "playing") {
    // avanzar distancia
    distance += speed * dt;

    // progresar hasta meta
    progress = Math.min(100, (distance / finishDistance) * 100);
    updateHUD();

    // mover trineo hacia target
    sled.position.x += (targetX - sled.position.x) * Math.min(1, dt * 10);
    sled.rotation.z = (targetX - sled.position.x) * -0.06;

    // mover mundo hacia el jugador (obstáculos hacia +z)
    // spawn según distancia
    if (distance > nextSpawn && distance < finishDistance - 10) {
      const z = -distance - 70; // por delante
      spawnObstacle(z);
      // siguiente spawn (ajustable)
      nextSpawn += 16 + Math.random() * 12;
    }

    // mover obstáculos y chequear colisión
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.position.z += speed * dt;

      // colisión simple
      const dz = Math.abs(o.position.z - sled.position.z);
      const dx = Math.abs(o.position.x - sled.position.x);
      const hitDist = (o.userData.radius ?? 0.6) + 0.8;

      if (!o.userData.hit && dz < 1.2 && dx < hitDist) {
        o.userData.hit = true;
        crash();
      }

      // limpiar detrás
      if (o.position.z > 14) {
        scene.remove(o);
        obstacles.splice(i, 1);
      }
    }

    // gate avanza también
    finishGate.position.z += speed * dt;

    // ganar al llegar
    if (distance >= finishDistance) {
      win();
    }

    // cámara follow suave
    camera.position.x += (sled.position.x * 0.22 - camera.position.x) * Math.min(1, dt * 2.6);
    camera.lookAt(sled.position.x * 0.10, 1.5, -2);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

// Resize
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
