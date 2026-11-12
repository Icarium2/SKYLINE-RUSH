import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { Sfx } from './audio.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { World } from './world.js';

const COLORS = {
  sky: 0x87ceeb,
  fog: 0xa8d8f0,
  sun: 0xfff4d6,
};

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector('#app').appendChild(renderer.domElement);

// --- Scene, camera, lights ----------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.Fog(COLORS.fog, 45, 130);

const camera = new THREE.PerspectiveCamera(
  62,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);
camera.position.set(0, 4.8, 8.5);

scene.add(new THREE.HemisphereLight(COLORS.sky, 0x7ec850, 1.1));

const sun = new THREE.DirectionalLight(COLORS.sun, 1.8);
sun.position.set(14, 26, -10);
sun.target.position.set(0, 0, -20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 45;
sun.shadow.camera.bottom = -45;
sun.shadow.camera.far = 90;
scene.add(sun, sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- UI -----------------------------------------------------------------------
const ui = {
  score: document.querySelector('#score'),
  coins: document.querySelector('#coins'),
  power: document.querySelector('#power'),
  hud: document.querySelector('#hud'),
  start: document.querySelector('#overlay-start'),
  over: document.querySelector('#overlay-over'),
  finalScore: document.querySelector('#final-score'),
  loading: document.querySelector('#overlay-loading'),
};

// --- Game -----------------------------------------------------------------------
const input = new Input();
const sfx = new Sfx();
const clock = new THREE.Clock();
const playerBox = new THREE.Box3();

let state = 'loading'; // loading | menu | running | over
let world;
let player;
let coins = 0;
let overCooldown = 0;

function startRun() {
  sfx.init(); // created on a user gesture, as browsers require
  world.reset();
  player.reset();
  coins = 0;
  input.clear();
  state = 'running';
  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.hud.classList.remove('hidden');
}

function endRun() {
  state = 'over';
  overCooldown = 0.7;
  input.clear(); // drop keypresses from the run so they can't auto-restart
  player.die();
  ui.finalScore.textContent = `${score()} points · ${coins} coins`;
  ui.over.classList.remove('hidden');
}

function score() {
  return Math.floor(world.distance + coins * 50);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'running') {
    world.update(dt);
    player.update(dt, input, world);

    const res = world.resolve(player.getBox(playerBox));
    if (res.coins) {
      coins += res.coins;
      sfx.play('coin');
    }
    if (res.power) {
      // Picking up a duplicate extends what you already have.
      if (res.power === 'spring') {
        player.superJumpTimer = Math.max(0, player.superJumpTimer) + 8;
      } else {
        player.boulderCharges += 3;
      }
      sfx.powerup();
    }
    if (res.hit) {
      if (player.boulderCharges > 0) {
        player.boulderCharges--;
        world.smash(res.hitRef);
        sfx.explosion();
      } else {
        endRun();
      }
    }

    ui.score.textContent = score();
    ui.coins.textContent = coins;
    const powers = [];
    if (player.superJumpTimer > 0) powers.push(`🌀 ${Math.ceil(player.superJumpTimer)}s`);
    if (player.boulderCharges > 0) powers.push(`🪨 ×${player.boulderCharges}`);
    ui.power.textContent = powers.join('  ');
    ui.power.parentElement.classList.toggle('hidden', powers.length === 0);
  } else if (state === 'over') {
    player.updateDeath(dt);
    overCooldown -= dt;
    if (overCooldown <= 0 && input.consumeAny()) startRun();
  } else if (state === 'menu') {
    player.mixer.update(dt);
    if (input.consumeAny()) startRun();
  }

  // Chase camera follows the player's lane.
  camera.position.x += (player.x * 0.45 - camera.position.x) * Math.min(1, 6 * dt);
  camera.lookAt(camera.position.x * 0.9, 1.7, -12);

  renderer.render(scene, camera);
}

loadAssets()
  .then((assets) => {
    world = new World(scene, assets);
    player = new Player(assets, sfx);
    scene.add(player.root);
    player.play('idle', 0);

    ui.loading.classList.add('hidden');
    ui.start.classList.remove('hidden');
    input.clear();
    state = 'menu';
    window.__skyline = { world, player }; // debug/testing handle
  })
  .catch((err) => {
    ui.loading.textContent = `Failed to load assets: ${err.message || err}`;
    console.error(err);
  });

renderer.setAnimationLoop(() => {
  if (state !== 'loading') tick();
});
