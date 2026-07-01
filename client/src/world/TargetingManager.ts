import Phaser from "phaser";
import { TILE_SIZE } from "../config/map";

export interface Targetable {
  id: string;
  targetType: "mob";
  name: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  tileX: number;
  tileY: number;
  container: Phaser.GameObjects.Container;
}

export interface TargetProfile {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
}

interface TargetingManagerOptions {
  onTargetChanged?: (target: TargetProfile | null) => void;
}

const TARGET_RETICLE_CORE_COLOR = 0xffe08a;
const TARGET_RETICLE_GLOW_START = 0xffb84a;
const TARGET_RETICLE_GLOW_END = 0xfff0bc;
const AUTO_ATTACK_RETICLE_CORE_COLOR = 0xff8a2a;
const AUTO_ATTACK_RETICLE_GLOW_START = 0xff6a1f;
const AUTO_ATTACK_RETICLE_GLOW_END = 0xff2f2f;
const TARGET_RETICLE_SIZE = TILE_SIZE + 1;
const TARGET_RETICLE_CORNER_LENGTH = 3;
const TARGET_RETICLE_PULSE_MS = 1_400;
const TARGET_RETICLE_GLOW_WIDTH = 2;
const TARGET_RETICLE_CORE_WIDTH = 1;

export class TargetingManager {
  private selectedTarget: Targetable | null = null;
  private reticle: Phaser.GameObjects.Graphics | null = null;
  private autoAttackActive = false;
  private onTargetChanged: (target: TargetProfile | null) => void;

  constructor(
    private scene: Phaser.Scene,
    options: TargetingManagerOptions = {},
  ) {
    this.onTargetChanged = options.onTargetChanged ?? (() => {});
    this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  update() {
    if (!this.selectedTarget) return;

    if (!this.selectedTarget.alive) {
      this.clearTarget();
      return;
    }

    this.drawTargetReticle();
  }

  selectTarget(target: Targetable) {
    if (!target.alive) return;

    this.selectedTarget = target;
    this.attachReticle(target);
    this.emitTargetProfile();
  }

  clearTarget() {
    if (!this.selectedTarget) return;

    this.selectedTarget = null;
    this.reticle?.destroy();
    this.reticle = null;
    this.onTargetChanged(null);
  }

  refreshTarget(target: Targetable) {
    if (this.selectedTarget?.id !== target.id || this.selectedTarget.targetType !== target.targetType) return;

    if (!target.alive) {
      this.clearTarget();
      return;
    }

    this.selectedTarget = target;
    this.emitTargetProfile();
    this.drawTargetReticle();
  }

  getTarget() {
    return this.selectedTarget?.alive ? this.selectedTarget : null;
  }

  setAutoAttackActive(active: boolean) {
    if (this.autoAttackActive === active) return;

    this.autoAttackActive = active;
    if (this.selectedTarget) this.drawTargetReticle();
  }

  private handlePointerDown = (_pointer: Phaser.Input.Pointer, gameObjects: Phaser.GameObjects.GameObject[]) => {
    if (gameObjects.length > 0) return;
    this.clearTarget();
  };

  private attachReticle(target: Targetable) {
    this.reticle?.destroy();
    this.reticle = this.scene.add.graphics();
    target.container.add(this.reticle);
    this.drawTargetReticle();
  }

  private emitTargetProfile() {
    if (!this.selectedTarget) {
      this.onTargetChanged(null);
      return;
    }

    this.onTargetChanged({
      id: this.selectedTarget.id,
      name: this.selectedTarget.name,
      hp: this.selectedTarget.hp,
      maxHp: this.selectedTarget.maxHp,
    });
  }

  private drawTargetReticle() {
    if (!this.reticle) return;

    const pulse = (Math.sin((this.scene.time.now / TARGET_RETICLE_PULSE_MS) * Math.PI * 2) + 1) / 2;
    const glowColor = this.autoAttackActive
      ? this.interpolateColor(AUTO_ATTACK_RETICLE_GLOW_START, AUTO_ATTACK_RETICLE_GLOW_END, pulse)
      : this.interpolateColor(TARGET_RETICLE_GLOW_START, TARGET_RETICLE_GLOW_END, pulse);
    const coreColor = this.autoAttackActive ? AUTO_ATTACK_RETICLE_CORE_COLOR : TARGET_RETICLE_CORE_COLOR;
    const glowAlpha = this.autoAttackActive
      ? Phaser.Math.Linear(0.36, 0.72, pulse)
      : Phaser.Math.Linear(0.24, 0.5, pulse);

    this.reticle.clear();
    this.strokeTargetReticle(TARGET_RETICLE_GLOW_WIDTH, glowColor, glowAlpha);
    this.strokeTargetReticle(TARGET_RETICLE_CORE_WIDTH, coreColor, 0.96);
  }

  private strokeTargetReticle(lineWidth: number, color: number, alpha: number) {
    if (!this.reticle) return;

    const halfSize = TARGET_RETICLE_SIZE / 2;
    const cornerLength = TARGET_RETICLE_CORNER_LENGTH;
    const left = -halfSize;
    const right = halfSize;
    const top = -halfSize;
    const bottom = halfSize;

    this.reticle.lineStyle(lineWidth, color, alpha);
    this.reticle.beginPath();
    this.reticle.moveTo(left, top + cornerLength);
    this.reticle.lineTo(left, top);
    this.reticle.lineTo(left + cornerLength, top);
    this.reticle.moveTo(right - cornerLength, top);
    this.reticle.lineTo(right, top);
    this.reticle.lineTo(right, top + cornerLength);
    this.reticle.moveTo(right, bottom - cornerLength);
    this.reticle.lineTo(right, bottom);
    this.reticle.lineTo(right - cornerLength, bottom);
    this.reticle.moveTo(left + cornerLength, bottom);
    this.reticle.lineTo(left, bottom);
    this.reticle.lineTo(left, bottom - cornerLength);
    this.reticle.strokePath();
  }

  private interpolateColor(from: number, to: number, progress: number) {
    const inverseProgress = 1 - progress;
    const red = Math.round(((from >> 16) & 0xff) * inverseProgress + ((to >> 16) & 0xff) * progress);
    const green = Math.round(((from >> 8) & 0xff) * inverseProgress + ((to >> 8) & 0xff) * progress);
    const blue = Math.round((from & 0xff) * inverseProgress + (to & 0xff) * progress);

    return Phaser.Display.Color.GetColor(red, green, blue);
  }

  private destroy = () => {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown);
    this.reticle?.destroy();
    this.reticle = null;
    this.selectedTarget = null;
  };
}
