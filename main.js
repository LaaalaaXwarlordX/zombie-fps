import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const healthEl = document.getElementById("health");
const infoEl = document.getElementById("info");

// ---------------- Disable right-click menu (needed for ADS) ----------------
addEventListener("contextmenu", (e) => e.preventDefault());

// ---------------- Map (wider) ----------------
const MAP_HALF = 140;
const GROUND_SIZE = 900;

// ---------------- Scene / Camera / Renderer ----------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 40, 300);

const BASE_FOV = 75;
const ADS_FOV = 55;

const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 1500);
camera.position.set(0, 1.6, 10);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------------- Postprocessing ----------------
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

const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.25, 0.45, 0.9);
composer.addPass(bloomPass);

// ---------------- Lights ----------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(40, 60, 20);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 400;
dir.shadow.camera.left = -140;
dir.shadow.camera.right = 140;
dir.shadow.camera.top = 140;
dir.shadow.camera.bottom = -140;
scene.add(dir);

// ---------------- Ground + cover ----------------
const obstacles = [];

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addSolidBox(x, z, w, h, d, color = 0x3b4450) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.92 })
  );
  box.position.set(x, h / 2, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  obstacles.push(box);
  return box;
}

// boundary walls
addSolidBox(0, -MAP_HALF - 6, MAP_HALF * 2 + 30, 10, 2);
addSolidBox(0,  MAP_HALF + 6, MAP_HALF * 2 + 30, 10, 2);
addSolidBox(-MAP_HALF - 6, 0, 2, 10, MAP_HALF * 2 + 30);
addSolidBox( MAP_HALF + 6, 0, 2, 10, MAP_HALF * 2 + 30);

// cover (more, like a simple Valorant arena)
addSolidBox(0, 0, 14, 4, 10, 0x46515f);
addSolidBox(-35, 18, 10, 6, 16, 0x4a5563);
addSolidBox(38, -20, 16, 4, 10, 0x4a5563);
addSolidBox(55, 40, 10, 7, 18, 0x3f4a56);
addSolidBox(-60, -35, 16, 4, 16, 0x3f4a56);
addSolidBox(10, 55, 20, 4, 10, 0x46515f);
addSolidBox(-15, -62, 22, 4, 12, 0x46515f);
addSolidBox(75, 0, 10, 8, 22, 0x3f4a56);
addSolidBox(-75, 0, 10, 8, 22, 0x3f4a56);

// ---------------- Controls ----------------
const controls = new PointerLockControls(camera, document.body);
addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

// ---------------- Input ----------------
const keys = { w:false, a:false, s:false, d:false, shift:false, ctrl:false };
let firing = false;
let ads = false;
let jumpBuffer = 0;

addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true; // SPRINT
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
  if (e.button === 0) { // left
    firing = true;
    if (weapon.fireMode === "semi") tryFire();
  }
  if (e.button === 2) { // right
    ads = true;
  }
});

addEventListener("mouseup", (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) ads = false;
});

// gun sway from mouse
let mouseDX = 0, mouseDY = 0;
addEventListener("mousemove", (e) => {
  if (!controls.isLocked) return;
  mouseDX += e.movementX || 0;
  mouseDY += e.movementY || 0;
});

// ---------------- Movement ----------------
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
const SPRINT_SPEED = 8.2;   // SHIFT sprint
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

  camera.position.x += vel.x * dt;
  camera.position.z += vel.z * dt;
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

