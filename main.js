import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const healthEl = document.getElementById("health");
const infoEl = document.getElementById("info");

// stop browser right-click menu so RMB can ADS
addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------- MAP ----------------
const MAP_HALF = 140;
const GROUND_SIZE = 900;

// collision
const PLAYER_RADIUS = 0.65;

// enemy facing fix (if they still face wrong, set to 0 and commit)
const ENEMY_Y_FIX = Math.PI;

// caps to prevent lag -> freeze
const MAX_ENEMIES = 22;
const MAX_TRACERS = 25;

// ---------------- SCENE ----------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 40, 320);

const BASE_FOV = 75;
const ADS_FOV = 55;

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 2000);
camera.position.set(0, 1.6, 40);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

// keep it lighter than bloom builds (less lag)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const fxaaPass = new ShaderPass(FXAAShader);
function updateFXAA() {
  const pr = renderer.getPixelRatio();
  fxaaPass.material.uniforms["resolution"].value.set(
    1 / (innerWidth * pr),
    1 / (innerHeight * pr)
  );
}
updateFXAA();
composer.addPass(fxaaPass);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------- LIGHTS ----------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(60, 80, 30);
scene.add(dir);

// ---------------- WORLD ----------------
const obstacles = [];
const obstacleBoxes = [];

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function registerObstacle(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  obstacles.push(mesh);
  obstacleBoxes.push({
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z
  });
}

function addBox(x, z, w, h, d, color = 0x3b4450) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92 })
  );
  box.position.set(x, h / 2, z);
  scene.add(box);
  registerObstacle(box);
  return box;
}

// boundary walls
addBox(0, -MAP_HALF - 8, MAP_HALF * 2 + 40, 12, 2);
addBox(0,  MAP_HALF + 8, MAP_HALF * 2 + 40, 12, 2);
addBox(-MAP_HALF - 8, 0, 2, 12, MAP_HALF * 2 + 40);
addBox( MAP_HALF + 8, 0, 2, 12, MAP_HALF * 2 + 40);

// simple cover
addBox(0, 0, 18, 5, 12, 0x46515f);
addBox(-40, 22, 12, 7, 18, 0x4a5563);
addBox(45, -26, 18, 5, 12, 0x4a5563);
addBox(65, 48, 12, 9, 22, 0x3f4a56);
addBox(-70, -45, 18, 5, 18, 0x3f4a56);
addBox(15, 70, 24, 5, 12, 0x46515f);
addBox(-20, -78, 26, 5, 14, 0x46515f);

// collision check
function collidesAt(x, z) {
  for (const b of obstacleBoxes) {
    const minX = b.minX - PLAYER_RADIUS;
    const maxX = b.maxX + PLAYER_RADIUS;
    const minZ = b.minZ - PLAYER_RADIUS;
    const maxZ = b.maxZ + PLAYER_RADIUS;
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  return false;
}

// ---------------- CONTROLS ----------------
const controls = new PointerLockControls(camera, document.body);

controls.addEventListener("lock", () => {
  infoEl.textContent = "WASD • SHIFT sprint • RMB ADS • 1/2/3 guns • R reload";
});
controls.addEventListener("unlock", () => {
  infoEl.textContent = "CLICK TO PLAY (mouse unlocked)";
});

addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

// ---------------- INPUT ----------------
const keys = { w:false,a:false,s:false,d:false, shift:false, ctrl:false };
let firing = false;
let ads = false;
let jumpBuffer = 0;

addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = true;
  if (e.code === "Space") jumpBuffer = 0.12;

  if (e.code === "Digit1") setWeapon("ak");
  if (e.code === "Digit2") setWeapon("magnum");
  if (e.code === "Digit3") setWeapon("sg");
  if (e.code === "KeyR") tryReload();
});

addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = false;
});

addEventListener("mousedown", (e) => {
  if (e.button === 0) {
    firing = true;
    if (weapon.fireMode === "semi") tryFire();
  }
  if (e.button === 2) ads = true;
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) ads = false;
});

// ---------------- MOVE ----------------
const clock = new THREE.Clock();
const vel = new THREE.Vector3(0, 0, 0);
let velY = 0;
let feetY = 0;

const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const wishDir = new THREE.Vector3();

let grounded = true;
let coyote = 0;

const GRAVITY = 18.0;
const JUMP_SPEED = 6.2;

const WALK_SPEED = 5.3;
const SPRINT_SPEED = 8.2; // SHIFT sprint
const CROUCH_SPEED = 3.0;

const GROUND_ACCEL = 55.0;
const AIR_ACCEL = 18.0;
const GROUND_FRICTION = 12.0;

