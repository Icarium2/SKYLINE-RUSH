import * as THREE from 'three';
import { LANES } from './player.js';

const CHUNK_LEN = 30;
const VISIBLE_CHUNKS = 7;
const ROAD_W = 9;
const START_SPEED = 11;
const MAX_SPEED = 30;
const ACCEL = 0.22;

const RAMP_LEN = 8;
const RAMP_H = 1.8;
const RAMP_W = 2.8;

// Shared geometries/materials so recycling chunks never leaks GPU memory.
const dashGeo = new THREE.PlaneGeometry(0.18, 1.6);
const dashMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const beamMat = new THREE.MeshLambertMaterial({ color: 0xff9f1c });
const postMat = new THREE.MeshLambertMaterial({ color: 0x2ec4b6 });
const beamGeo = new THREE.BoxGeometry(ROAD_W + 0.8, 0.5, 0.4);
const postGeo = new THREE.BoxGeometry(0.35, 1.6, 0.35);

// Lamppost built from primitives (the kit's lampposts are baked into a road tile).
const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.6, 8);
const armGeo = new THREE.BoxGeometry(0.7, 0.08, 0.08);
const lampGeo = new THREE.SphereGeometry(0.16, 10, 8);
const poleMat = new THREE.MeshLambertMaterial({ color: 0x255c62 });
const lampMat = new THREE.MeshLambertMaterial({
  color: 0xfff2b8,
  emissive: 0xffdf80,
  emissiveIntensity: 0.6,
});

function makeLamppost(side) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.3;
  pole.castShadow = true;
  const arm = new THREE.Mesh(armGeo, poleMat);
  arm.position.set(-side * 0.3, 2.55, 0);
  const lamp = new THREE.Mesh(lampGeo, lampMat);
  lamp.position.set(-side * 0.62, 2.5, 0);
  g.add(pole, arm, lamp);
  return g;
}

const BALLOON_COLORS = [0xff6b6b, 0x4ecdc4, 0xffd166, 0xb388eb];

function makeBalloon(color) {
  const g = new THREE.Group();
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 14, 12),
    new THREE.MeshLambertMaterial({ color })
  );
  envelope.scale.y = 1.2;
  const basket = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x8d6e4b })
  );
  basket.position.y = -2.5;
  g.add(envelope, basket);
  return g;
}

const rampGeo = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(RAMP_LEN, RAMP_H);
  shape.lineTo(RAMP_LEN, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: RAMP_W, bevelEnabled: false });
  geo.rotateY(Math.PI / 2); // shape x axis → -z (direction of travel)
  geo.translate(-RAMP_W / 2, 0, 0);
  return geo;
})();

// Wooden loading ramp: wedge sides, plank surface, cross cleats.
const RAMP_ANGLE = Math.atan2(RAMP_H, RAMP_LEN);
const plankGeo = new THREE.BoxGeometry(RAMP_W, 0.12, Math.hypot(RAMP_LEN, RAMP_H) + 0.1);
const cleatGeo = new THREE.BoxGeometry(RAMP_W - 0.3, 0.07, 0.2);
const woodSideMat = new THREE.MeshLambertMaterial({ color: 0x9c6b3c });
const woodTopMat = new THREE.MeshLambertMaterial({ color: 0xc89d66 });
const woodDarkMat = new THREE.MeshLambertMaterial({ color: 0x6e4524 });

function makeRamp() {
  const g = new THREE.Group();
  const wedge = new THREE.Mesh(rampGeo, woodSideMat);
  g.add(wedge);
  const plank = new THREE.Mesh(plankGeo, woodTopMat);
  plank.position.set(0, RAMP_H / 2 + 0.02, -RAMP_LEN / 2);
  plank.rotation.x = RAMP_ANGLE;
  g.add(plank);
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const cleat = new THREE.Mesh(cleatGeo, woodDarkMat);
    cleat.position.set(0, RAMP_H * t + 0.1, -RAMP_LEN * t);
    cleat.rotation.x = RAMP_ANGLE;
    g.add(cleat);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// Traffic cone: orange cone with a white band on a small base.
const coneGeo = new THREE.ConeGeometry(0.24, 0.62, 10);
const coneBandGeo = new THREE.CylinderGeometry(0.17, 0.2, 0.1, 10);
const coneBaseGeo = new THREE.BoxGeometry(0.5, 0.06, 0.5);
const coneMat = new THREE.MeshLambertMaterial({ color: 0xff7b24 });
const coneBandMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

function makeConeRow() {
  const g = new THREE.Group();
  for (const x of [-0.9, 0, 0.9]) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 0.34, 0);
    cone.castShadow = true;
    const band = new THREE.Mesh(coneBandGeo, coneBandMat);
    band.position.set(x, 0.38, 0);
    const base = new THREE.Mesh(coneBaseGeo, coneMat);
    base.position.set(x, 0.03, 0);
    g.add(cone, band, base);
  }
  return g;
}

