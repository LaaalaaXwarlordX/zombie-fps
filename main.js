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

let playerHP = 100;

// ---------------- Map size (bigger) ----------------
const MAP_HALF = 80;            // player bounds
const WALL_POS = MAP_HALF + 4;  // where boundary walls sit
const GROUND_SIZE = 450;

// ---------------- Scene / Camera / Renderer ----------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 20, 180);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1200);
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

const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.45, 0.9);
composer.addPass(bloomPass);

// ---------------- Lights ----------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(20, 30, 10);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 220;
dir.shadow.camera.left = -80;
dir.shadow.camera.right = 80;
dir.shadow.camera.top = 80;
dir.shadow.camera.bottom = -80;
scene.add(dir);

// ---------------- Ground + cover (Valorant-ish blocks) ----------------
const obstacles = []; // used for enemy line-of-sight

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addWall(x, z, w, h, d) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.95 })
  );
  wall.position.set(x, h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  obstacles.push(wall);
  return wall;
}

// boundary
addWall(0, -WALL_POS, MAP_HALF * 2 + 12, 8, 2);
addWall(0,  WALL_POS, MAP_HALF * 2 + 12, 8, 2);
addWall(-WALL_POS, 0, 2, 8, MAP_HALF * 2 + 12);
addWall( WALL_POS, 0, 2, 8, MAP_HALF * 2 + 12);

// cover boxes (simple "Valorant map" vibe)
function addBox(x, z, w, h, d, color = 0x46515f) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
  );
  box.position.set(x, h / 2, z);
  box.castShadow = true;
  box.receiveShadow = true;
  scene.add(box);
  obstacles.push(box);
  return box;
}
addBox(0, 0, 10, 4, 6);
addBox(-20, 10, 8, 5, 8);
addBox(22, -12, 12, 4, 6);
addBox(15, 25, 7, 6, 10);
addBox(-28, -22, 10, 4, 10);

// ---------------- Controls ----------------
const controls = new PointerLockControls(camera, document.body);
addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

// ---------------- Input ----------------
const keys = { w:false,a:false,s:false,d:false, shift:false, ctrl:false };
let jumpBuffer = 0;
let firing = false;

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
  if (e.button !== 0) return;
  firing = true;
  if (weapon.fireMode === "semi") tryFire();
});
addEventListener("mouseup", (e) => {
  if (e.button === 0) firing = false;
});

// mouse deltas for gun sway
let mouseDX = 0, mouseDY = 0;
addEventListener("mousemove", (e) => {
  if (!controls.isLocked) return;
  mouseDX += e.movementX || 0;
  mouseDY += e.movementY || 0;
});

// ---------------- Movement (Valorant-ish) ----------------
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

const RUN_SPEED = 7.2;
const WALK_SPEED = 4.6;     // Shift = walk
const CROUCH_SPEED = 3.0;   // Ctrl

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
  if (keys.shift) return WALK_SPEED;
  return RUN_SPEED;
}

function updatePlayer(dt) {
  if (!controls.isLocked) return;

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
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
}

// ---------------- Weapons (AK / Magnum / SG) ----------------
const WEAPONS = {
  ak: { name:"AK-47", fireMode:"auto", rpm:600, damage:1, spread:0.010, pellets:1, magSize:30, reserveMax:90, reloadTime:2.2, recoilKick:0.65 },
  magnum: { name:"Magnum", fireMode:"semi", rpm:240, damage:3, spread:0.006, pellets:1, magSize:6, reserveMax:36, reloadTime:2.4, recoilKick:0.95 },
  sg: { name:"SG (Shotgun)", fireMode:"semi", rpm:90, damage:1, spread:0.055, pellets:8, magSize:8, reserveMax:32, reloadTime:2.8, recoilKick:1.1 }
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
  updateGunShape();
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
  if (!controls.isLocked || playerHP <= 0) return;
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

// ---------------- Player gun (placeholder, changes by weapon) ----------------
let gunGroup, muzzleFlash;
let recoil = 0;
let bobT = 0;
let swayX = 0, swayY = 0;
let gunBarrel, gunAccent;

function makeGun() {
  const g = new THREE.Group();
  const matGun = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.55, metalness: 0.35 });
  const matHandle = new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: 0.7, metalness: 0.25 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.45), matGun);
  body.position.set(0.0, -0.02, -0.15);
  g.add(body);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.10), matHandle);
  handle.position.set(-0.05, -0.14, 0.00);
  handle.rotation.x = 0.2;
  g.add(handle);

  gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 16), matGun);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0.08, 0.02, -0.36);
  g.add(gunBarrel);

  gunAccent = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.03, 0.22),
    new THREE.MeshStandardMaterial({ color: 0x3b5bff, roughness: 0.35, metalness: 0.5 })
  );
  gunAccent.position.set(0.03, 0.07, -0.18);
  g.add(gunAccent);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd37a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), flashMat);
  flash.position.set(0.08, 0.02, -0.55);
  flash.visible = false;
  g.add(flash);

  const gunLight = new THREE.PointLight(0xffffff, 0.35, 2.0);
  gunLight.position.set(0.2, -0.1, -0.3);
  g.add(gunLight);

  g.position.set(0.35, -0.35, -0.70);
  g.rotation.set(-0.05, 0.12, 0.02);

  return { g, flash };
}

