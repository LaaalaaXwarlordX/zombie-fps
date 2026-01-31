import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SkeletonUtils } from "three/addons/utils/SkeletonUtils.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

const healthEl = document.getElementById("health");
const infoEl = document.getElementById("info");

let playerHP = 100;

// ---------- Scene / Camera / Renderer ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
scene.fog = new THREE.Fog(0x0b0f14, 12, 70);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
camera.position.set(0, 1.6, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// Better look
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

// Shadows
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Environment lighting
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// ---------- Postprocessing ----------
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

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.35,
  0.4,
  0.9
);
composer.addPass(bloomPass);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 0.9));

const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(8, 12, 4);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.near = 0.5;
dir.shadow.camera.far = 80;
dir.shadow.camera.left = -30;
dir.shadow.camera.right = 30;
dir.shadow.camera.top = 30;
dir.shadow.camera.bottom = -30;
scene.add(dir);

// ---------- Ground ----------
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Simple arena walls
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
addWall(0, -30, 60, 6, 1);
addWall(0, 30, 60, 6, 1);
addWall(-30, 0, 1, 6, 60);
addWall(30, 0, 1, 6, 60);

// ---------- Controls ----------
const controls = new PointerLockControls(camera, document.body);

addEventListener("click", () => {
  if (!controls.isLocked) controls.lock();
});

controls.addEventListener("lock", () => {
  infoEl.textContent = "WASD to move • Click to shoot";
});
controls.addEventListener("unlock", () => {
  infoEl.textContent = "Click to lock mouse • WASD to move • Click to shoot";
});

// ---------- Movement ----------
const keys = { w: false, a: false, s: false, d: false };

addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
});
addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
});

const clock = new THREE.Clock();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

const PLAYER_SPEED = 7.0;

// ---------- Zombies (animated model) ----------
const zombies = []; // { root, collider, mixer, actions, current, hp, speed }
const raycaster = new THREE.Raycaster();

let zombieTemplate = null;
let zombieClips = null;

function findClip(clips, wantedNames) {
  if (!clips) return null;
  for (const name of wantedNames) {
    const c = THREE.AnimationClip.findByName(clips, name);
    if (c) return c;
  }
  return clips[0] || null;
}

function setZombieAction(z, name) {
  if (!z.actions[name] || z.current === name) return;

  const next = z.actions[name];
  const prev = z.current ? z.actions[z.current] : null;

  if (prev) prev.fadeOut(0.15);
  next.reset().fadeIn(0.15).play();

  z.current = name;
}

function spawnZombie() {
  if (!zombieTemplate) return;

  const root = SkeletonUtils.clone(zombieTemplate);

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  const angle = Math.random() * Math.PI * 2;
  const dist = 12 + Math.random() * 18;
  root.position.set(
    camera.position.x + Math.cos(angle) * dist,
    0,
    camera.position.z + Math.sin(angle) * dist
  );

  // collider for raycast hits
  const collider = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.45, 0.9, 4, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.0 })
  );
  collider.position.set(0, 1.1, 0);
  root.add(collider);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  const idle = findClip(zombieClips, ["Idle", "idle"]);
  const walk = findClip(zombieClips, ["Walk", "walk", "Walking"]);
  const run = findClip(zombieClips, ["Run", "run", "Running"]);

  if (idle) actions.Idle = mixer.clipAction(idle);
  if (walk) actions.Walk = mixer.clipAction(walk);
  if (run) actions.Run = mixer.clipAction(run);

  const z = {
    root,
    collider,
    mixer,
    actions,
    current: null,
    hp: 4,
    speed: 1.5 + Math.random() * 0.9,
  };

  collider.userData.owner = z;

  scene.add(root);
  zombies.push(z);

  if (actions.Run) setZombieAction(z, "Run");
  else if (actions.Walk) setZombieAction(z, "Walk");
  else if (actions.Idle) setZombieAction(z, "Idle");
}