const EYE_STAND = 1.6;
const EYE_CROUCH = 1.2;
let eyeHeight = EYE_STAND;

function applyFriction(dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.001) return;
  const drop = speed * GROUND_FRICTION * dt;
  const newSpeed = Math.max(0, speed - drop);
  const scale = newSpeed / speed;
  vel.x *= scale;
  vel.z *= scale;
}
function accelerate(dt, accel, maxSpeed) {
  const current = vel.x * wishDir.x + vel.z * wishDir.z;
  const add = maxSpeed - current;
  if (add <= 0) return;
  const accelSpeed = accel * dt * maxSpeed;
  const amt = Math.min(accelSpeed, add);
  vel.x += wishDir.x * amt;
  vel.z += wishDir.z * amt;
}
function getMoveSpeed() {
  if (keys.ctrl) return CROUCH_SPEED;
  return keys.shift ? SPRINT_SPEED : WALK_SPEED;
}

function updatePlayer(dt) {
  if (!controls.isLocked) return;

  camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();
  right.crossVectors(forward, up).normalize();

  wishDir.set(0, 0, 0);
  if (keys.w) wishDir.add(forward);
  if (keys.s) wishDir.sub(forward);
  if (keys.d) wishDir.add(right);
  if (keys.a) wishDir.sub(right);
  if (wishDir.lengthSq() > 0) wishDir.normalize();

  jumpBuffer = Math.max(0, jumpBuffer - dt);
  coyote = Math.max(0, coyote - dt);

  velY -= GRAVITY * dt;

  if (feetY <= 0) {
    feetY = 0;
    if (velY < 0) velY = 0;
    grounded = true;
    coyote = 0.10;
  } else {
    if (grounded) coyote = 0.10;
    grounded = false;
  }

  if (jumpBuffer > 0 && (grounded || coyote > 0)) {
    grounded = false;
    coyote = 0;
    velY = JUMP_SPEED;
    jumpBuffer = 0;
  }

  const maxSpeed = getMoveSpeed();
  if (grounded) applyFriction(dt);
  accelerate(dt, grounded ? GROUND_ACCEL : AIR_ACCEL, maxSpeed);

  // axis collision
  const oldX = camera.position.x;
  camera.position.x += vel.x * dt;
  if (collidesAt(camera.position.x, camera.position.z)) {
    camera.position.x = oldX;
    vel.x = 0;
  }

  const oldZ = camera.position.z;
  camera.position.z += vel.z * dt;
  if (collidesAt(camera.position.x, camera.position.z)) {
    camera.position.z = oldZ;
    vel.z = 0;
  }

  feetY += velY * dt;

  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -MAP_HALF, MAP_HALF);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -MAP_HALF, MAP_HALF);

  const targetEye = keys.ctrl ? EYE_CROUCH : EYE_STAND;
  eyeHeight = THREE.MathUtils.lerp(eyeHeight, targetEye, 1 - Math.pow(0.001, dt));
  camera.position.y = feetY + eyeHeight;

  // ADS zoom
  const targetFov = ads ? ADS_FOV : BASE_FOV;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.pow(0.001, dt));
  camera.updateProjectionMatrix();
}

// ---------------- WEAPONS ----------------
const WEAPONS = {
  ak:     { name:"AK-47",      fireMode:"auto", rpm:650, damage:1, spread:0.011, pellets:1, magSize:30, reserveMax:120, reloadTime:2.2 },
  magnum: { name:"Magnum",     fireMode:"semi", rpm:240, damage:3, spread:0.006, pellets:1, magSize:6,  reserveMax:48,  reloadTime:2.4 },
  sg:     { name:"SG Shotgun", fireMode:"semi", rpm:95,  damage:1, spread:0.060, pellets:8, magSize:8,  reserveMax:40,  reloadTime:2.8 }
};

let weaponId = "ak";
let weapon = WEAPONS[weaponId];
let ammoInMag = weapon.magSize;
let ammoReserve = weapon.reserveMax;

let nextShot = 0;
let reloading = false;
let reloadT = 0;

function setWeapon(id) {
  if (!WEAPONS[id]) return;
  weaponId = id;
  weapon = WEAPONS[id];
  ammoInMag = weapon.magSize;
  ammoReserve = weapon.reserveMax;
  reloading = false;
  reloadT = 0;
  nextShot = 0;
  buildGunForWeapon();
}

function tryReload() {
  if (reloading) return;
  if (ammoInMag >= weapon.magSize) return;
  if (ammoReserve <= 0) return;
  reloading = true;
  reloadT = weapon.reloadTime;
}
function updateReload(dt) {
  if (!reloading) return;
  reloadT -= dt;
  if (reloadT > 0) return;
  reloading = false;

  const need = weapon.magSize - ammoInMag;
  const take = Math.min(need, ammoReserve);
  ammoInMag += take;
  ammoReserve -= take;
}
function secondsPerShot(w) { return 60 / w.rpm; }