(function initGun() {
  const built = makeGun();
  gunGroup = built.g;
  muzzleFlash = built.flash;
  camera.add(gunGroup);
  updateGunShape();
})();

function updateGunShape() {
  if (!gunBarrel || !gunAccent) return;

  if (weaponId === "ak") {
    gunBarrel.geometry = new THREE.CylinderGeometry(0.028, 0.028, 0.42, 16);
    gunAccent.material.color.setHex(0x3b5bff);
  } else if (weaponId === "magnum") {
    gunBarrel.geometry = new THREE.CylinderGeometry(0.035, 0.035, 0.30, 16);
    gunAccent.material.color.setHex(0xffd24a);
  } else if (weaponId === "sg") {
    gunBarrel.geometry = new THREE.CylinderGeometry(0.045, 0.045, 0.55, 16);
    gunAccent.material.color.setHex(0x55ffaa);
  }
}

function gunKick(amount) {
  recoil = Math.min(1, recoil + amount);
  muzzleFlash.visible = true;
  setTimeout(() => (muzzleFlash.visible = false), 40);
}

function updateGun(dt) {
  recoil = Math.max(0, recoil - dt * 9.0);

  const moving = controls.isLocked && (keys.w || keys.a || keys.s || keys.d);
  bobT += dt * (moving ? 12.0 : 2.0);

  const targetSwayX = THREE.MathUtils.clamp(-mouseDX * 0.00035, -0.05, 0.05);
  const targetSwayY = THREE.MathUtils.clamp(-mouseDY * 0.00025, -0.04, 0.04);
  mouseDX *= 0.15;
  mouseDY *= 0.15;

  swayX = THREE.MathUtils.lerp(swayX, targetSwayX, 1 - Math.pow(0.001, dt));
  swayY = THREE.MathUtils.lerp(swayY, targetSwayY, 1 - Math.pow(0.001, dt));

  const bobAmt = moving ? 0.018 : 0.006;
  const bobX = Math.sin(bobT) * bobAmt;
  const bobY = Math.cos(bobT * 2.0) * bobAmt;

  const recoilZ = -0.09 * recoil;
  const recoilRotX = 0.10 * recoil;

  gunGroup.position.set(0.35 + bobX + swayX, -0.35 + bobY + swayY, -0.70 + recoilZ);
  gunGroup.rotation.set(-0.05 + recoilRotX + swayY * 0.6, 0.12 + swayX * 0.6, 0.02);
}

// ---------------- Enemies: pistol shooting + wave loop ----------------
const raycaster = new THREE.Raycaster();

let soldierTemplate = null;
let soldierClips = null;

let boss = null;
const minions = [];

let wave = 1;
let nextWaveTimer = 0;
const MAX_MINIONS = 30;

// small tracer effects
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

function findClip(clips, wantedNames) {
  if (!clips) return null;
  for (const name of wantedNames) {
    const c = THREE.AnimationClip.findByName(clips, name);
    if (c) return c;
  }
  return clips[0] || null;
}

// Fix moonwalking/backwards once: rotate the visual model 180° inside the root.
const VISUAL_Y_OFFSET = Math.PI;

