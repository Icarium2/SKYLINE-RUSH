import * as THREE from 'three';

export const LANES = [-3, 0, 3];

const GRAVITY = 32;
const JUMP_SPEED = 11.5; // apex ≈ 2.1 units
const FAST_FALL = -22;
const LANE_LERP = 11;
const SLIDE_TIME = 0.75;

export class Player {
  constructor(assets, sfx) {
    this.sfx = sfx;
    this.root = new THREE.Group();
    this.model = assets.character.model;
    this.root.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const clip of assets.character.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    if (this.actions.jump) {
      this.actions.jump.setLoop(THREE.LoopOnce);
      this.actions.jump.clampWhenFinished = true;
    }

    this.reset();
  }

  reset() {
    this.mixer.stopAllAction();
    this.current = null;
    this.laneIdx = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.slideTimer = 0;
    this.superJumpTimer = 0;
    this.boulderCharges = 0;
    this.dead = false;
    this.model.scale.y = 1;
    this.model.rotation.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.play('walk', 0);
  }

  play(name, fade = 0.15) {
    const next = this.actions[name];
    if (!next || this.current === next) return;
    next.reset().fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  handle(action) {
    if (this.dead) return;
    switch (action) {
      case 'left':
        this.laneIdx = Math.max(0, this.laneIdx - 1);
        break;
      case 'right':
        this.laneIdx = Math.min(LANES.length - 1, this.laneIdx + 1);
        break;
      case 'jump':
        if (this.grounded) {
          this.slideTimer = 0;
          // √3 × launch speed ≈ 3× jump height.
          const empowered = this.superJumpTimer > 0;
          this.vy = empowered ? JUMP_SPEED * Math.sqrt(3) : JUMP_SPEED;
          this.grounded = false;
          this.play('jump', 0.08);
          if (empowered) this.sfx?.superBoing();
          else this.sfx?.boing();
        }
        break;
      case 'slide':
        if (this.grounded) {
          this.slideTimer = SLIDE_TIME;
        } else {
          this.vy = FAST_FALL; // slam down from a jump
        }
        this.sfx?.squish();
        break;
    }
  }

  update(dt, input, world) {
    if (!this.dead) {
      let action;
      while ((action = input.poll())) this.handle(action);
    }
    if (this.superJumpTimer > 0) this.superJumpTimer -= dt;

    // Lane movement with a lean into the turn.
    const targetX = LANES[this.laneIdx];
    const prevX = this.x;
    this.x += (targetX - this.x) * Math.min(1, LANE_LERP * dt);
    this.root.rotation.z = THREE.MathUtils.clamp((prevX - this.x) * 2.2, -0.35, 0.35);

    // Vertical physics against the (possibly ramped) ground.
    const groundY = world.groundHeightAt(this.x);
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= groundY && this.vy <= 0) {
      if (!this.grounded && !this.dead) this.play('walk', 0.12);
      this.y = groundY;
      this.vy = 0;
      this.grounded = true;
    } else if (this.y > groundY + 0.02) {
      this.grounded = false;
    }

    // Slide: squash the model while the timer runs.
    if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      this.model.scale.y += (0.48 - this.model.scale.y) * Math.min(1, 18 * dt);
      this.model.rotation.x += (-0.25 - this.model.rotation.x) * Math.min(1, 18 * dt);
    } else if (!this.dead) {
      this.model.scale.y += (1 - this.model.scale.y) * Math.min(1, 14 * dt);
      this.model.rotation.x += (0 - this.model.rotation.x) * Math.min(1, 14 * dt);
    }

    // Run cycle speed follows world speed.
    if (this.actions.walk) this.actions.walk.timeScale = world.speed / 5.5;

    this.root.position.set(this.x, this.y, 0);
    this.mixer.update(dt);
  }

  die() {
    this.dead = true;
    this.slideTimer = 0;
    this.play('idle', 0.1);
  }

  /** Tip the character over after a crash (called each frame while dead). */
  updateDeath(dt) {
    this.model.rotation.x = Math.max(this.model.rotation.x - 4 * dt, -Math.PI / 2);
    this.mixer.update(dt);
  }

  getBox(target = new THREE.Box3()) {
    const sliding = this.slideTimer > 0;
    const h = sliding ? 0.8 : 1.5;
    return target.setFromCenterAndSize(
      new THREE.Vector3(this.x, this.y + h / 2, 0),
      new THREE.Vector3(0.7, h, 0.6)
    );
  }
}