// ---------------- Weapons ----------------
const WEAPONS = {
  ak: { name:"AK-47", fireMode:"auto", rpm:650, damage:1, spread:0.011, pellets:1, magSize:30, reserveMax:120, reloadTime:2.2, recoilKick:0.65 },
  magnum: { name:"Magnum", fireMode:"semi", rpm:240, damage:3, spread:0.006, pellets:1, magSize:6, reserveMax:48, reloadTime:2.4, recoilKick:0.95 },
  sg: { name:"SG (Shotgun)", fireMode:"semi", rpm:95, damage:1, spread:0.060, pellets:8, magSize:8, reserveMax:40, reloadTime:2.8, recoilKick:1.15 }
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

function secondsPerShot(w) {
  return 60 / w.rpm;
}

function tryFire() {
  if (!controls.isLocked) return;
  if (reloading) return;

  if (ammoInMag <= 0) { tryReload(); return; }
  if (nextShot > 0) return;

  ammoInMag -= 1;
  nextShot = secondsPerShot(weapon);

  gunKick(weapon.recoilKick);

  fireHitscan(weapon);
}

function updateFiring(dt) {
  nextShot = Math.max(0, nextShot - dt);

  if (weapon.fireMode === "auto" && firing) {
    if (nextShot === 0) tryFire();
  }
}

// ---------------- Player Gun (visible, weapon-specific + ADS) ----------------
let gunGroup, muzzleFlash;
let recoil = 0;
let bobT = 0;
let swayX = 0, swayY = 0;

function clearGun() {
  if (!gunGroup) return;
  camera.remove(gunGroup);
  gunGroup.traverse((o) => {
    if (o.geometry) o.geometry.dispose?.();
    if (o.material) o.material.dispose?.();
  });
  gunGroup = null;
  muzzleFlash = null;
}

function buildGunForWeapon() {
  clearGun();

  gunGroup = new THREE.Group();

  const matDark = new THREE.MeshStandardMaterial({ color: 0x1e232b, roughness: 0.6, metalness: 0.3 });
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x2b323c, roughness: 0.45, metalness: 0.55 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0x3b5bff, roughness: 0.35, metalness: 0.5 });

  // Base sizes per weapon (so they look different)
  let bodySize, barrelLen, barrelRad, stock = false;
  if (weaponId === "ak") {
    bodySize = [0.26, 0.14, 0.55];
    barrelLen = 0.55; barrelRad = 0.028; stock = true;
    matAccent.color.setHex(0x3b5bff);
  } else if (weaponId === "magnum") {
    bodySize = [0.20, 0.12, 0.35];
    barrelLen = 0.28; barrelRad = 0.036; stock = false;
    matAccent.color.setHex(0xffd24a);
  } else {
    // shotgun
    bodySize = [0.28, 0.14, 0.60];
    barrelLen = 0.75; barrelRad = 0.045; stock = true;
    matAccent.color.setHex(0x55ffaa);
  }

  const body = new THREE.Mesh(new THREE.BoxGeometry(...bodySize), matMetal);
  body.position.set(0.02, -0.02, -0.18);
  gunGroup.add(body);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.18, 0.12), matDark);
  handle.position.set(-0.06, -0.18, 0.02);
  handle.rotation.x = 0.22;
  gunGroup.add(handle);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(barrelRad, barrelRad, barrelLen, 16), matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.10, 0.02, -0.50);
  gunGroup.add(barrel);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.03, 0.25), matAccent);
  rail.position.set(0.05, 0.08, -0.20);
  gunGroup.add(rail);

  if (stock) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.22), matDark);
    st.position.set(-0.10, -0.02, 0.18);
    gunGroup.add(st);
  }

  // muzzle flash plane
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd37a, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  muzzleFlash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), flashMat);
  muzzleFlash.position.set(0.12, 0.02, -0.95);
  muzzleFlash.visible = false;
  gunGroup.add(muzzleFlash);

  const gunLight = new THREE.PointLight(0xffffff, 0.35, 2.2);
  gunLight.position.set(0.2, -0.1, -0.3);
  gunGroup.add(gunLight);

  // base pose
  gunGroup.position.set(0.36, -0.35, -0.75);
  gunGroup.rotation.set(-0.05, 0.12, 0.02);

  camera.add(gunGroup);
}
buildGunForWeapon();

function gunKick(amount) {
  recoil = Math.min(1, recoil + amount);

  if (muzzleFlash) {
    muzzleFlash.visible = true;
    setTimeout(() => (muzzleFlash.visible = false), 40);
  }
}

function updateGun(dt) {
  if (!gunGroup) return;

  recoil = Math.max(0, recoil - dt * 9.0);

  const moving = controls.isLocked && (keys.w || keys.a || keys.s || keys.d);
  bobT += dt * (moving ? 12.0 : 2.0);

  const swayMul = ads ? 0.35 : 1.0;
  const bobMul = ads ? 0.35 : 1.0;

  const targetSwayX = THREE.MathUtils.clamp(-mouseDX * 0.00035 * swayMul, -0.05, 0.05);
  const targetSwayY = THREE.MathUtils.clamp(-mouseDY * 0.00025 * swayMul, -0.04, 0.04);
  mouseDX *= 0.15;
  mouseDY *= 0.15;

  swayX = THREE.MathUtils.lerp(swayX, targetSwayX, 1 - Math.pow(0.001, dt));
  swayY = THREE.MathUtils.lerp(swayY, targetSwayY, 1 - Math.pow(0.001, dt));

  const bobAmt = (moving ? 0.018 : 0.006) * bobMul;
  const bobX = Math.sin(bobT) * bobAmt;
  const bobY = Math.cos(bobT * 2.0) * bobAmt;

  const recoilZ = -0.09 * recoil;
  const recoilRotX = 0.10 * recoil;

  // ADS pulls gun closer to center
  const basePos = ads ? new THREE.Vector3(0.18, -0.28, -0.62) : new THREE.Vector3(0.36, -0.35, -0.75);
  gunGroup.position.set(basePos.x + bobX + swayX, basePos.y + bobY + swayY, basePos.z + recoilZ);

  const baseRot = ads ? new THREE.Euler(-0.03, 0.02, 0.0) : new THREE.Euler(-0.05, 0.12, 0.02);
  gunGroup.rotation.set(baseRot.x + recoilRotX + swayY * 0.6, baseRot.y + swayX * 0.6, baseRot.z);
}