function tryFire() {
  if (!controls.isLocked) return;
  if (reloading) return;
  if (ammoInMag <= 0) { tryReload(); return; }
  if (nextShot > 0) return;

  ammoInMag -= 1;
  nextShot = secondsPerShot(weapon);
  fireHitscan(weapon);
}

function updateFiring(dt) {
  nextShot = Math.max(0, nextShot - dt);
  if (weapon.fireMode === "auto" && firing) {
    if (nextShot === 0) tryFire();
  }
}

// ---------------- SIMPLE PLAYER GUN (visible) ----------------
let gunGroup = null;
function buildGunForWeapon() {
  if (gunGroup) camera.remove(gunGroup);

  gunGroup = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e232b, roughness: 0.65, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: weaponId === "magnum" ? 0xffd24a : (weaponId === "sg" ? 0x55ffaa : 0x3b5bff) });

  let bodyZ = 0.55, barrelZ = 0.60;
  if (weaponId === "magnum") { bodyZ = 0.35; barrelZ = 0.32; }
  if (weaponId === "sg") { bodyZ = 0.62; barrelZ = 0.85; }

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, bodyZ), mat);
  body.position.set(0.05, -0.05, -0.20);
  gunGroup.add(body);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, barrelZ, 16), mat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.12, 0.02, -0.55);
  gunGroup.add(barrel);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.22), accent);
  rail.position.set(0.06, 0.08, -0.20);
  gunGroup.add(rail);

  gunGroup.position.set(0.36, -0.35, -0.75);
  camera.add(gunGroup);
}
buildGunForWeapon();

// ---------------- ENEMIES (pistols) ----------------
const raycaster = new THREE.Raycaster();
let soldierTemplate = null;
let soldierClips = null;

const enemies = [];
let wave = 1;
let nextWaveIn = 0;

function findClip(clips, wantedNames) {
  if (!clips) return null;
  for (const name of wantedNames) {
    const c = THREE.AnimationClip.findByName(clips, name);
    if (c) return c;
  }
  return clips[0] || null;
}

function makeEnemy(opts) {
  const root = SkeletonUtils.clone(soldierTemplate);
  root.scale.setScalar(opts.scale ?? 1);

  const collider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, 1.1, 0);
  root.add(collider);

  const mixer = new THREE.AnimationMixer(root);
  const run = findClip(soldierClips, ["Run", "run", "Running"]);
  const idle = findClip(soldierClips, ["Idle", "idle"]);
  (run ? mixer.clipAction(run) : mixer.clipAction(idle)).play();

  // pistol prop
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x1d222a, roughness: 0.7, metalness: 0.3 })
  );
  pistol.position.set(0.22, 1.05, 0.20);
  root.add(pistol);

  const e = {
    root, collider, mixer,
    hp: opts.hp ?? 8,
    speed: opts.speed ?? 2.0,
    isBoss: !!opts.isBoss,
    shootEvery: opts.shootEvery ?? 1.0,
    shootCD: 0.3 + Math.random() * 0.7,
    shootRange: opts.shootRange ?? 55,
    damage: opts.damage ?? 6
  };
  collider.userData.owner = e;

  scene.add(root);
  enemies.push(e);
  return e;
}

function clearEnemies() {
  while (enemies.length) {
    const e = enemies.pop();
    scene.remove(e.root);
  }
}

function spawnWave() {
  clearEnemies();

  const boss = makeEnemy({
    isBoss: true,
    hp: 60 + wave * 15,
    speed: 1.7 + wave * 0.03,
    shootEvery: Math.max(0.35, 0.70 - wave * 0.02),
    shootRange: 85,
    damage: 9,
    scale: 1.4
  });
  boss.root.position.set(0, 0, -90);

  const minCount = Math.min(10, 6 + Math.floor(wave / 2));
  for (let i = 0; i < minCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 55;
    const m = makeEnemy({
      hp: 10 + Math.floor(wave / 2),
      speed: 2.4 + wave * 0.02,
      shootEvery: Math.max(0.60, 1.15 - wave * 0.03),
      shootRange: 70,
      damage: 6,
      scale: 1.0
    });
    m.root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  // cap enemies (prevents lag)
  while (enemies.length > MAX_ENEMIES) {
    const e = enemies.pop();
    scene.remove(e.root);
  }
}

function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  dir.normalize();

  raycaster.ray.origin.copy(from);
  raycaster.ray.direction.copy(dir);

  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length === 0) return true;
  return hits[0].distance > dist - 0.2;
}