function makeEnemy(opts) {
  const visual = SkeletonUtils.clone(soldierTemplate);
  visual.rotation.y = VISUAL_Y_OFFSET;

  visual.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const root = new THREE.Group();
  root.add(visual);
  root.scale.setScalar(opts.scale ?? 1.0);

  // collider
  const collider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45 * (opts.colliderScale ?? 1), 0.9 * (opts.colliderScale ?? 1), 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, 1.1 * (opts.colliderScale ?? 1), 0);
  root.add(collider);

  // fake pistol (simple box attached to root so it rotates with enemy)
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.06, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x1d222a, roughness: 0.7, metalness: 0.3 })
  );
  pistol.position.set(0.22, 1.05, 0.20);
  root.add(pistol);

  // tiny muzzle flash light
  const muzzle = new THREE.PointLight(0xffd37a, 0.0, 2.5);
  muzzle.position.set(0.22, 1.05, 0.05);
  root.add(muzzle);

  const mixer = new THREE.AnimationMixer(visual);
  const run = findClip(soldierClips, ["Run", "run", "Running"]);
  const idle = findClip(soldierClips, ["Idle", "idle"]);
  const action = run ? mixer.clipAction(run) : (idle ? mixer.clipAction(idle) : null);
  if (action) action.play();

  const e = {
    root, visual, collider, mixer,
    hp: opts.hp ?? 5,
    speed: opts.speed ?? 1.8,
    isBoss: !!opts.isBoss,

    // pistol shooting
    shootEvery: opts.shootEvery ?? 0.9,
    shootCD: 0,
    shootRange: opts.shootRange ?? 26,
    damage: opts.damage ?? 6,

    // minion spawn
    summonEvery: opts.summonEvery ?? 5.5,
    summonTimer: 0,

    muzzleLight: muzzle
  };

  collider.userData.owner = e;
  return e;
}

function spawnBoss() {
  const hp = 45 + wave * 12;
  boss = makeEnemy({
    isBoss: true,
    hp,
    speed: 1.35 + wave * 0.02,
    scale: 1.45,
    colliderScale: 1.25,

    // boss pistol is stronger/faster
    shootEvery: Math.max(0.35, 0.65 - wave * 0.02),
    shootRange: 40,
    damage: 9,

    summonEvery: Math.max(2.6, 5.5 - wave * 0.25),
  });
  boss.root.position.set(0, 0, -25);
  scene.add(boss.root);
}

function spawnMinionAt(x, z) {
  if (minions.length >= MAX_MINIONS) return;

  const m = makeEnemy({
    hp: 4 + Math.floor(wave / 3),
    speed: 2.2 + wave * 0.02,
    scale: 0.95,
    colliderScale: 1.0,

    shootEvery: Math.max(0.7, 1.05 - wave * 0.02),
    shootRange: 28,
    damage: 6,
  });

  m.root.position.set(x, 0, z);
  scene.add(m.root);
  minions.push(m);
}

function despawnEnemy(e, arr) {
  scene.remove(e.root);
  if (arr) {
    const i = arr.indexOf(e);
    if (i !== -1) arr.splice(i, 1);
  }
}

// line-of-sight check for enemy shooting
function hasLineOfSight(from, to) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  dir.normalize();

  raycaster.ray.origin.copy(from);
  raycaster.ray.direction.copy(dir);

  const hits = raycaster.intersectObjects(obstacles, false);
  if (hits.length === 0) return true;

  // if the nearest obstacle is closer than the player, blocked
  return hits[0].distance > dist - 0.2;
}

function enemyShoot(e) {
  // muzzle position
  const muzzle = new THREE.Vector3(e.root.position.x, 1.25 * e.root.scale.y, e.root.position.z);
  const target = camera.position.clone();

  if (!hasLineOfSight(muzzle, target)) return;

  // tracer
  spawnTracer(muzzle, target, e.isBoss ? 0xff6b6b : 0xffc46b);

  // flash
  e.muzzleLight.intensity = 2.2;
  setTimeout(() => (e.muzzleLight.intensity = 0.0), 45);

  // damage
  playerHP -= e.damage;
  if (playerHP <= 0) {
    playerHP = 0;
    infoEl.textContent = "You died. Refresh to restart.";
    controls.unlock();
  }
}