// ---------------- Enemies (no moonwalk + pistols that shoot) ----------------
const raycaster = new THREE.Raycaster();

let soldierTemplate = null;
let soldierClips = null;

const enemies = []; // includes boss + minions
let wave = 1;

function findClip(clips, wantedNames) {
  if (!clips) return null;
  for (const name of wantedNames) {
    const c = THREE.AnimationClip.findByName(clips, name);
    if (c) return c;
  }
  return clips[0] || null;
}

// IMPORTANT: three.js lookAt makes -Z face the target.
// Soldier model faces +Z, so rotate visual by PI once.
const VISUAL_FIX_Y = Math.PI;

function makeEnemy(opts) {
  const visual = SkeletonUtils.clone(soldierTemplate);
  visual.rotation.y = VISUAL_FIX_Y;

  visual.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const root = new THREE.Group();
  root.add(visual);
  root.scale.setScalar(opts.scale ?? 1.0);

  const collider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45 * (opts.colliderScale ?? 1), 0.9 * (opts.colliderScale ?? 1), 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, 1.1 * (opts.colliderScale ?? 1), 0);
  root.add(collider);

  // pistol prop
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x1d222a, roughness: 0.7, metalness: 0.3 })
  );
  pistol.position.set(0.22, 1.05, 0.20);
  root.add(pistol);

  const muzzleLight = new THREE.PointLight(0xffd37a, 0.0, 2.5);
  muzzleLight.position.set(0.22, 1.05, 0.05);
  root.add(muzzleLight);

  const mixer = new THREE.AnimationMixer(visual);
  const run = findClip(soldierClips, ["Run", "run", "Running"]);
  const idle = findClip(soldierClips, ["Idle", "idle"]);
  const action = run ? mixer.clipAction(run) : (idle ? mixer.clipAction(idle) : null);
  if (action) action.play();

  const e = {
    root, visual, collider, mixer,
    hp: opts.hp ?? 5,
    speed: opts.speed ?? 2.0,
    isBoss: !!opts.isBoss,

    // pistol
    shootEvery: opts.shootEvery ?? 1.0,
    shootCD: Math.random() * 0.5,
    shootRange: opts.shootRange ?? 34,
    damage: opts.damage ?? 6,
    accuracy: opts.accuracy ?? 0.04, // lower = better

    // boss spawns minions
    summonEvery: opts.summonEvery ?? 4.5,
    summonTimer: 0,

    muzzleLight
  };

  collider.userData.owner = e;

  scene.add(root);
  enemies.push(e);
  return e;
}

