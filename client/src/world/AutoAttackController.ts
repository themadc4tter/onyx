import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { AutoAttackSlashEffect } from "./AutoAttackSlashEffect";
import type { Targetable } from "./TargetingManager";

interface AutoAttackControllerOptions {
  getTarget: () => Targetable | null;
  getLocalTilePosition: () => { tileX: number; tileY: number } | null;
  getLocalWorldPosition: () => { x: number; y: number } | null;
  isLocalPlayerMoving: () => boolean;
  onActiveChanged?: (active: boolean) => void;
}

const AUTO_ATTACK_WINDUP_MS = 1_000;
const AUTO_ATTACK_RANGE_TILES = 1;

export class AutoAttackController {
  private autoAttackKey: Phaser.Input.Keyboard.Key;
  private slashEffect: AutoAttackSlashEffect;
  private active = false;
  private windupStartedAt: number | null = null;
  private onActiveChanged: (active: boolean) => void;

  constructor(
    private scene: Phaser.Scene,
    private socket: Socket,
    private options: AutoAttackControllerOptions,
  ) {
    this.autoAttackKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.slashEffect = new AutoAttackSlashEffect(this.scene);
    this.onActiveChanged = options.onActiveChanged ?? (() => {});
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  update(inputBlocked: boolean) {
    if (!inputBlocked && Phaser.Input.Keyboard.JustDown(this.autoAttackKey)) {
      this.toggle();
    }

    this.updateAutoAttack();
  }

  private toggle() {
    if (this.active) {
      this.disable();
      return;
    }

    if (!this.options.getTarget()) return;
    this.active = true;
    this.onActiveChanged(true);
  }

  private disable() {
    if (!this.active && this.windupStartedAt === null) return;

    this.active = false;
    this.windupStartedAt = null;
    this.onActiveChanged(false);
  }

  private updateAutoAttack() {
    if (!this.active) return;

    const target = this.options.getTarget();
    if (!target) {
      this.disable();
      return;
    }

    if (this.options.isLocalPlayerMoving()) {
      this.windupStartedAt = null;
      return;
    }

    if (this.windupStartedAt !== null) {
      if (this.scene.time.now - this.windupStartedAt < AUTO_ATTACK_WINDUP_MS) return;

      this.performAutoAttack(target);
      this.windupStartedAt = null;
      return;
    }

    if (!this.isTargetInRange(target)) return;

    this.windupStartedAt = this.scene.time.now;
  }

  private performAutoAttack(target: Targetable) {
    if (!target.alive || !this.isTargetInRange(target)) return;

    const origin = this.options.getLocalWorldPosition();
    if (origin) {
      this.slashEffect.play(
        new Phaser.Math.Vector2(origin.x, origin.y),
        new Phaser.Math.Vector2(target.container.x, target.container.y),
      );
    }

    if (target.targetType === "mob") {
      this.socket.emit("mob:testDamage", { id: target.id });
    }
  }

  private isTargetInRange(target: Targetable) {
    const position = this.options.getLocalTilePosition();
    if (!position) return false;

    return (
      Math.abs(position.tileX - target.tileX) <= AUTO_ATTACK_RANGE_TILES &&
      Math.abs(position.tileY - target.tileY) <= AUTO_ATTACK_RANGE_TILES
    );
  }

  private destroy = () => {
    this.disable();
  };
}
