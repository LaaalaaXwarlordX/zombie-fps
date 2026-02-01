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

// ---------------- Scene / Camera / Renderer ----------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 12, 85);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 1.6, 6);
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

const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.30, 0.45, 0.9);
composer.addPass(bloomPass);

// ---------------- Lights ----------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(8, 12, 4);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 120;
dir.shadow.camera.left = -40;
dir.shadow.camera.right = 40;
dir.shadow.camera.top = 40;
dir.shadow.camera.bottom = -40;
scene.add(dir);

// ---------------- Ground + arena ----------------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function addWall(x, z, w, h, d) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.9 })
  );
  wall.position.set(x, h / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
}
addWall(0, -35, 70, 6, 1);
addWall(0, 35, 70, 6, 1);
addWall(-35, 0, 1, 6, 70);
addWall(35, 0, 1, 6, 70);

// ---------------- Controls ----------------
const controls = new PointerLockControls(camera, document.body);
addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

// ---------------- Input ----------------
const keys = {
  w: false, a: false, s: false, d: false,
  shift: false, ctrl: false
};

let jumpQueued = false;
let jumpBuffer = 0;

addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = true;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = true;
  if (e.code === "Space") {
    jumpQueued = true;
    jumpBuffer = 0.12; // jump buffer (seconds)
  }
});

addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight") keys.shift = false;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = false;
});

// mouse deltas for gun sway
let mouseDX = 0, mouseDY = 0;
addEventListener("mousemove", (e) => {
  if (!controls.isLocked) return;
  mouseDX += e.movementX || 0;
  mouseDY += e.movementY || 0;
});

// ---------------- Movement (Valorant-ish feel) ----------------
const clock = new THREE.Clock();

const vel = new THREE.Vector3(0, 0, 0); // xz velocity
let velY = 0;

const up = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const wishDir = new THREE.Vector3();

const EYE_STAND = 1.6;
const EYE_CROUCH = 1.2;
let eyeTarget = EYE_STAND;

let grounded = true;
let coyote = 0; // coyote time remaining

const GRAVITY = 18.0;
const JUMP_SPEED = 6.2;

const RUN_SPEED = 7.2;      // default run
const WALK_SPEED = 4.6;     // Shift = walk (Valorant style)
const CROUCH_SPEED = 3.0;   // Ctrl

const GROUND_ACCEL = 55.0;
const AIR_ACCEL = 18.0;
const GROUND_FRICTION = 12.0;

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

  // crouch smooth
  eyeTarget = keys.ctrl ? EYE_CROUCH : EYE_STAND;

  // build wish dir from camera
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

  // timers
  jumpBuffer = Math.max(0, jumpBuffer - dt);
  coyote = Math.max(0, coyote - dt);

  // gravity
  velY -= GRAVITY * dt;

  // ground check (flat ground)
  const eyeHeight = camera.position.y;
  const targetFloor = eyeTarget;

  if (eyeHeight <= targetFloor) {
    camera.position.y = targetFloor;
    if (velY < 0) velY = 0;
    if (!grounded) coyote = 0.10; // when we *just* landed, reset coyote small window
    grounded = true;
  } else {
    if (grounded) coyote = 0.10; // leaving ground -> coyote time
    grounded = false;
  }

  // jump if buffered and (ground or coyote)
  if (jumpBuffer > 0 && (grounded || coyote > 0)) {
    grounded = false;
    coyote = 0;
    velY = JUMP_SPEED;
    jumpBuffer = 0;
  }

  // movement
  const maxSpeed = getMoveSpeed();

  if (grounded) applyFriction(dt);
  accelerate(dt, grounded ? GROUND_ACCEL : AIR_ACCEL, maxSpeed);

  // integrate
  camera.position.x += vel.x * dt;
  camera.position.z += vel.z * dt;
  camera.position.y += velY * dt;

  // clamp arena
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -31, 31);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -31, 31);

  // keep eye height smooth (prevents weird crouch pops)
  if (camera.position.y < eyeTarget) camera.position.y = eyeTarget;
}

// ---------------- Placeholder Gun (with sway/bob/recoil) ----------------
let gunGroup, muzzleFlash;
let recoil = 0;
let bobT = 0;
let swayX = 0, swayY = 0;

function makeGun() {
  const g = new THREE.Group();

  const matGun = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.55, metalness: 0.35 });
  const matAccent = new THREE.MeshStandardMaterial({ color: 0x3b5bff, roughness: 0.35, metalness: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.45), matGun);
  body.position.set(0.0, -0.02, -0.15);
  g.add(body);

  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.10), matGun);
  handle.position.set(-0.05, -0.14, 0.00);
  handle.rotation.x = 0.2;
  g.add(handle);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 16), matGun);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.08, 0.02, -0.36);
  g.add(barrel);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.22), matAccent);
  rail.position.set(0.03, 0.07, -0.18);
  g.add(rail);

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffd37a,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
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
})();

function gunKick() {
  recoil = Math.min(1, recoil + 0.7);
  muzzleFlash.visible = true;
  setTimeout(() => (muzzleFlash.visible = false), 40);
}