// tracers
const tracers = [];
function tracer(from, to, color = 0xffc46b) {
  if (tracers.length >= MAX_TRACERS) return;
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, t: 0.06 });
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].t -= dt;
    if (tracers[i].t <= 0) {
      scene.remove(tracers[i].line);
      tracers.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  if (!controls.isLocked) return;

  for (const e of enemies) {
    e.mixer.update(dt);

    // move to fight range
    const toPlayer = new THREE.Vector3(
      camera.position.x - e.root.position.x,
      0,
      camera.position.z - e.root.position.z
    );
    const dist = toPlayer.length();
    if (dist > 0.0001) toPlayer.normalize();

    const stop = e.isBoss ? 40 : 30;
    if (dist > stop) e.root.position.addScaledVector(toPlayer, e.speed * dt);

    // face player (fix facing)
    e.root.lookAt(camera.position.x, e.root.position.y, camera.position.z);
    e.root.rotation.y += ENEMY_Y_FIX;

    // shoot (not every frame)
    e.shootCD = Math.max(0, e.shootCD - dt);
    if (e.shootCD === 0 && dist < e.shootRange) {
      const muzzle = new THREE.Vector3(e.root.position.x, 1.2, e.root.position.z);
      const target = camera.position.clone();
      if (hasLineOfSight(muzzle, target)) {
        tracer(muzzle, target, e.isBoss ? 0xff6b6b : 0xffc46b);
        playerHP -= e.damage;
        if (playerHP < 0) playerHP = 0;
      }
      e.shootCD = e.shootEvery;
    }

    e.root.position.x = THREE.MathUtils.clamp(e.root.position.x, -MAP_HALF, MAP_HALF);
    e.root.position.z = THREE.MathUtils.clamp(e.root.position.z, -MAP_HALF, MAP_HALF);
  }

  // wave progression with timer (prevents rapid looping)
  const bossAlive = enemies.some((e) => e.isBoss);
  if (!bossAlive) {
    nextWaveIn = Math.max(0, nextWaveIn - dt);
    if (nextWaveIn === 0) {
      wave += 1;
      nextWaveIn = 4.0;
      spawnWave();
    }
  } else {
    nextWaveIn = 4.0;
  }
}

// ---------------- PLAYER SHOOT ----------------
function randSpread(spread) { return (Math.random() * 2 - 1) * spread; }

function fireHitscan(w) {
  const colliders = enemies.map((e) => e.collider);

  const origin = camera.position.clone();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);

  const spreadMul = ads ? 0.35 : 1.0;

  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    dir.x += randSpread(w.spread * spreadMul);
    dir.y += randSpread(w.spread * spreadMul);
    dir.normalize();

    raycaster.ray.origin.copy(origin);
    raycaster.ray.direction.copy(dir);

    const hits = raycaster.intersectObjects(colliders, false);
    if (hits.length === 0) continue;

    const target = hits[0].object.userData.owner;
    if (!target) continue;

    target.hp -= w.damage;

    if (target.hp <= 0) {
      const idx = enemies.indexOf(target);
      if (idx !== -1) enemies.splice(idx, 1);
      scene.remove(target.root);
    }
  }
}

// ---------------- LOAD ----------------
function loadGLB(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

let ready = false;

infoEl.textContent = "Loading...";

loadGLB("https://threejs.org/examples/models/gltf/Soldier.glb")
  .then((gltf) => {
    soldierTemplate = gltf.scene;
    soldierClips = gltf.animations;
    setWeapon("ak");
    spawnWave();
    ready = true;
    infoEl.textContent = "CLICK TO PLAY (mouse unlocked)";
  })
  .catch((err) => {
    console.error(err);
    infoEl.textContent = "Model load failed. Open Console (F12).";
  });

// ---------------- LOOP ----------------
function updateHUD() {
  const adsText = ads ? " ADS" : "";
  const reloadText = reloading ? " (reloading)" : "";
  healthEl.textContent = `HP: ${playerHP} | ${weapon.name}${adsText} ${ammoInMag}/${ammoReserve}${reloadText}`;
  if (!controls.isLocked) infoEl.textContent = "CLICK TO PLAY (mouse unlocked)";
}

function animate() {
  requestAnimationFrame(animate);

  // clamp dt so lag spikes don’t explode physics
  const dt = Math.min(clock.getDelta(), 0.05);

  if (ready && playerHP > 0) {
    updatePlayer(dt);
    updateReload(dt);
    updateFiring(dt);
    updateEnemies(dt);
    updateHUD();
  }

  updateTracers(dt);
  composer.render();
}
animate();

// ---------------- RESIZE ----------------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  updateFXAA();
});