function despawnZombie(z) {
  scene.remove(z.root);
  const idx = zombies.indexOf(z);
  if (idx !== -1) zombies.splice(idx, 1);
}

function loadZombieModel() {
  const loader = new GLTFLoader();

  // Free animated model for testing pipeline
  const url = "https://threejs.org/examples/models/gltf/Soldier.glb";

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        zombieTemplate = gltf.scene;
        zombieClips = gltf.animations;
        zombieTemplate.scale.setScalar(1.0);
        zombieTemplate.position.set(0, 0, 0);
        resolve();
      },
      undefined,
      reject
    );
  });
}

// ---------- Shooting ----------
function shoot() {
  if (!controls.isLocked || playerHP <= 0) return;

  raycaster.setFromCamera({ x: 0, y: 0 }, camera);

  const colliders = zombies.map((z) => z.collider);
  const hits = raycaster.intersectObjects(colliders, false);
  if (hits.length === 0) return;

  const z = hits[0].object.userData.owner;
  if (!z) return;

  z.hp -= 1;

  // hit feedback
  z.root.scale.multiplyScalar(1.03);
  setTimeout(() => z.root.scale.multiplyScalar(1 / 1.03), 60);

  if (z.hp <= 0) {
    despawnZombie(z);
    spawnZombie();
  }
}

addEventListener("mousedown", (e) => {
  if (e.button === 0) shoot();
});

// ---------- Game logic ----------
let damageCooldown = 0;

function updatePlayer(dt) {
  camera.position.y = 1.6;

  direction.set(0, 0, 0);
  if (keys.w) direction.z -= 1;
  if (keys.s) direction.z += 1;
  if (keys.a) direction.x -= 1;
  if (keys.d) direction.x += 1;
  direction.normalize();

  velocity.set(0, 0, 0);

  if (controls.isLocked) {
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    right.crossVectors(forward, up).normalize();

    velocity.addScaledVector(forward, -direction.z * PLAYER_SPEED);
    velocity.addScaledVector(right, direction.x * PLAYER_SPEED);

    camera.position.addScaledVector(velocity, dt);

    // keep inside arena
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -26, 26);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -26, 26);
  }
}

function updateZombies(dt) {
  damageCooldown = Math.max(0, damageCooldown - dt);

  for (const z of zombies) {
    z.mixer.update(dt);

    const toPlayer = new THREE.Vector3(
      camera.position.x - z.root.position.x,
      0,
      camera.position.z - z.root.position.z
    );

    const dist = toPlayer.length();
    if (dist > 0.0001) toPlayer.normalize();

    z.root.position.addScaledVector(toPlayer, z.speed * dt);
    z.root.lookAt(camera.position.x, z.root.position.y, camera.position.z);

    // animation state
    if (dist > 2.2) {
      if (z.actions.Run) setZombieAction(z, "Run");
      else if (z.actions.Walk) setZombieAction(z, "Walk");
    } else {
      if (z.actions.Idle) setZombieAction(z, "Idle");
    }

    // damage player
    if (dist < 1.4 && damageCooldown === 0) {
      playerHP -= 10;
      damageCooldown = 0.6;
      healthEl.textContent = `HP: ${playerHP}`;

      if (playerHP <= 0) {
        infoEl.textContent = "You died. Refresh to restart.";
        controls.unlock();
      }
    }
  }
}

// ---------- Start ----------
infoEl.textContent = "Loading animated zombies...";

loadZombieModel()
  .then(() => {
    infoEl.textContent = "Click to lock mouse • WASD to move • Click to shoot";
    for (let i = 0; i < 7; i++) spawnZombie();
  })
  .catch((err) => {
    console.error(err);
    infoEl.textContent = "Zombie model failed to load. Check Console (F12).";
  });

// ---------- Loop ----------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.033);

  if (playerHP > 0) {
    updatePlayer(dt);
    updateZombies(dt);
  }

  composer.render();
}
animate();

// ---------- Resize ----------
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloomPass.setSize(innerWidth, innerHeight);
  updateFXAA();
});