function updateGun(dt) {
  if (!gunGroup) return;

  recoil = Math.max(0, recoil - dt * 9.0);

  const moving = controls.isLocked && (keys.w || keys.a || keys.s || keys.d);
  bobT += dt * (moving ? 12.0 : 2.0);

  // sway from mouse
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

// ---------------- Enemies: boss + minions (no files needed) ----------------
const raycaster = new THREE.Raycaster();

let soldierTemplate = null;
let soldierClips = null;

let boss = null;
const minions = [];

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

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  root.scale.setScalar(opts.scale ?? 1.0);

  const collider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45 * (opts.colliderScale ?? 1), 0.9 * (opts.colliderScale ?? 1), 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, 1.1 * (opts.colliderScale ?? 1), 0);
  root.add(collider);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  const idle = findClip(soldierClips, ["Idle", "idle"]);
  const run = findClip(soldierClips, ["Run", "run", "Running"]);
  if (idle) actions.Idle = mixer.clipAction(idle);
  if (run) actions.Run = mixer.clipAction(run);

  const enemy = {
    root, collider, mixer, actions,
    hp: opts.hp ?? 5,
    speed: opts.speed ?? 1.9,
    isBoss: !!opts.isBoss,
    hitCD: 0
  };
  collider.userData.owner = enemy;

  if (actions.Run) actions.Run.play();
  else if (actions.Idle) actions.Idle.play();

  return enemy;
}

function spawnBoss() {
  boss = makeEnemy({ isBoss: true, hp: 45, speed: 1.35, scale: 1.4, colliderScale: 1.25 });
  boss.root.position.set(0, 0, -15);
  boss.summonTimer = 0;
  boss.summonEvery = 5.5;
  scene.add(boss.root);
}

function spawnMinionAt(x, z) {
  const m = makeEnemy({ hp: 4, speed: 2.2, scale: 0.95, colliderScale: 1.0 });
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

function chaseEnemy(e, dt) {
  e.mixer.update(dt);

  const toPlayer = new THREE.Vector3(
    camera.position.x - e.root.position.x,
    0,
    camera.position.z - e.root.position.z
  );

  const dist = toPlayer.length();
  if (dist > 0.0001) toPlayer.normalize();

  e.root.position.addScaledVector(toPlayer, e.speed * dt);
  e.root.lookAt(camera.position.x, e.root.position.y, camera.position.z);

  e.hitCD = Math.max(0, e.hitCD - dt);
  const dmgRange = e.isBoss ? 1.9 : 1.4;
  if (dist < dmgRange && e.hitCD === 0) {
    playerHP -= e.isBoss ? 15 : 10;
    e.hitCD = 0.6;
    healthEl.textContent = `HP: ${playerHP}`;
    if (playerHP <= 0) {
      infoEl.textContent = "You died. Refresh to restart.";
      controls.unlock();
    }
  }

  e.root.position.x = THREE.MathUtils.clamp(e.root.position.x, -33, 33);
  e.root.position.z = THREE.MathUtils.clamp(e.root.position.z, -33, 33);
}

function updateBossSummons(dt) {
  if (!boss) return;
  boss.summonTimer += dt;
  if (boss.summonTimer >= boss.summonEvery) {
    boss.summonTimer = 0;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 2;
      spawnMinionAt(
        boss.root.position.x + Math.cos(a) * r,
        boss.root.position.z + Math.sin(a) * r
      );
    }
  }
}

// ---------------- Shooting ----------------
function shoot() {
  if (!controls.isLocked || playerHP <= 0) return;

  gunKick();

  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  const colliders = [];
  if (boss) colliders.push(boss.collider);
  for (const m of minions) colliders.push(m.collider);

  const hits = raycaster.intersectObjects(colliders, false);
  if (hits.length === 0) return;

  const target = hits[0].object.userData.owner;
  if (!target) return;

  target.hp -= 1;

  if (target.hp <= 0) {
    if (target.isBoss) {
      despawnEnemy(target);
      boss = null;
      infoEl.textContent = "Boss defeated! Refresh to play again.";
    } else {
      despawnEnemy(target, minions);
    }
  }
}

addEventListener("mousedown", (e) => {
  if (e.button === 0) shoot();
});

// ---------------- Load and start ----------------
function loadGLB(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

infoEl.textContent = "Loading...";

loadGLB("https://threejs.org/examples/models/gltf/Soldier.glb")
  .then((gltf) => {
    soldierTemplate = gltf.scene;
    soldierClips = gltf.animations;

    spawnBoss();
    infoEl.textContent = "Click to lock mouse • WASD move • Shift walk • Ctrl crouch • Space jump • Click shoot";
  })
  .catch((err) => {
    console.error(err);
    infoEl.textContent = "Failed to load model. Open Console (F12).";
  });

// ---------------- Loop ----------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (playerHP > 0 && soldierTemplate) {
    updatePlayer(dt);
    updateGun(dt);

    if (boss) {
      chaseEnemy(boss, dt);
      updateBossSummons(dt);
    }
    for (let i = minions.length - 1; i >= 0; i--) chaseEnemy(minions[i], dt);

    healthEl.textContent = `HP: ${playerHP}`;
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