// Power-up pickups. Emissive materials + an additive halo sprite make them
// read instantly as "good things" against the matte world.
const coilRingGeo = new THREE.TorusGeometry(0.32, 0.07, 8, 16);
const coilCapGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 16);
const coilMat = new THREE.MeshLambertMaterial({
  color: 0x29c7e8,
  emissive: 0x0e7a92,
  emissiveIntensity: 0.8,
});
const coilCapMat = new THREE.MeshLambertMaterial({
  color: 0xff6b6b,
  emissive: 0x6e1f1f,
  emissiveIntensity: 0.6,
});
const boulderGeo = new THREE.IcosahedronGeometry(0.48, 0);
const boulderMat = new THREE.MeshLambertMaterial({
  color: 0x8a7f72,
  emissive: 0x3d3121,
  emissiveIntensity: 0.6,
  flatShading: true,
});

let haloTexture = null;
function getHaloTexture() {
  if (haloTexture) return haloTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(c);
  return haloTexture;
}

function addGlow(group, color, scale, y) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getHaloTexture(),
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sprite.scale.setScalar(scale);
  sprite.position.y = y;
  sprite.userData.baseScale = scale;
  group.add(sprite);
  group.userData.halo = sprite;
}

function makeSpringPickup() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(coilRingGeo, coilMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = i * 0.18;
    g.add(ring);
  }
  const top = new THREE.Mesh(coilCapGeo, coilCapMat);
  top.position.y = 0.76;
  const bottom = new THREE.Mesh(coilCapGeo, coilCapMat);
  bottom.position.y = -0.06;
  g.add(top, bottom);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  addGlow(g, 0x55e6ff, 2.4, 0.35);
  return g;
}

function makeBoulderPickup() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(boulderGeo, boulderMat);
  rock.castShadow = true;
  const chip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), boulderMat);
  chip.position.set(0.38, -0.2, 0.1);
  chip.castShadow = true;
  g.add(rock, chip);
  addGlow(g, 0xffc94d, 2.6, 0);
  return g;
}

/** Clone a vehicle and remember its wheel nodes for spinning. */
function cloneVehicle(proto) {
  const obj = proto.clone();
  const wheels = [];
  obj.traverse((o) => {
    if (o.name && o.name.startsWith('wheel')) wheels.push(o);
  });
  obj.userData.wheels = wheels;
  return obj;
}

