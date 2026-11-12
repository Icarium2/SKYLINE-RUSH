import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

function load(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

/**
 * Wraps a model in a group scaled to `targetHeight`, centered on x/z with its
 * base at y=0, and records collision half-extents in userData.half.
 * `longAxisZ` rotates vehicles so their length runs along the z axis.
 */
function prep(obj, targetHeight, { longAxisZ = false, faceCamera = false } = {}) {
  const group = new THREE.Group();
  let box = new THREE.Box3().setFromObject(obj);
  let size = box.getSize(new THREE.Vector3());

  if (longAxisZ && size.x > size.z) obj.rotation.y = Math.PI / 2;
  if (faceCamera) obj.rotation.y += Math.PI;

  box = new THREE.Box3().setFromObject(obj);
  size = box.getSize(new THREE.Vector3());
  const s = targetHeight / size.y;
  obj.scale.multiplyScalar(s);

  box = new THREE.Box3().setFromObject(obj);
  obj.position.x -= (box.min.x + box.max.x) / 2;
  obj.position.y -= box.min.y;
  obj.position.z -= (box.min.z + box.max.z) / 2;
  group.add(obj);

  group.userData.half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return group;
}

/** Googly eyes + beak so the flying enemy reads as a cheeky bird. The face
 *  goes on the -z side: obstacle placement turns the model 180° to look at
 *  the player. */
function addBirdFace(group) {
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const black = new THREE.MeshLambertMaterial({ color: 0x1d2430 });
  const orange = new THREE.MeshLambertMaterial({ color: 0xff9f1c });
  const eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const pupilGeo = new THREE.SphereGeometry(0.05, 8, 6);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, white);
    eye.position.set(sx * 0.16, 0.66, -0.3);
    const pupil = new THREE.Mesh(pupilGeo, black);
    pupil.position.set(sx * 0.16, 0.67, -0.38);
    group.add(eye, pupil);
  }

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 8), orange);
  beak.position.set(0, 0.5, -0.42);
  beak.rotation.x = -Math.PI / 2;
  group.add(beak);
}

export async function loadAssets() {
  const urls = {
    character: 'models/character/character.glb',
    coin: 'models/props/coin.glb',
    cloud: 'models/props/cloud.glb',
    truckGreen: 'models/vehicles/vehicle-truck-green.glb',
    truckPurple: 'models/vehicles/vehicle-truck-purple.glb',
    truckRed: 'models/vehicles/vehicle-truck-red.glb',
    truckYellow: 'models/vehicles/vehicle-truck-yellow.glb',
    motorcycle: 'models/vehicles/vehicle-motorcycle.glb',
    enemyFlying: 'models/fps-props/enemy-flying.glb',
    bricks: 'models/arena-props/bricks.glb',
    fountain: 'models/scenery/pavement-fountain.glb',
    flag: 'models/props/flag.glb',
    grassTuft: 'models/props/grass.glb',
    grassTuftSmall: 'models/props/grass-small.glb',
    forest: 'models/racing-props/decoration-forest.glb',
    tents: 'models/racing-props/decoration-tents.glb',
    buildingA: 'models/scenery/building-small-a.glb',
    buildingB: 'models/scenery/building-small-b.glb',
    buildingC: 'models/scenery/building-small-c.glb',
    buildingD: 'models/scenery/building-small-d.glb',
    garage: 'models/scenery/building-garage.glb',
    trees: 'models/scenery/grass-trees.glb',
    treesTall: 'models/scenery/grass-trees-tall.glb',
  };

  const entries = Object.entries(urls);
  const results = await Promise.all(entries.map(([, u]) => load(u)));
  const gltf = {};
  entries.forEach(([name], i) => (gltf[name] = results[i]));

  // Clouds sample a gray patch of the colormap; plain white reads better.
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  gltf.cloud.scene.traverse((o) => {
    if (o.isMesh) o.material = cloudMat;
  });

  const enemy = prep(gltf.enemyFlying.scene, 1.0);
  addBirdFace(enemy);

  return {
    // Character keeps its raw scene so the AnimationMixer can bind to it.
    character: {
      model: prep(gltf.character.scene, 1.6, { faceCamera: true }),
      animations: gltf.character.animations,
    },
    coin: prep(gltf.coin.scene, 0.7),
    cloud: prep(gltf.cloud.scene, 1.6),
    trucks: [
      prep(gltf.truckGreen.scene, 2.4, { longAxisZ: true }),
      prep(gltf.truckPurple.scene, 2.4, { longAxisZ: true }),
      prep(gltf.truckRed.scene, 2.4, { longAxisZ: true }),
      prep(gltf.truckYellow.scene, 2.4, { longAxisZ: true }),
    ],
    motorcycle: prep(gltf.motorcycle.scene, 1.0, { longAxisZ: true }),
    buildings: [
      prep(gltf.buildingA.scene, 5),
      prep(gltf.buildingB.scene, 5.5),
      prep(gltf.buildingC.scene, 6),
      prep(gltf.buildingD.scene, 5),
      prep(gltf.garage.scene, 4),
    ],
    trees: [prep(gltf.trees.scene, 3), prep(gltf.treesTall.scene, 4)],
    enemy,
    bricks: prep(gltf.bricks.scene, 0.5),
    fountain: prep(gltf.fountain.scene, 2.6),
    flag: prep(gltf.flag.scene, 2.4),
    grassTufts: [prep(gltf.grassTuft.scene, 0.4), prep(gltf.grassTuftSmall.scene, 0.3)],
    forest: prep(gltf.forest.scene, 3.6),
    tents: prep(gltf.tents.scene, 2.2),
  };
}