function spawnWave() {
  // clear old
  while (enemies.length) {
    const e = enemies.pop();
    scene.remove(e.root);
  }

  // boss
  makeEnemy({
    isBoss: true,
    hp: 60 + wave * 12,
    speed: 1.6 + wave * 0.02,
    scale: 1.5,
    colliderScale: 1.25,
    shootEvery: Math.max(0.35, 0.70 - wave * 0.02),
    shootRange: 55,
    damage: 9,
    accuracy: 0.03,
    summonEvery: Math.max(2.2, 4.2 - wave * 0.12)
  }).root.position.set(0, 0, -40);

  // some starting minions
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 25 + Math.random() * 25;
    makeEnemy({
      hp: 6 + Math.floor(wave / 3),
      speed: 2.4 + wave * 0.02,
      scale: 1.0,
      colliderScale: 1.0,
      shootEvery: Math.max(0.55, 1.1 - wave * 0.03),
      shootRange: 38,
      damage: 6,
      accuracy: 0.05
    }).root.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
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

// tracer effects
const effects = []; // { obj, t }
function spawnTracer(from, to, color = 0xffc46b) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  effects.push({ obj: line, t: 0.06 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    effects[i].t -= dt;
    if (effects[i].t <= 0) {
      scene.remove(effects[i].obj);
      effects.splice(i, 1);
    }
  }
}

function enemyShoot(e) {
  const muzzle = new THREE.Vector3(e.root.position.x, 1.25 * e.root.scale.y, e.root.position.z);
  const target = camera.position.clone();

  if (!hasLineOfSight(muzzle, target)) return;

  // miss chance via accuracy
  const dir = target.clone().sub(muzzle);
  dir.x += (Math.random() * 2 - 1) * e.accuracy;
  dir.y += (Math.random() * 2 - 1) * e.accuracy;
  dir.z += (Math.random() * 2 - 1) * e.accuracy;

  const hitPoint = muzzle.clone().add(dir.normalize().multiplyScalar(60));
  spawnTracer(muzzle, hitPoint, e.isBoss ? 0xff6b6b : 0xffc46b);

  e.muzzleLight.intensity = 2.2;
  setTimeout(() => (e.muzzleLight.intensity = 0.0), 45);

  // simple hit check: if aimed roughly at player and within range, apply damage
  // (keeps it lightweight; you can make this true ray hit later)
  const dist = muzzle.distanceTo(camera.position);
  if (dist <= e.shootRange) {
    playerHP -= e.damage;
    if (playerHP <= 0) {
      playerHP = 0;
      infoEl.textContent = "You died. Refresh to restart.";
      controls.unlock();
    }
  }
}

function updateEnemies(dt) {
  // find boss
  const boss = enemies.find((e) => e.isBoss) || null;

  for (const e of enemies) {
    e.mixer.update(dt);

    // face player (NO extra rotate; visual already fixed)
    e.root.lookAt(camera.position.x, e.root.position.y, camera.position.z);

    // keep distance (pistol fight) + movement
    const toPlayer = new THREE.Vector3(
      camera.position.x - e.root.position.x,
      0,
      camera.position.z - e.root.position.z
    );
    const dist = toPlayer.length();
    if (dist > 0.0001) toPlayer.normalize();

    const ideal = e.isBoss ? 26 : 18;
    if (dist > ideal + 2) e.root.position.addScaledVector(toPlayer, e.speed * dt);
    else if (dist < ideal - 2) e.root.position.addScaledVector(toPlayer, -e.speed * 0.65 * dt);

    // shoot
    e.shootCD = Math.max(0, e.shootCD - dt);
    if (controls.isLocked && playerHP > 0 && dist < e.shootRange && e.shootCD === 0) {
      enemyShoot(e);
      e.shootCD = e.shootEvery;
    }

    // boss summons
    if (e.isBoss) {
      e.summonTimer += dt;
      if (e.summonTimer >= e.summonEvery && enemies.length < 40) {
        e.summonTimer = 0;
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 6;
          makeEnemy({
            hp: 6 + Math.floor(wave / 3),
            speed: 2.5 + wave * 0.02,
            scale: 1.0,
            colliderScale: 1.0,
            shootEvery: Math.max(0.6, 1.05 - wave * 0.03),
            shootRange: 38,
            damage: 6,
            accuracy: 0.055
          }).root.position.set(
            e.root.position.x + Math.cos(a) * r,
            0,
            e.root.position.z + Math.sin(a) * r
          );
        }
      }
    }

    // clamp inside map
    e.root.position.x = THREE.MathUtils.clamp(e.root.position.x, -MAP_HALF, MAP_HALF);
    e.root.position.z = THREE.MathUtils.clamp(e.root.position.z, -MAP_HALF, MAP_HALF);
  }

  // wave loop: if boss dead -> next wave after 4s
  if (!boss) {
    wave += 1;
    spawnWave();
  }
}

// ---------------- Player hitscan ----------------
function randSpread(spread) {
  return (Math.random() * 2 - 1) * spread;
}

function fireHitscan(w) {
  const colliders = enemies.map((e) => e.collider);

  const origin = camera.position.clone();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);

  // ADS makes spread tighter
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
      // remove enemy
      const idx = enemies.indexOf(target);
      if (idx !== -1) enemies.splice(idx, 1);
      scene.remove(target.root);
    }
  }
}

// ---------------- Load model & start ----------------
function loadGLB(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

infoEl.textContent = "Loading...";

loadGLB("https://threejs.org/examples/models/gltf/Soldier.glb")
  .then((gltf) => {
    soldierTemplate = gltf.scene;
    soldierClips = gltf.animations;

    setWeapon("ak");
    spawnWave();

    infoEl.textContent =
      "Click lock • WASD • SHIFT sprint • CTRL crouch • SPACE jump • RMB ADS • 1/2/3 guns • R reload";
  })
  .catch((err) => {
    console.error(err);
    infoEl.textContent = "Model load failed. Open Console (F12).";
  });

// ---------------- HUD ----------------
function updateHUD() {
  const reloadText = reloading ? " (reloading)" : "";
  const adsText = ads ? " ADS" : "";
  healthEl.textContent = `HP: ${playerHP} | ${weapon.name}${adsText} ${ammoInMag}/${ammoReserve}${reloadText}`;
  infoEl.textContent = `Wave ${wave} | Enemies ${enemies.length} | RMB ADS | SHIFT sprint | 1/2/3 switch`;
}

// ---------------- Loop ----------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (soldierTemplate && playerHP > 0) {
    updatePlayer(dt);
    updateGun(dt);
    updateReload(dt);
    updateFiring(dt);
    updateEnemies(dt);
    updateHUD();
  }

  updateEffects(dt);
  composer.render();
}
animate();

// ---------------- Resize ----------------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth, innerHeight);
  updateFXAA();
});