export class World {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.group = new THREE.Group();
    scene.add(this.group);
    // Object pool: retired chunk props are reused by later chunks instead of
    // being re-cloned, so steady-state play allocates (almost) nothing.
    this.pool = new Map();
    this.buildStaticEnv();
    this.chunks = [];
    this.debris = [];
    this.reset();
  }

  buildStaticEnv() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 320),
      new THREE.MeshLambertMaterial({ color: 0x7ec850 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.02, -110);
    grass.receiveShadow = true;
    this.scene.add(grass);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_W, 320),
      new THREE.MeshLambertMaterial({ color: 0x5b5f6b })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -110);
    road.receiveShadow = true;
    this.scene.add(road);

    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(
        new THREE.PlaneGeometry(1.6, 320),
        new THREE.MeshLambertMaterial({ color: 0xd9d2c5 })
      );
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(side * (ROAD_W / 2 + 0.8), 0.01, -110);
      walk.receiveShadow = true;
      this.scene.add(walk);

      // Decorative frontage road with its own traffic.
      const frontage = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 320),
        new THREE.MeshLambertMaterial({ color: 0x6a6e78 })
      );
      frontage.rotation.x = -Math.PI / 2;
      frontage.position.set(side * 7.4, 0.005, -110);
      frontage.receiveShadow = true;
      this.scene.add(frontage);
    }

    // Drifting clouds.
    this.clouds = [];
    for (let i = 0; i < 8; i++) {
      const c = this.assets.cloud.clone();
      c.position.set(
        THREE.MathUtils.randFloatSpread(60),
        10 + Math.random() * 6,
        -20 - Math.random() * 120
      );
      c.scale.setScalar(1.5 + Math.random() * 2);
      this.scene.add(c);
      this.clouds.push(c);
    }

    // Hot-air balloons bobbing in the distance.
    this.balloons = [];
    for (let i = 0; i < 4; i++) {
      const b = makeBalloon(BALLOON_COLORS[i % BALLOON_COLORS.length]);
      const baseY = 9 + Math.random() * 7;
      b.position.set(
        (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 18),
        baseY,
        -30 - Math.random() * 110
      );
      b.userData = { baseY, phase: Math.random() * Math.PI * 2 };
      this.scene.add(b);
      this.balloons.push(b);
    }

    // Decorative traffic pool: slow same-direction on the left,
    // fast oncoming on the right.
    this.traffic = [];
    const pool = [...this.assets.trucks, this.assets.motorcycle];
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const car = cloneVehicle(pool[(Math.random() * pool.length) | 0]);
      car.position.set(side * 7.4, 0, -30 - Math.random() * 110);
      car.rotation.y = side === 1 ? 0 : Math.PI;
      car.userData.drive = side === -1 ? 0.65 : -0.45; // fraction of world speed
      this.scene.add(car);
      this.traffic.push(car);
    }

    this.time = 0;
  }

  // --- object pool -------------------------------------------------------------

  /** Fetch a pooled object for `key`, or build one with `factory`. */
  take(chunk, key, factory) {
    const list = this.pool.get(key);
    const obj = list && list.length ? list.pop() : factory();
    obj.visible = true;
    chunk.group.add(obj);
    chunk.placed.push({ key, obj });
    return obj;
  }

  /** Return every prop in a chunk to the pool and drop the chunk group. */
  releaseChunk(chunk) {
    for (const { key, obj } of chunk.placed) {
      chunk.group.remove(obj);
      let list = this.pool.get(key);
      if (!list) this.pool.set(key, (list = []));
      list.push(obj);
    }
    this.group.remove(chunk.group);
  }

  // --- chunk lifecycle ----------------------------------------------------------

  reset() {
    for (const c of this.chunks) this.releaseChunk(c);
    this.chunks = [];
    this.debris = [];
    this.speed = START_SPEED;
    this.distance = 0;
    for (let i = 0; i < VISIBLE_CHUNKS; i++) this.spawnChunk(i < 2);
  }

  spawnChunk(safe) {
    const group = new THREE.Group();
    // Chain onto the tail chunk's CURRENT position so spacing stays exactly
    // one chunk forever (a fixed spawn coordinate drifts away from the moving
    // train and thins the world out over time).
    const tail = this.chunks[this.chunks.length - 1];
    group.position.z = tail ? tail.group.position.z - CHUNK_LEN : 10;

    const chunk = {
      group,
      placed: [],
      obstacles: [],
      coins: [],
      pickups: [],
      ramps: [],
      swayers: [],
    };
    this.buildRoadDetail(chunk);
    this.buildScenery(chunk);
    if (!safe) this.buildPattern(chunk);

    this.group.add(group);
    this.chunks.push(chunk);
  }

  buildRoadDetail(chunk) {
    for (let z = -2; z > -CHUNK_LEN; z -= 4) {
      for (const x of [-1.5, 1.5]) {
        const dash = this.take(chunk, 'dash', () => {
          const d = new THREE.Mesh(dashGeo, dashMat);
          d.rotation.x = -Math.PI / 2;
          return d;
        });
        dash.position.set(x, 0.02, z);
      }
    }
  }

  buildScenery(chunk) {
    const { buildings, trees, fountain, flag, grassTufts, forest, tents } = this.assets;
    const place = (key, proto, x, z, rotY = Math.random() * Math.PI * 2) => {
      const obj = this.take(chunk, key, () => proto.clone());
      obj.position.set(x, 0, z);
      obj.rotation.set(0, rotY, 0);
      return obj;
    };
    const sway = (obj, amp, speed) =>
      chunk.swayers.push({ obj, amp, speed, phase: Math.random() * Math.PI * 2 });

    for (const side of [-1, 1]) {
      // Verge between sidewalk and frontage road: lampposts, flags, grass.
      for (const z of [-5, -20]) {
        const post = this.take(chunk, `lamp${side}`, () => makeLamppost(side));
        post.position.set(side * 6.15, 0, z);
      }
      if (Math.random() < 0.55) {
        const f = place('flag', flag, side * 6.15, -(10 + Math.random() * 6), 0);
        sway(f, 0.12, 3);
      }
      for (let i = 0; i < 4; i++) {
        const ti = (Math.random() * grassTufts.length) | 0;
        place(
          `tuft${ti}`,
          grassTufts[ti],
          side * (5.6 + Math.random() * 0.9),
          -Math.random() * CHUNK_LEN
        );
      }

      // Mid zone past the frontage road: parks, camps, plazas, trees.
      for (const z of [-7, -23]) {
        const x = side * (9.6 + Math.random() * 1.6);
        const r = Math.random();
        if (r < 0.14) {
          place('fountain', fountain, x, z);
          const fl = place('flag', flag, x + side * 1.8, z + 1.8, 0);
          sway(fl, 0.12, 3);
        } else if (r < 0.3) {
          place('tents', tents, x, z + 10 * Math.random() - 5);
        } else if (r < 0.48) {
          place('forest', forest, x, z);
        } else if (r < 0.85) {
          const ti = (Math.random() * trees.length) | 0;
          const t = place(`tree${ti}`, trees[ti], x, z);
          sway(t, 0.025, 1.4);
        }
      }

      // Skyline row: buildings, sometimes two deep.
      for (let i = 0; i < 3; i++) {
        const z = -(4 + i * 9 + Math.random() * 4);
        const bi = (Math.random() * buildings.length) | 0;
        place(
          `bldg${bi}`,
          buildings[bi],
          side * (12 + Math.random() * 2),
          z,
          (Math.PI / 2) * ((Math.random() * 4) | 0)
        );
        if (Math.random() < 0.4) {
          const b2 = (Math.random() * buildings.length) | 0;
          place(
            `bldg${b2}`,
            buildings[b2],
            side * (15.5 + Math.random() * 3),
            z + 3,
            (Math.PI / 2) * ((Math.random() * 4) | 0)
          );
        }
      }

      // The odd tree out on the far grass.
      if (Math.random() < 0.5) {
        const ti = (Math.random() * trees.length) | 0;
        const t = place(
          `tree${ti}`,
          trees[ti],
          side * (19 + Math.random() * 8),
          -Math.random() * CHUNK_LEN
        );
        sway(t, 0.025, 1.2);
      }
    }
  }

  // --- obstacle helpers ------------------------------------------------------

  /** Generic static prop obstacle standing on the road. */
  addProp(chunk, key, proto, lane, z, opts = {}) {
    const obj = this.take(chunk, key, () => proto.clone());
    obj.position.set(LANES[lane], opts.hover ?? 0, z);
    obj.rotation.set(0, 0, 0);
    const half = proto.userData.half;
    chunk.obstacles.push({
      obj,
      x: LANES[lane],
      y: (opts.hover ?? 0) + half.y,
      z,
      half: new THREE.Vector3(Math.min(half.x, 1.15), half.y, half.z),
      speed: 0,
      ...opts.extra,
    });
    return obj;
  }

  /** Vehicles drive slowly toward the player. */
  addVehicle(chunk, key, proto, lane, z, speed) {
    const obj = this.take(chunk, key, () => cloneVehicle(proto));
    obj.position.set(LANES[lane], 0, z);
    obj.rotation.set(0, 0, 0);
    const half = proto.userData.half;
    chunk.obstacles.push({
      obj,
      x: LANES[lane],
      y: half.y,
      z,
      half: new THREE.Vector3(Math.min(half.x, 1.1), half.y, half.z),
      speed,
    });
  }

  addTruck(chunk, lane, z) {
    const i = (Math.random() * this.assets.trucks.length) | 0;
    this.addVehicle(chunk, `truck${i}`, this.assets.trucks[i], lane, z, 3.2);
  }

  addBike(chunk, lane, z) {
    this.addVehicle(chunk, 'bike', this.assets.motorcycle, lane, z, 4.5);
  }

  /** Flying enemy hovering at head height — slide under it. */
  addEnemy(chunk, lane, z) {
    const obj = this.addProp(chunk, 'enemy', this.assets.enemy, lane, z, {
      hover: 1.15,
      extra: { bob: true, baseY: 1.15, phase: Math.random() * Math.PI * 2 },
    });
    obj.rotation.y = Math.PI;
  }

  addBricks(chunk, lane, z) {
    this.addProp(chunk, 'bricks', this.assets.bricks, lane, z);
  }

  addCones(chunk, lane, z) {
    const obj = this.take(chunk, 'cones', makeConeRow);
    obj.position.set(LANES[lane], 0, z);
    obj.rotation.set(0, 0, 0);
    chunk.obstacles.push({
      obj,
      x: LANES[lane],
      y: 0.33,
      z,
      half: new THREE.Vector3(1.15, 0.33, 0.3),
      speed: 0,
    });
  }

  addGantry(chunk, z) {
    const beam = this.take(chunk, 'beam', () => {
      const b = new THREE.Mesh(beamGeo, beamMat);
      b.castShadow = true;
      return b;
    });
    beam.position.set(0, 1.35, z);
    beam.rotation.set(0, 0, 0);
    for (const side of [-1, 1]) {
      const post = this.take(chunk, 'gpost', () => {
        const p = new THREE.Mesh(postGeo, postMat);
        p.castShadow = true;
        return p;
      });
      post.position.set(side * (ROAD_W / 2 + 0.2), 0.8, z);
    }
    // The beam is what a boulder smash sends flying; the posts stay up.
    chunk.obstacles.push({
      obj: beam,
      x: 0,
      y: 1.35,
      z,
      half: new THREE.Vector3(ROAD_W / 2, 0.25, 0.2),
    });
  }

  addRamp(chunk, lane, zNear) {
    const mesh = this.take(chunk, 'ramp', makeRamp);
    mesh.position.set(LANES[lane], 0.01, zNear);
    chunk.ramps.push({ laneX: LANES[lane], zNear, len: RAMP_LEN, h: RAMP_H });

    // Reward arc past the ramp lip.
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      this.addCoin(
        chunk,
        LANES[lane],
        zNear - RAMP_LEN - 1.5 - i * 1.7,
        RAMP_H + 0.6 - t * (RAMP_H - 0.3)
      );
    }
  }

  addPickup(chunk, type, lane, z) {
    const obj = this.take(
      chunk,
      type === 'spring' ? 'puSpring' : 'puBoulder',
      type === 'spring' ? makeSpringPickup : makeBoulderPickup
    );
    obj.position.set(LANES[lane], 1.0, z);
    obj.rotation.set(0, 0, 0);
    chunk.pickups.push({ mesh: obj, type, x: LANES[lane], y: 1.3, z, taken: false });
  }

  addCoin(chunk, x, z, y = 0.9) {
    const coin = this.take(chunk, 'coin', () => this.assets.coin.clone());
    coin.position.set(x, y, z);
    chunk.coins.push({ mesh: coin, x, y: y + 0.35, z, taken: false });
  }

  addCoinRow(chunk, lane, z, n = 4) {
    for (let i = 0; i < n; i++) this.addCoin(chunk, LANES[lane], z - i * 1.8);
  }

  // --- chunk patterns (each guarantees a survivable path) --------------------

  /**
   * Procedural chunk layout. Three obstacle rows per chunk; every non-safe
   * lane rolls its own obstacle from the full pool so types stay shuffled.
   * A "safe lane" thread runs through the rows, moving at most one lane per
   * row, which guarantees the chunk is always beatable.
   */
  buildPattern(chunk) {
    // Occasional ramp chunk: ramp lane stays clear so the launch is fair.
    if (Math.random() < 0.15) {
      const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
      this.addRamp(chunk, lanes[0], -6);
      this.addTruck(chunk, lanes[1], -16);
      if (Math.random() < 0.5) this.addBike(chunk, lanes[2], -12);
      this.addCones(chunk, lanes[2], -24);
      return;
    }

    // Safe-lane thread: shifts by at most one lane between rows.
    const safes = [(Math.random() * 3) | 0];
    for (let i = 1; i < 3; i++) {
      safes.push(
        THREE.MathUtils.clamp(safes[i - 1] + (((Math.random() * 3) | 0) - 1), 0, 2)
      );
    }

    // At most one full-width gantry per chunk, taking over a whole row.
    const gantryRow = Math.random() < 0.2 ? (Math.random() * 3) | 0 : -1;

    // Rare power-up, floated in the safe lane just ahead of a row.
    if (Math.random() < 0.14) {
      const i = (Math.random() * 3) | 0;
      this.addPickup(
        chunk,
        Math.random() < 0.5 ? 'spring' : 'boulder',
        safes[i],
        -(6 + i * 9) + 4.5
      );
    }

    for (let i = 0; i < 3; i++) {
      const z = -(6 + i * 9) + (Math.random() * 3 - 1.5);

      if (i === gantryRow) {
        this.addGantry(chunk, z);
        continue;
      }

      for (let lane = 0; lane < 3; lane++) {
        if (lane === safes[i]) {
          if (Math.random() < 0.55) this.addCoinRow(chunk, lane, z + 2, 3);
          continue;
        }
        if (Math.random() > 0.65) continue; // leave some gaps

        const r = Math.random();
        if (r < 0.3) {
          // Moving blocker: keep it out of neighboring rows' escape lanes,
          // since it creeps forward and could seal the safe path.
          const nearSafe = lane === safes[i - 1] || lane === safes[i + 1];
          if (nearSafe) this.addCones(chunk, lane, z);
          else this.addTruck(chunk, lane, z);
        } else if (r < 0.5) {
          this.addBike(chunk, lane, z);
        } else if (r < 0.7) {
          this.addEnemy(chunk, lane, z);
        } else if (r < 0.85) {
          this.addCones(chunk, lane, z);
        } else {
          this.addBricks(chunk, lane, z);
        }
      }
    }
  }

  // --- per-frame -------------------------------------------------------------

  update(dt) {
    this.speed = Math.min(MAX_SPEED, this.speed + ACCEL * dt);
    this.time += dt;
    const dz = this.speed * dt;
    this.distance += dz;

    for (const c of this.chunks) {
      c.group.position.z += dz;
      const gz = c.group.position.z;
      for (const coin of c.coins) {
        if (!coin.taken) coin.mesh.rotation.y += dt * 4;
      }
      for (const p of c.pickups) {
        if (!p.taken) {
          p.mesh.rotation.y += dt * 2.5;
          p.mesh.position.y = 1.0 + Math.sin(this.time * 2.5 + p.z) * 0.15;
          const halo = p.mesh.userData.halo;
          if (halo) {
            halo.scale.setScalar(
              halo.userData.baseScale * (1 + 0.12 * Math.sin(this.time * 3.5 + p.z))
            );
          }
        }
      }
      for (const s of c.swayers) {
        s.obj.rotation.z = Math.sin(this.time * s.speed + s.phase) * s.amp;
      }
      for (const o of c.obstacles) {
        if (o.speed) {
          // Oncoming vehicles creep toward the player, but brake when they
          // reach the back of a ramp in their lane instead of clipping through.
          let step = o.speed * dt;
          const frontWorld = gz + o.z + o.half.z;
          for (const c2 of this.chunks) {
            const g2 = c2.group.position.z;
            for (const r of c2.ramps) {
              if (Math.abs(r.laneX - o.x) > 1.6) continue;
              const backEdge = g2 + r.zNear - RAMP_LEN - 0.2;
              const gap = backEdge - frontWorld;
              if (gap >= 0) step = Math.min(step, gap);
              else if (gap > -(RAMP_LEN + 2 * o.half.z)) step = 0; // at the ramp
            }
          }
          o.z += step;
          o.obj.position.z = o.z;
          // Wheels turn with the vehicle's actual movement; parked = still.
          for (const w of o.obj.userData.wheels) w.rotation.x -= step * 2.5;
        } else if (o.bob) {
          o.obj.position.y = o.baseY + Math.sin(this.time * 3 + o.phase) * 0.15;
        }
      }
    }

    // Decorative traffic keeps its own pace relative to the world.
    for (const car of this.traffic) {
      car.position.z += (this.speed - this.speed * car.userData.drive) * dt;
      if (car.position.z > 18) car.position.z = -140 - Math.random() * 30;
      const spin = Math.abs(this.speed * car.userData.drive) * dt * 0.9;
      for (const w of car.userData.wheels) w.rotation.x -= spin;
    }

    // Balloons drift past slowly and bob on the breeze.
    for (const b of this.balloons) {
      b.position.z += dz * 0.08;
      b.position.y = b.userData.baseY + Math.sin(this.time * 0.7 + b.userData.phase) * 0.8;
      if (b.position.z > 20) b.position.z = -150;
    }

    // Smashed obstacles tumble away, then hide (pool reuse restores them).
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy -= 28 * dt;
      d.obj.position.y += d.vy * dt;
      d.obj.position.x += d.vx * dt;
      d.obj.rotation.x += 9 * dt;
      d.obj.rotation.z += 6 * dt;
      d.t -= dt;
      if (d.t <= 0) {
        d.obj.visible = false;
        this.debris.splice(i, 1);
      }
    }

    // Recycle chunks whose far edge has passed behind the camera.
    while (this.chunks.length && this.chunks[0].group.position.z - CHUNK_LEN > 18) {
      this.releaseChunk(this.chunks.shift());
      this.spawnChunk(false);
    }

    for (const cloud of this.clouds) {
      cloud.position.z += dz * 0.12;
      if (cloud.position.z > 10) cloud.position.z = -140;
    }
  }

  /** Ground height under the player (0 except on a ramp in their lane). */
  groundHeightAt(px) {
    for (const c of this.chunks) {
      const gz = c.group.position.z;
      if (gz < -10 || gz > CHUNK_LEN + 10) continue;
      for (const r of c.ramps) {
        if (Math.abs(px - r.laneX) > RAMP_W / 2 + 0.2) continue;
        const progressed = gz + r.zNear; // 0 at ramp entry, len at the lip
        if (progressed >= 0 && progressed <= r.len) {
          return (progressed / r.len) * r.h;
        }
      }
    }
    return 0;
  }

  /** AABB test against nearby obstacles + coin pickup. */
  resolve(playerBox) {
    const result = { hit: false, coins: 0 };
    const pc = playerBox.getCenter(new THREE.Vector3());
    const ph = playerBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);

    for (const c of this.chunks) {
      const gz = c.group.position.z;
      if (gz < -6 || gz > CHUNK_LEN + 6) continue;

      for (const o of c.obstacles) {
        const oz = gz + o.z;
        if (Math.abs(oz) > 5) continue;
        if (
          Math.abs(pc.x - o.x) <= ph.x + o.half.x &&
          Math.abs(pc.y - o.y) <= ph.y + o.half.y &&
          Math.abs(pc.z - oz) <= ph.z + o.half.z
        ) {
          result.hit = true;
          if (!result.hitRef) result.hitRef = { chunk: c, o };
        }
      }

      for (const coin of c.coins) {
        if (coin.taken) continue;
        const cz = gz + coin.z;
        if (
          Math.abs(cz) < 0.8 &&
          Math.abs(pc.x - coin.x) < 1 &&
          Math.abs(pc.y - coin.y) < 1.2
        ) {
          coin.taken = true;
          coin.mesh.visible = false;
          result.coins++;
        }
      }

      for (const p of c.pickups) {
        if (p.taken) continue;
        const pz = gz + p.z;
        if (
          Math.abs(pz) < 0.9 &&
          Math.abs(pc.x - p.x) < 1.1 &&
          Math.abs(pc.y - p.y) < 1.4
        ) {
          p.taken = true;
          p.mesh.visible = false;
          result.power = p.type;
        }
      }
    }
    return result;
  }

  /** Boulder power: knock an obstacle flying instead of crashing into it. */
  smash(hitRef) {
    const { chunk, o } = hitRef;
    const idx = chunk.obstacles.indexOf(o);
    if (idx >= 0) chunk.obstacles.splice(idx, 1);
    if (o.obj) {
      this.debris.push({
        obj: o.obj,
        vy: 9 + Math.random() * 3,
        vx: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4),
        t: 0.9,
      });
    }
  }
}