function chaseAndShoot(e, dt) {
  e.mixer.update(dt);

  const toPlayer = new THREE.Vector3(
    camera.position.x - e.root.position.x,
    0,
    camera.position.z - e.root.position.z
  );
  const dist = toPlayer.length();
  if (dist > 0.0001) toPlayer.normalize();

  // keep a "gunfight distance" instead of always melee
  const ideal = e.isBoss ? 18 : 14;

  if (dist > ideal + 2) {
    e.root.position.addScaledVector(toPlayer, e.speed * dt);
  } else if (dist < ideal - 1) {
    e.root.position.addScaledVector(toPlayer, -e.speed * 0.7 * dt);
  }

  // face player (visual is already rotated to fix moonwalk)
  e.root.lookAt(camera.position.x, e.root.position.y, camera.position.z);

  // shoot
  e.shootCD = Math.max(0, e.shootCD - dt);
  if (dist < e.shootRange && e.shootCD === 0 && playerHP > 0 && controls.isLocked) {
    enemyShoot(e);
    e.shootCD = e.shootEvery;
  }

  // boss summons minions
  if (e.isBoss) {
    e.summonTimer += dt;
    if (e.summonTimer >= e.summonEvery) {
      e.summonTimer = 0;
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 3;
        spawnMinionAt(
          e.root.position.x + Math.cos(a) * r,
          e.root.position.z + Math.sin(a) * r
        );
      }
    }
  }

  // clamp inside map
  e.root.position.x = THREE.MathUtils.clamp(e.root.position.x, -MAP_HALF, MAP_HALF);
  e.root.position.z = THREE.MathUtils.clamp(e.root.position.z, -MAP_HALF, MAP_HALF);
}

function updateWaves(dt) {
  if (boss) return;
  nextWaveTimer = Math.max(0, nextWaveTimer - dt);
  if (nextWaveTimer === 0) {
    wave += 1;
    while (minions.length) despawnEnemy(minions.pop());
    spawnBoss();
  }
}

// ---------------- Player hitscan ----------------
function randSpread(spread) {
  return (Math.random() * 2 - 1) * spread;
}

function fireHitscan(w) {
  const colliders = [];
  if (boss) colliders.push(boss.collider);
  for (const m of minions) colliders.push(m.collider);

  const origin = camera.position.clone();
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);

  for (let p = 0; p < w.pellets; p++) {
    const dir = baseDir.clone();
    dir.x += randSpread(w.spread);
    dir.y += randSpread(w.spread);
    dir.normalize();

    raycaster.ray.origin.copy(origin);
    raycaster.ray.direction.copy(dir);

    const hits = raycaster.intersectObjects(colliders, false);
    if (hits.length === 0) continue;

    const target = hits[0].object.userData.owner;
    if (!target) continue;

    target.hp -= w.damage;

    if (target.hp <= 0) {
      if (target.isBoss) {
        despawnEnemy(target);
        boss = null;
        nextWaveTimer = 4.0;
      } else {
        despawnEnemy(target, minions);
      }
    }
  }
}

// ---------------- Load models and start ----------------
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
    spawnBoss();

    infoEl.textContent =
      "Click to lock • WASD move • Shift walk • Ctrl crouch • Space jump • 1/2/3 guns • R reload";
  })
  .catch((err) => {
    console.error(err);
    infoEl.textContent = "Failed to load model. Open Console (F12).";
  });

// ---------------- HUD ----------------
function updateHUD() {
  const bossHP = boss ? boss.hp : 0;
  const reloadText = reloading ? " (reloading)" : "";
  healthEl.textContent = `HP: ${playerHP} | ${weapon.name} ${ammoInMag}/${ammoReserve}${reloadText}`;
  infoEl.textContent = `Wave ${wave} | BossHP ${bossHP} | Minions ${minions.length} | Enemies shoot pistols`;
}

// ---------------- Loop ----------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (playerHP > 0 && soldierTemplate) {
    updatePlayer(dt);
    updateGun(dt);
    updateReload(dt);
    updateFiring(dt);

    if (boss) {
      chaseAndShoot(boss, dt);
    } else {
      updateWaves(dt);
    }

    for (let i = minions.length - 1; i >= 0; i--) {
      chaseAndShoot(minions[i], dt);
    }

    updateEffects(dt);
    updateHUD();
  } else {
    updateEffects(dt);
  }

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
